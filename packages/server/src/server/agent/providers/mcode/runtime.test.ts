import { describe, expect, test } from "vitest";

import { buildMCodeLaunch } from "./runtime.js";

describe("buildMCodeLaunch", () => {
  test("builds the stream-json launch used by the desktop provider", () => {
    const launch = buildMCodeLaunch({
      config: {
        provider: "mcode",
        cwd: "C:\\novels\\demo",
        modeId: "acceptEdits",
        model: "sonnet",
        thinkingOptionId: "high",
        title: "雾都来信",
        systemPrompt: "You are a fiction-writing partner.",
        daemonAppendSystemPrompt: "Keep the story bible consistent.",
        mcpServers: {
          novel: { command: "node", args: ["novel-mcp.js"] },
        },
      },
      sessionId: "session-1",
      persistSession: false,
      runtimeSettings: {
        command: { mode: "replace", argv: ["bun", "entry.ts", "--base"] },
      },
    });

    expect(launch.command).toBe("bun");
    expect(launch.args).toEqual(
      expect.arrayContaining([
        "entry.ts",
        "--base",
        "--print",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--session-id",
        "session-1",
        "--no-session-persistence",
        "--permission-mode",
        "acceptEdits",
        "--model",
        "sonnet",
        "--effort",
        "high",
        "--name",
        "雾都来信",
        "--append-system-prompt",
        "You are a fiction-writing partner.\n\nKeep the story bible consistent.",
        "--mcp-config",
        JSON.stringify({
          mcpServers: { novel: { command: "node", args: ["novel-mcp.js"] } },
        }),
      ]),
    );
  });

  test("uses the native resume handle instead of creating a new session", () => {
    const launch = buildMCodeLaunch({
      config: { provider: "mcode", cwd: "C:\\novels\\demo" },
      sessionId: "paseo-session",
      resumeSessionId: "native-session",
      persistSession: true,
      runtimeSettings: {
        command: { mode: "replace", argv: ["bun", "entry.ts"] },
      },
    });

    expect(launch.args).toContain("--resume");
    expect(launch.args).toContain("native-session");
    expect(launch.args).not.toContain("--session-id");
    expect(launch.args).not.toContain("--no-session-persistence");
  });
});
