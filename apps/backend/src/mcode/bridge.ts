/**
 * MCodeBridge — MCode 子进程管理器。
 *
 * 这是整个项目最关键的胶水层：封装 MCode 的 NDJSON stdin/stdout 协议，
 * 将每个 Agent 会话映射到一个长驻 MCode 子进程。
 *
 * 契约（来自 packages/mcode 源码验证）：
 * - 启动：`bun run .../dev-entry.ts -p --input-format stream-json --output-format stream-json --verbose --session-id <uuid>`
 *   可选 flags: --model --effort --thinking --permission-mode --system-prompt
 *              --append-system-prompt --allowedTools --disallowedTools
 *              --max-turns --max-budget-usd --dangerously-skip-permissions
 * - stdin：写入 NDJSON `{ type: 'user', message: { role: 'user', content: string } }`
 * - stdout：逐行 NDJSON，type ∈ system|assistant|stream_event|result|user
 * - 中断：向子进程发送 SIGINT
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import type {
  AgentEvent,
  MCodeAssistantMessage,
  MCodeOutputMessage,
  MCodeResult,
  MCodeStreamEvent,
  MCodeSystemInit,
  MCodeUserInput,
} from './types.js';

// 通过 runtime.cjs 解析 MCode 启动命令（bun run .../dev-entry.ts）
const mcodeRuntime = await import('@yemu/mcode/runtime');
const getMCodeCommand: () => [string, ...string[]] =
  (mcodeRuntime as { getMCodeCommand: () => [string, ...string[]] }).getMCodeCommand;

/**
 * 会话配置 — 对应 MCode CLI flags。
 * 每个字段映射到 MCode 的一个 CLI 参数或环境变量。
 */
export interface SessionConfig {
  /** MCode 会话 UUID（--session-id）。 */
  mcodeSessionId: string;
  /** 模型名称（--model），如 claude-sonnet-4-20250514。 */
  model?: string;
  /** 努力等级（--effort）：low | medium | high | max。映射到思考强度选择器。 */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** 思考模式（--thinking）：enabled | adaptive | disabled。 */
  thinking?: 'enabled' | 'adaptive' | 'disabled';
  /** 权限模式（--permission-mode）：default | acceptEdits | plan | bypassPermissions。 */
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  /** 追加系统提示（--append-system-prompt）：写作上下文。 */
  appendSystemPrompt?: string;
  /** 允许的工具列表（--allowedTools）。 */
  allowedTools?: string[];
  /** 禁止的工具列表（--disallowedTools）。 */
  disallowedTools?: string[];
  /** 最大轮次（--max-turns）。 */
  maxTurns?: number;
  /** 最大花费上限美元（--max-budget-usd）。 */
  maxBudgetUsd?: number;
  /** 跳过所有权限检查（--dangerously-skip-permissions）。 */
  dangerouslySkipPermissions?: boolean;
}

/** 单个 MCode 会话的运行时句柄。 */
interface MCodeSession {
  process: ChildProcess;
  sessionId: string;
  agentSessionId: string;
  /** 当前是否正在生成（等待 result）。 */
  busy: boolean;
  /** stdout 缓冲的完整行解析器。 */
  rl: ReturnType<typeof createInterface>;
  /** 错误日志环形缓冲。 */
  stderrBuffer: string[];
  /** 当前轮次 assistant 文本内容缓冲（用于 result 时持久化）。 */
  contentBuffer: string;
  /** 当前轮次 tool 调用缓冲（用于 result 时持久化）。 */
  toolCallBuffer: Array<{ id: string; name: string; input?: unknown }>;
}

/** 事件回调。 */
export type AgentEventHandler = (event: AgentEvent) => void;

export class MCodeBridge {
  /** 活跃会话池：agentSessionId → session。 */
  private readonly sessions = new Map<string, MCodeSession>();
  /** 全局事件处理器。 */
  private handler: AgentEventHandler | null = null;

