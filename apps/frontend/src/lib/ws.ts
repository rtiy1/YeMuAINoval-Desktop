/**
 * WebSocket 客户端 — 连接后端 /ws 端点，收发 Agent 事件。
 *
 * 订阅会话后，后端会实时转发 MCode 子进程的 NDJSON 事件。
 */

import type { AgentEvent } from './types';

type EventHandler = (event: AgentEvent) => void;

class AgentSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private subscribedSessionId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as AgentEvent;
        this.handlers.forEach((h) => h(event));
      } catch {
        // 忽略非 JSON
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      // 自动重连（3 秒延迟）
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  /** 订阅某个 Agent 会话的事件，携带会话配置（model/effort/thinking/mode 等）。 */
  subscribe(
    agentSessionId: string,
    mcodeSessionId: string,
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
    },
  ): void {
    this.connect();
    this.subscribedSessionId = agentSessionId;
    const send = () => {
      this.ws?.send(
        JSON.stringify({ type: 'subscribe', agentSessionId, mcodeSessionId, config }),
      );
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      send();
    } else {
      this.ws?.addEventListener('open', send, { once: true });
    }
  }

  /** 发送消息到当前会话。 */
  send(opts: {
    agentSessionId: string;
    projectId: string;
    content: string;
    chapterId?: string | null;
    mentionedChapterIds?: string[];
    mentionedCharacterIds?: string[];
  }): void {
    this.ws?.send(JSON.stringify({ type: 'send', ...opts }));
  }

  /** 中断当前生成。 */
  interrupt(agentSessionId: string): void {
    this.ws?.send(JSON.stringify({ type: 'interrupt', agentSessionId }));
  }

  /** 注册事件处理器。 */
  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** 是否已连接。 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const agentSocket = new AgentSocket();
