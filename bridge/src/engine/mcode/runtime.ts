import type { Logger } from "pino";
import { getMCodeCommand } from "@yemu/mcode/runtime";

import type { AgentLaunchContext, AgentSessionConfig } from "../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { createProviderEnv } from "../provider-launch-config.js";
import { JsonlRpcProcess, type JsonlRpcExit } from "../jsonl-rpc-process.js";

export interface MCodeRuntimeSession {
  onMessage(callback: (message: Record<string, unknown>) => void): () => void;
  onExit(callback: (exit: JsonlRpcExit) => void): () => void;
  send(message: Record<string, unknown>): void;
  close(): Promise<void>;
}

export interface MCodeRuntimeLaunchInput {
  config: AgentSessionConfig;
  launchContext?: AgentLaunchContext;
  sessionId: string;
  resumeSessionId?: string;
  persistSession: boolean;
}

export interface MCodeRuntimeOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
}

export class MCodeRuntime {
  constructor(private readonly options: MCodeRuntimeOptions) {}

  startSession(input: MCodeRuntimeLaunchInput): MCodeRuntimeSession {
    const launch = buildMCodeLaunch({
      ...input,
      runtimeSettings: this.options.runtimeSettings,
    });
    const process = new JsonlRpcProcess({
      launch: {
        command: launch.command,
        args: launch.args,
        cwd: input.config.cwd,
        env: createProviderEnv({
          runtimeSettings: this.options.runtimeSettings,
          overlays: [input.launchContext?.env],
        }) as Record<string, string>,
      },
      logger: this.options.logger,
      diagnosticName: "MCode",
    });
    return {
      onMessage: (callback) => process.onMessage(callback),
      onExit: (callback) => process.onExit(callback),
      send: (message) => process.send(message),
      close: () => process.close(new Error("MCode session is closed")),
    };
  }

  resolveCommand(): [string, ...string[]] {
    const configured = this.options.runtimeSettings?.command;
    if (configured?.mode === "replace") {
      return configured.argv as [string, ...string[]];
    }
    const base = getMCodeCommand();
    if (configured?.mode === "append") {
      return [base[0], ...base.slice(1), ...(configured.args ?? [])];
    }
    return base;
  }
}

export interface BuildMCodeLaunchInput extends MCodeRuntimeLaunchInput {
  runtimeSettings?: ProviderRuntimeSettings;
}

export function buildMCodeLaunch(input: BuildMCodeLaunchInput): {
  command: string;
  args: string[];
} {
  const configured = input.runtimeSettings?.command;
  let command: string;
  let args: string[];
  if (configured?.mode === "replace") {
    [command, ...args] = configured.argv;
  } else {
    const base = getMCodeCommand();
    [command, ...args] = base;
    if (configured?.mode === "append") {
      args.push(...(configured.args ?? []));
    }
  }

  args.push(
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--replay-user-messages",
  );

  if (input.resumeSessionId) {
    args.push("--resume", input.resumeSessionId);
  } else {
    args.push("--session-id", input.sessionId);
  }
  if (!input.persistSession) {
    args.push("--no-session-persistence");
  }
  if (input.config.modeId) {
    args.push("--permission-mode", input.config.modeId);
  }
  if (input.config.model) {
    args.push("--model", input.config.model);
  }
  if (input.config.thinkingOptionId === "off") {
    args.push("--thinking", "disabled");
  } else if (input.config.thinkingOptionId) {
    args.push("--effort", input.config.thinkingOptionId);
  }
  if (input.config.title) {
    args.push("--name", input.config.title);
  }

  const systemPrompt = [input.config.systemPrompt, input.config.daemonAppendSystemPrompt]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
  if (systemPrompt) {
    args.push("--append-system-prompt", systemPrompt);
  }
  if (input.config.mcpServers && Object.keys(input.config.mcpServers).length > 0) {
    args.push("--mcp-config", JSON.stringify({ mcpServers: input.config.mcpServers }));
  }

  return { command, args };
}
