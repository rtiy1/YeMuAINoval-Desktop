import pino from "pino";
import { describe, expect, test } from "vitest";

import type { AgentSession, AgentSessionConfig, AgentStreamEvent } from "../../agent-sdk-types.js";
import { MCodeAgentClient, type MCodeRuntimeLike } from "./agent.js";
import type { MCodeRuntimeSession } from "./runtime.js";

class FakeMCodeRuntimeSession implements MCodeRuntimeSession {
  readonly sent: Record<string, unknown>[] = [];
  closed = false;
  private messageSubscriber: ((message: Record<string, unknown>) => void) | null = null;
  private exitSubscriber: Parameters<MCodeRuntimeSession["onExit"]>[0] | null = null;

  onMessage(callback: (message: Record<string, unknown>) => void): () => void {
    this.messageSubscriber = callback;
    return () => {
      if (this.messageSubscriber === callback) this.messageSubscriber = null;
    };
  }

  onExit(callback: Parameters<MCodeRuntimeSession["onExit"]>[0]): () => void {
    this.exitSubscriber = callback;
    return () => {
      if (this.exitSubscriber === callback) this.exitSubscriber = null;
    };
  }

  send(message: Record<string, unknown>): void {
    this.sent.push(message);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  emit(message: Record<string, unknown>): void {
    this.messageSubscriber?.(message);
  }
}

class FakeMCodeRuntime implements MCodeRuntimeLike {
  readonly session = new FakeMCodeRuntimeSession();
  readonly launches: Parameters<MCodeRuntimeLike["startSession"]>[0][] = [];

  startSession(input: Parameters<MCodeRuntimeLike["startSession"]>[0]): MCodeRuntimeSession {
    this.launches.push(input);
    return this.session;
  }

  resolveCommand(): [string, ...string[]] {
    return ["node", "mcode.cjs"];
  }
}

function createConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    provider: "mcode",
    cwd: "C:\\novels\\demo",
    modeId: "default",
    model: "sonnet",
    ...overrides,
  };
}

async function createSession(): Promise<{
  runtime: FakeMCodeRuntime;
  session: AgentSession;
  events: AgentStreamEvent[];
}> {
  const runtime = new FakeMCodeRuntime();
  const client = new MCodeAgentClient({
    logger: pino({ level: "silent" }),
    runtime,
  });
  const session = await client.createSession(createConfig());
  const events: AgentStreamEvent[] = [];
  session.subscribe((event) => events.push(event));
  return { runtime, session, events };
}

describe("MCodeAgentClient", () => {
  test("maps streamed text, tools, results, and usage into YeMu AI Novel events", async () => {
    const { runtime, session, events } = await createSession();

    await session.startTurn("Draft the opening scene", { clientMessageId: "message-1" });
    expect(runtime.session.sent[0]).toMatchObject({
      type: "user",
      message: { role: "user", content: "Draft the opening scene" },
      uuid: "message-1",
    });

    runtime.session.emit({
      type: "system",
      subtype: "init",
      session_id: "native-session",
      model: "sonnet",
      permissionMode: "default",
    });
    runtime.session.emit({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "It was raining." },
      },
    });
    runtime.session.emit({
      type: "assistant",
      message: {
        id: "assistant-1",
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "Write",
            input: { file_path: "chapters/001.md", content: "It was raining." },
          },
        ],
      },
    });
    runtime.session.emit({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "saved",
          },
        ],
      },
    });
    runtime.session.emit({
      type: "result",
      subtype: "success",
      is_error: false,
      usage: { input_tokens: 12, output_tokens: 8, cache_read_input_tokens: 3 },
      total_cost_usd: 0.004,
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "thread_started", sessionId: "native-session" }),
        expect.objectContaining({
          type: "timeline",
          item: { type: "assistant_message", text: "It was raining." },
        }),
        expect.objectContaining({
          type: "timeline",
          item: expect.objectContaining({
            type: "tool_call",
            callId: "tool-1",
            status: "running",
          }),
        }),
        expect.objectContaining({
          type: "timeline",
          item: expect.objectContaining({
            type: "tool_call",
            callId: "tool-1",
            status: "completed",
          }),
        }),
        expect.objectContaining({
          type: "turn_completed",
          usage: {
            inputTokens: 12,
            outputTokens: 8,
            cachedInputTokens: 3,
            totalCostUsd: 0.004,
          },
        }),
      ]),
    );
  });

  test("round-trips MCode tool permission requests", async () => {
    const { runtime, session, events } = await createSession();
    await session.startTurn("Revise chapter one");

    runtime.session.emit({
      type: "control_request",
      request_id: "permission-1",
      request: {
        subtype: "can_use_tool",
        tool_name: "Edit",
        tool_use_id: "tool-1",
        input: { file_path: "chapters/001.md" },
        decision_reason: { reason: "MCode needs to revise the chapter" },
      },
    });

    expect(session.getPendingPermissions()).toEqual([
      expect.objectContaining({
        id: "permission-1",
        name: "Edit",
        title: "Allow Edit?",
      }),
    ]);

    await session.respondToPermission("permission-1", {
      behavior: "allow",
      updatedInput: { file_path: "chapters/001.md", approved: true },
    });

    expect(runtime.session.sent.at(-1)).toEqual({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "permission-1",
        response: {
          behavior: "allow",
          updatedInput: { file_path: "chapters/001.md", approved: true },
          updatedPermissions: [],
          toolUseID: "tool-1",
        },
      },
    });
    expect(session.getPendingPermissions()).toEqual([]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "permission_requested" }),
        expect.objectContaining({ type: "permission_resolved", requestId: "permission-1" }),
      ]),
    );
  });

  test("resumes a persisted MCode session and closes its runtime", async () => {
    const runtime = new FakeMCodeRuntime();
    const client = new MCodeAgentClient({
      logger: pino({ level: "silent" }),
      runtime,
    });
    const session = await client.resumeSession(
      { provider: "mcode", sessionId: "paseo-session", nativeHandle: "native-session" },
      { cwd: "C:\\novels\\demo" },
    );

    expect(runtime.launches[0]).toMatchObject({
      sessionId: "paseo-session",
      resumeSessionId: "native-session",
      persistSession: true,
    });

    await session.close();
    expect(runtime.session.sent[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "end_session" },
    });
    expect(runtime.session.closed).toBe(true);
  });
});
