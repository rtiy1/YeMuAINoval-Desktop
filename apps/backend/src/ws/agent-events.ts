/**
 * WebSocket 事件桥 — 实时转发 MCode 事件到前端。
 *
 * 协议（前端 → 后端）：
 *   { type: 'subscribe', agentSessionId, mcodeSessionId }
 *   { type: 'send', agentSessionId, content, chapterId?, mentionedChapterIds?, mentionedCharacterIds? }
 *   { type: 'interrupt', agentSessionId }
 *
 * 协议（后端 → 前端）：
 *   { kind: 'init'|'text_delta'|'tool_use'|'result'|..., sessionId, agentSessionId, payload }
 *   { kind: 'error', payload: { message } }
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket as WsWebSocket } from 'ws';
import { eq, desc } from 'drizzle-orm';

import { getBridge, type SessionConfig } from '../mcode/bridge.js';
import { buildAgentMessage } from '../mcode/prompts.js';
import type { AgentEvent } from '../mcode/types.js';
import { getDb, schema } from '../db/index.js';

interface ClientMessage {
  type: 'subscribe' | 'send' | 'interrupt';
  agentSessionId?: string;
  mcodeSessionId?: string;
  projectId?: string;
  content?: string;
  chapterId?: string | null;
  mentionedChapterIds?: string[];
  mentionedCharacterIds?: string[];
  /** 会话配置（subscribe 时携带，控制 MCode 子进程的全部 CLI flags） */
  config?: {
    model?: string;
    effort?: 'low' | 'medium' | 'high' | 'max';
    thinking?: 'enabled' | 'adaptive' | 'disabled';
    permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
    allowedTools?: string[];
    disallowedTools?: string[];
    maxTurns?: number;
    maxBudgetUsd?: number;
    appendSystemPrompt?: string;
  };
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  const bridge = getBridge();

  // 注册全局事件处理器：广播给对应 agentSessionId 的订阅者
  const subscribers = new Map<string, Set<WsWebSocket>>();

  bridge.onEvent((event: AgentEvent) => {
    const subs = subscribers.get(event.agentSessionId);
    if (!subs) return;
    const data = JSON.stringify(event);
    for (const ws of subs) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  });

  app.get('/ws', { websocket: true }, (socket, req) => {
    // socket 即 ws.WebSocket 实例（Fastify @fastify/websocket 契约）
    const ws = socket as unknown as WsWebSocket;

    ws.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        ws.send(JSON.stringify({ kind: 'error', payload: { message: '无效的 JSON' } }));
        return;
      }

      switch (msg.type) {
        case 'subscribe': {
          if (!msg.agentSessionId) return;
          let subs = subscribers.get(msg.agentSessionId);
          if (!subs) {
            subs = new Set();
            subscribers.set(msg.agentSessionId, subs);
          }
          subs.add(ws);
          // 确保 MCode 子进程已启动，携带完整会话配置
          if (msg.mcodeSessionId) {
            // 从 settings 表读取写作风格指令，注入 --append-system-prompt
            const [styleRow] = await getDb()
              .select()
              .from(schema.settings)
              .where(eq(schema.settings.key, 'writing_style'));
            const writingStyle = styleRow?.value;

            const sessionConfig: SessionConfig = {
              mcodeSessionId: msg.mcodeSessionId,
              ...(msg.config?.model && { model: msg.config.model }),
              ...(msg.config?.effort && { effort: msg.config.effort }),
              ...(msg.config?.thinking && { thinking: msg.config.thinking }),
              ...(msg.config?.permissionMode && { permissionMode: msg.config.permissionMode }),
              ...(msg.config?.allowedTools && { allowedTools: msg.config.allowedTools }),
              ...(msg.config?.disallowedTools && { disallowedTools: msg.config.disallowedTools }),
              ...(msg.config?.maxTurns && { maxTurns: msg.config.maxTurns }),
              ...(msg.config?.maxBudgetUsd && { maxBudgetUsd: msg.config.maxBudgetUsd }),
              ...(writingStyle && { appendSystemPrompt: writingStyle }),
            };
            try {
              await bridge.ensureSession(msg.agentSessionId, sessionConfig);
            } catch (err) {
              ws.send(
                JSON.stringify({
                  kind: 'error',
                  payload: { message: `启动 Agent 失败: ${(err as Error).message}` },
                }),
              );
            }
          }
          break;
        }
        case 'send': {
          if (!msg.agentSessionId || !msg.content || !msg.projectId) return;
          try {
            // 持久化用户消息到 agent_messages 表
            const db = getDb();
            const [lastMsg] = await db
              .select()
              .from(schema.agentMessages)
              .where(eq(schema.agentMessages.agentSessionId, msg.agentSessionId))
              .orderBy(desc(schema.agentMessages.sortOrder))
              .limit(1);
            const nextSort = (lastMsg?.sortOrder ?? 0) + 1;
            await db.insert(schema.agentMessages).values({
              agentSessionId: msg.agentSessionId,
              role: 'user',
              content: msg.content,
              sortOrder: nextSort,
            });

            // 拼装上下文 + 用户消息
            const fullMessage = await buildAgentMessage({
              projectId: msg.projectId,
              chapterId: msg.chapterId ?? null,
              userMessage: msg.content,
              mentionedChapterIds: msg.mentionedChapterIds,
              mentionedCharacterIds: msg.mentionedCharacterIds,
            });
            await bridge.sendMessage(msg.agentSessionId, fullMessage);
          } catch (err) {
            ws.send(
              JSON.stringify({
                kind: 'error',
                payload: { message: `发送消息失败: ${(err as Error).message}` },
              }),
            );
          }
          break;
        }
        case 'interrupt': {
          if (msg.agentSessionId) bridge.interrupt(msg.agentSessionId);
          break;
        }
      }
    });

    ws.on('close', () => {
      // 清理该连接的所有订阅
      for (const [id, subs] of subscribers) {
        subs.delete(ws);
        if (subs.size === 0) subscribers.delete(id);
      }
    });
  });
}