  /** 注册全局事件处理器（由 WebSocket 桥设置）。 */
  onEvent(handler: AgentEventHandler): void {
    this.handler = handler;
  }

  /** 启动（或复用）一个 MCode 会话。 */
  async ensureSession(
    agentSessionId: string,
    config: SessionConfig,
  ): Promise<void> {
    if (this.sessions.has(agentSessionId)) return;

    // 从设置表读取模型凭据，注入 MCode 子进程环境
    const mcodeEnv = await this.loadModelEnv();

    // 构建完整的 CLI 参数
    const args = this.buildArgs(config);

    const [cmd, ...baseArgs] = getMCodeCommand();

    // MCode 子进程必须在 mcode 包目录中运行，
    // 否则 pnpm 虚拟存储中的相对路径（../../src/...）无法解析。
    // baseArgs = ['run', '<path>/packages/mcode/src/dev-entry.ts']
    const entryPath = baseArgs.find((a) => a.endsWith('dev-entry.ts'));
    const mcodePkgDir = entryPath ? resolve(dirname(entryPath), '..', '..') : process.cwd();
    const cwd = existsSync(resolve(mcodePkgDir, 'package.json')) ? mcodePkgDir : process.cwd();

    const child = spawn(cmd, [...baseArgs, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...mcodeEnv },
      cwd,
    });

    const session: MCodeSession = {
      process: child,
      sessionId: config.mcodeSessionId,
      agentSessionId,
      busy: false,
      rl: createInterface({ input: child.stdout!, crlfDelay: Infinity }),
      stderrBuffer: [],
      contentBuffer: '',
      toolCallBuffer: [],
    };

