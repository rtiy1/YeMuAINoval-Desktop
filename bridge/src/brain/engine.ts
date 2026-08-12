import type { Logger } from "pino";

import { MCodeAgentClient } from "../engine/mcode/agent.js";
import { MCodeRuntime } from "../engine/mcode/runtime.js";
import type {
  AgentPermissionRequest,
  AgentSession,
  AgentStreamEvent,
  AgentTimelineItem,
} from "../engine/agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../engine/provider-launch-config.js";
import { sendSse, type SSEClient } from "./sse.js";

/**
 * A "worker" in the workforce model: one named agent role backed by the
 * project's mcode session. v1 maps every worker to the same session with a
 * role-specific system prompt; multi-agent parallel execution is achieved by
 * spawning one mcode session per worker.
 */
export interface WorkerSpec {
  name: string;
  description: string;
  tools: string[];
  mcpServers?: Record<string, unknown>;
}

const DEFAULT_WORKER: WorkerSpec = {
  name: "Developer Agent",
  description: "Lead software engineer agent",
  tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"],
};

export interface EngineOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  runtime?: MCodeRuntime;
}

export class ProjectEngine {
  readonly client: MCodeAgentClient;
  private readonly sessions = new Map<string, AgentSession>();
  private readonly workers = new Map<string, WorkerSpec>();
  private readonly permissions = new Map<string, AgentPermissionRequest>();
  private sseClients = new Set<SSEClient>();

  constructor(options: EngineOptions) {
    this.client = new MCodeAgentClient({
      logger: options.logger,
      runtimeSettings: options.runtimeSettings,
      runtime: options.runtime,
    });
  }

  attachClient(client: SSEClient): void {
    this.sseClients.add(client);
    client.res.on("close", () => {
      this.sseClients.delete(client);
    });
  }

  emit(step: string, data: unknown): void {
    for (const client of this.sseClients) {
      sendSse(client, step, data);
    }
  }

  getWorkers(): WorkerSpec[] {
    return [...this.workers.values()];
  }

  addWorker(spec: WorkerSpec): void {
    this.workers.set(spec.name, spec);
  }

  resolveWorker(name: string): WorkerSpec {
    return this.workers.get(name) ?? DEFAULT_WORKER;
  }

  async createSession(
    config: Parameters<MCodeAgentClient["createSession"]>[0],
    launchContext?: Parameters<MCodeAgentClient["createSession"]>[1],
  ): Promise<AgentSession> {
    const session = await this.client.createSession(config, launchContext);
    this.sessions.set(String(session.id), session);
    session.subscribe((event) => this.handleEvent(event));
    return session;
  }

  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
  }

  getPendingPermission(requestId: string): AgentPermissionRequest | null {
    return this.permissions.get(requestId) ?? null;
  }

  getPendingPermissionRequestId(): string | null {
    const first = this.permissions.keys().next();
    return first.done ? null : first.value;
  }

  async respondToPermission(
    session: AgentSession,
    requestId: string,
    response: { allow: boolean; message?: string },
  ): Promise<void> {
    const request = this.permissions.get(requestId);
    if (!request) {
      return;
    }
    await session.respondToPermission(requestId, {
      behavior: response.allow ? "allow" : "deny",
      message: response.message,
    });
    this.permissions.delete(requestId);
  }

  private handleEvent(event: AgentStreamEvent): void {
    switch (event.type) {
      case "thread_started":
        this.emit("notice", {
          notice: `Session started: ${event.sessionId}`,
        });
        break;
      case "timeline":
        this.handleTimeline(event.item);
        break;
      case "permission_requested":
        this.permissions.set(event.request.id, event.request);
        this.emit("ask", {
          agent: workerDisplayName(event.request.name),
          content: `Allow ${event.request.name}? ${event.request.description ?? ""}`,
        });
        break;
      case "permission_resolved":
        this.emit("notice", {
          notice: `Permission ${event.resolution.behavior === "allow" ? "allowed" : "denied"}: ${event.requestId}`,
        });
        break;
      case "turn_completed":
        break;
      case "turn_failed":
        this.emit("error", {
          message: event.error,
        });
        break;
      case "turn_canceled":
        this.emit("error", {
          message: event.reason ?? "Turn canceled",
        });
        break;
      case "mode_changed":
        break;
      default:
        break;
    }
  }

  private handleTimeline(item: AgentTimelineItem): void {
    switch (item.type) {
      case "assistant_message":
        this.emit("decompose_text", { content: item.text });
        break;
      case "reasoning":
        break;
      case "tool_call":
        break;
      default:
        break;
    }
  }
}

function workerDisplayName(toolName: string): string {
  return toolName === "TodoWrite" ? "Developer Agent" : toolName;
}