    // 逐行解析 NDJSON stdout
    session.rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as MCodeOutputMessage;
        this.handleOutput(session, msg);
      } catch {
        // 非 JSON 行（如调试输出），忽略
      }
    });

    // stderr 环形缓冲（诊断用）
    child.stderr?.on('data', (chunk: Buffer) => {
      session.stderrBuffer.push(chunk.toString());
      if (session.stderrBuffer.length > 100) session.stderrBuffer.shift();
    });

    child.on('exit', (code, signal) => {
      this.sessions.delete(agentSessionId);
      this.emit(agentSessionId, 'status', {
        status: 'exited',
        code,
        signal,
        stderr: session.stderrBuffer.join(''),
      });
    });

    this.sessions.set(agentSessionId, session);
  }

  /** 向指定会话发送用户消息。 */
  async sendMessage(
    agentSessionId: string,
    content: string,
  ): Promise<void> {
    const session = this.sessions.get(agentSessionId);
    if (!session) {
      throw new Error(`会话 ${agentSessionId} 不存在或已退出`);
    }
    session.busy = true;
    // 清空上一轮的 assistant 内容缓冲
    session.contentBuffer = '';
    session.toolCallBuffer = [];
    const input: MCodeUserInput = {
      type: 'user',
      message: { role: 'user', content },
    };
    session.process.stdin?.write(JSON.stringify(input) + '\n');
  }

  /** 中断当前生成（SIGINT）。 */
  interrupt(agentSessionId: string): void {
    const session = this.sessions.get(agentSessionId);
    if (!session || !session.busy) return;
    session.process.kill('SIGINT');
    this.emit(agentSessionId, 'status', { status: 'interrupted' });
  }

  /** 终止并清理指定会话。 */
  disposeSession(agentSessionId: string): void {
    const session = this.sessions.get(agentSessionId);
    if (!session) return;
    session.rl.close();
    session.process.kill('SIGTERM');
    this.sessions.delete(agentSessionId);
  }

  /** 终止所有会话（应用退出时调用）。 */
  disposeAll(): void {
    for (const id of this.sessions.keys()) {
      this.disposeSession(id);
    }
  }

  /**
   * 从 settings 表加载模型凭据，组装为环境变量。
   * 使用 buildProviderEnv 根据 provider 类型注入正确的环境变量。
   */
  private async loadModelEnv(): Promise<Record<string, string>> {
    try {
      const { getDb, schema } = await import('../db/index.js');
      const db = getDb();
      const rows = await db.select().from(schema.settings);
      const settingsMap: Record<string, string> = {};
      for (const row of rows) settingsMap[row.key] = row.value;

      const { buildProviderEnv } = await import('./providers.js');
      return buildProviderEnv(settingsMap);
    } catch {
      // 设置表可能尚未初始化，静默跳过
      return {};
    }
  }

  /**
   * 持久化 assistant 消息到 agent_messages 表。
   * 在 result 事件时调用，把累积的 contentBuffer + toolCallBuffer 写入 DB。
   * 异步执行，不阻塞事件流。失败时静默跳过（不影响对话）。
   */
  private persistAssistantMessage(
    session: MCodeSession,
    result: { durationMs?: number; costUsd?: number; numTurns?: number; isError?: boolean },
  ): void {
    const content = session.contentBuffer.trim();
    if (!content && session.toolCallBuffer.length === 0) return;

    void (async () => {
      try {
        const { getDb, schema } = await import('../db/index.js');
        const { eq, desc } = await import('drizzle-orm');
        const db = getDb();

        // 获取当前 sortOrder
        const [lastMsg] = await db
          .select()
          .from(schema.agentMessages)
          .where(eq(schema.agentMessages.agentSessionId, session.agentSessionId))
          .orderBy(desc(schema.agentMessages.sortOrder))
          .limit(1);
        const nextSort = (lastMsg?.sortOrder ?? 0) + 1;

        // 序列化 toolCallBuffer 为 toolCallGroups JSON
        const toolCallGroups = session.toolCallBuffer.length > 0
          ? JSON.stringify([{
              id: `grp-${Date.now()}`,
              toolCalls: session.toolCallBuffer,
              expanded: false,
            }])
          : null;

        await db.insert(schema.agentMessages).values({
          agentSessionId: session.agentSessionId,
          role: 'assistant',
          content: content || '(无文本输出)',
          toolCalls: toolCallGroups,
          durationMs: result.durationMs,
          costUsd: result.costUsd,
          numTurns: result.numTurns,
          isError: result.isError ?? false,
          sortOrder: nextSort,
        });
      } catch {
        // DB 写入失败不影响对话流
      }
    })();
  }

  /**
   * 构建 MCode CLI 参数数组。
   * 每个 SessionConfig 字段映射到对应的 --flag。
   */
  private buildArgs(config: SessionConfig): string[] {
    const args: string[] = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--session-id', config.mcodeSessionId,
    ];

    // 模型
    if (config.model) {
      args.push('--model', config.model);
    }

    // 努力等级（对应思考强度选择器）
    if (config.effort) {
      args.push('--effort', config.effort);
    }

    // 思考模式
    if (config.thinking) {
      args.push('--thinking', config.thinking);
    }

    // 权限模式（对应 mode 选择器）
    if (config.permissionMode) {
      if (config.permissionMode === 'bypassPermissions') {
        args.push('--dangerously-skip-permissions');
      } else {
        args.push('--permission-mode', config.permissionMode);
      }
    }

    // 追加系统提示（写作上下文注入）
    if (config.appendSystemPrompt) {
      args.push('--append-system-prompt', config.appendSystemPrompt);
    }

    // 允许/禁止的工具
    if (config.allowedTools && config.allowedTools.length > 0) {
      args.push('--allowedTools', config.allowedTools.join(' '));
    }
    if (config.disallowedTools && config.disallowedTools.length > 0) {
      args.push('--disallowedTools', config.disallowedTools.join(' '));
    }

    // 最大轮次
    if (config.maxTurns) {
      args.push('--max-turns', String(config.maxTurns));
    }

    // 花费上限
    if (config.maxBudgetUsd) {
      args.push('--max-budget-usd', String(config.maxBudgetUsd));
    }

    return args;
  }

  /** 处理 MCode stdout 的单条 NDJSON 消息。 */
  private handleOutput(session: MCodeSession, msg: MCodeOutputMessage): void {
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          this.emit(
            session.agentSessionId,
            'init',
            this.normalizeInit(msg as MCodeSystemInit & { subtype: string }),
          );
        } else {
          this.emit(session.agentSessionId, 'status', msg);
        }
        break;
      }
      case 'assistant': {
        const m = msg as MCodeAssistantMessage;
        // 拆分内容块，分别发射事件 + 累积到缓冲
        for (const block of m.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            session.contentBuffer += block.text;
            this.emit(session.agentSessionId, 'text_delta', {
              text: block.text,
            });
          } else if (block.type === 'tool_use') {
            session.toolCallBuffer.push({
              id: block.id ?? '',
              name: block.name ?? '',
              input: block.input,
            });
            this.emit(session.agentSessionId, 'tool_use', {
              id: block.id,
              name: block.name,
              input: block.input,
            });
          } else if (block.type === 'thinking') {
            this.emit(session.agentSessionId, 'thinking', { text: block.text });
          }
        }
        this.emit(session.agentSessionId, 'assistant_done', { uuid: m.uuid });
        break;
      }
      case 'stream_event': {
        const ev = msg as MCodeStreamEvent;
        this.handleStreamEvent(session, ev);
        break;
      }
      case 'result': {
        const r = msg as MCodeResult;
        session.busy = false;
        const payload = {
          subtype: r.subtype,
          result: r.result,
          isError: r.is_error,
          durationMs: r.duration_ms,
          costUsd: r.total_cost_usd,
          numTurns: r.num_turns,
        };
        // 持久化 assistant 消息（异步，不阻塞事件流）
        this.persistAssistantMessage(session, payload);
        this.emit(session.agentSessionId, 'result', payload);
        break;
      }
      case 'user': {
        // replay 回显，忽略（前端已自行展示）
        break;
      }
      default: {
        this.emit(session.agentSessionId, 'status', msg);
      }
    }
  }

  /** 处理流式增量事件（逐 token 文本）。 */
  private handleStreamEvent(session: MCodeSession, ev: MCodeStreamEvent): void {
    const e = ev.event;
    if (e.type === 'content_block_delta' && e.delta?.text) {
      session.contentBuffer += e.delta.text;
      this.emit(session.agentSessionId, 'text_delta', { text: e.delta.text });
    } else if (e.type === 'content_block_start' && e.content_block) {
      if (e.content_block.type === 'tool_use') {
        session.toolCallBuffer.push({
          id: e.content_block.id ?? '',
          name: e.content_block.name ?? '',
          input: e.content_block.input,
        });
        this.emit(session.agentSessionId, 'tool_use', {
          id: e.content_block.id,
          name: e.content_block.name,
          input: e.content_block.input,
          streaming: true,
        });
      }
    }
  }

  /** 归一化 init 消息（提取关键字段）。 */
  private normalizeInit(msg: MCodeSystemInit): unknown {
    return {
      model: msg.model,
      cwd: msg.cwd,
      tools: msg.tools,
      permissionMode: msg.permissionMode,
      version: msg.mcode_code_version,
    };
  }

  /** 发射一个归一化事件。 */
  private emit(
    agentSessionId: string,
    kind: AgentEvent['kind'],
    payload: unknown,
  ): void {
    this.handler?.({
      kind,
      sessionId: this.sessions.get(agentSessionId)?.sessionId ?? '',
      agentSessionId,
      payload,
    });
  }
}

/** 全局单例。 */
let bridgeInstance: MCodeBridge | null = null;

export function getBridge(): MCodeBridge {
  if (!bridgeInstance) {
    bridgeInstance = new MCodeBridge();
  }
  return bridgeInstance;
}
