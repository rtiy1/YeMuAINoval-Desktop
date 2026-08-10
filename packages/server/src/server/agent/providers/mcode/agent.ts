import { randomUUID } from "node:crypto";
import type { Logger } from "pino";

import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentCreateSessionOptions,
  AgentLaunchContext,
  AgentMode,
  AgentModelDefinition,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPersistenceHandle,
  AgentPromptInput,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeInfo,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  AgentTimelineItem,
  ProviderCatalog,
} from "../../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../../provider-launch-config.js";
import { isProviderCommandAvailable } from "../../provider-launch-config.js";
import { appendOrReplaceGrowingAssistantMessage, runProviderTurn } from "../provider-runner.js";
import {
  booleanValue,
  convertPromptInput,
  createMCodeToolCall,
  extractMCodeUsage,
  extractStreamDelta,
  getMCodeContentBlocks,
  isRecord,
  numberValue,
  runningToolCall,
  settledToolCall,
  stringValue,
  type MCodeToolCallState,
} from "./protocol.js";
import { MCodeRuntime, type MCodeRuntimeSession } from "./runtime.js";

export const MCODE_PROVIDER_ID = "mcode";

export const MCODE_MODES: AgentMode[] = [
  {
    id: "plan",
    label: "Plan",
    description: "Read and plan without changing the novel project",
  },
  {
    id: "default",
    label: "Always Ask",
    description: "Ask before MCode uses tools that need permission",
  },
  {
    id: "acceptEdits",
    label: "Accept Edits",
    description: "Automatically allow edits while keeping other permission checks",
  },
  {
    id: "bypassPermissions",
    label: "Full Access",
    description: "Run all MCode tools without permission prompts",
    isUnattended: true,
  },
];

const THINKING_OPTIONS = [
  { id: "off", label: "Off", description: "Disable extended thinking" },
  { id: "low", label: "Low", description: "Faster responses" },
  { id: "medium", label: "Medium", description: "Balanced reasoning", isDefault: true },
  { id: "high", label: "High", description: "Deeper reasoning" },
  { id: "max", label: "Max", description: "Maximum supported reasoning effort" },
];

export const MCODE_MODELS: AgentModelDefinition[] = [
  {
    provider: MCODE_PROVIDER_ID,
    id: "sonnet",
    label: "Sonnet",
    description: "Balanced MCode model alias",
    isDefault: true,
    thinkingOptions: THINKING_OPTIONS,
    defaultThinkingOptionId: "medium",
  },
  {
    provider: MCODE_PROVIDER_ID,
    id: "opus",
    label: "Opus",
    description: "Highest-capability MCode model alias",
    thinkingOptions: THINKING_OPTIONS,
    defaultThinkingOptionId: "medium",
  },
  {
    provider: MCODE_PROVIDER_ID,
    id: "haiku",
    label: "Haiku",
    description: "Fast MCode model alias",
  },
];

const MCODE_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: true,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
};

export interface MCodeRuntimeLike {
  startSession(input: Parameters<MCodeRuntime["startSession"]>[0]): MCodeRuntimeSession;
  resolveCommand(): [string, ...string[]];
}

export interface MCodeAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  runtime?: MCodeRuntimeLike;
}

export class MCodeAgentClient implements AgentClient {
  readonly provider = MCODE_PROVIDER_ID;
  readonly capabilities = MCODE_CAPABILITIES;
  private readonly runtime: MCodeRuntimeLike;

  constructor(private readonly options: MCodeAgentClientOptions) {
    this.runtime =
      options.runtime ??
      new MCodeRuntime({
        logger: options.logger,
        runtimeSettings: options.runtimeSettings,
      });
  }

  async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
    options?: AgentCreateSessionOptions,
  ): Promise<AgentSession> {
    const sessionId = randomUUID();
    const runtimeSession = this.runtime.startSession({
      config,
      launchContext,
      sessionId,
      persistSession: options?.persistSession !== false,
    });
    return new MCodeAgentSession({
      config,
      logger: this.options.logger,
      runtimeSession,
      sessionId,
    });
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    if (!overrides?.cwd) {
      throw new Error("MCode resume requires the persisted working directory");
    }
    const config: AgentSessionConfig = {
      provider: MCODE_PROVIDER_ID,
      cwd: overrides.cwd,
      ...overrides,
    };
    const resumeSessionId = handle.nativeHandle ?? handle.sessionId;
    const runtimeSession = this.runtime.startSession({
      config,
      launchContext,
      sessionId: handle.sessionId,
      resumeSessionId,
      persistSession: true,
    });
    return new MCodeAgentSession({
      config,
      logger: this.options.logger,
      runtimeSession,
      sessionId: handle.sessionId,
    });
  }

  async fetchCatalog(): Promise<ProviderCatalog> {
    return {
      models: MCODE_MODELS,
      modes: MCODE_MODES,
      defaultModeId: "default",
    };
  }

  async isAvailable(): Promise<boolean> {
    return isProviderCommandAvailable(this.options.runtimeSettings?.command, async () => {
      return this.runtime.resolveCommand()[0];
    });
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    return { diagnostic: `MCode command: ${this.runtime.resolveCommand().join(" ")}` };
  }
}

interface MCodeAgentSessionOptions {
  config: AgentSessionConfig;
  logger: Logger;
  runtimeSession: MCodeRuntimeSession;
  sessionId: string;
}

class MCodeAgentSession implements AgentSession {
  readonly provider = MCODE_PROVIDER_ID;
  readonly capabilities = MCODE_CAPABILITIES;
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private readonly pendingPermissions = new Map<string, AgentPermissionRequest>();
  private readonly toolCalls = new Map<string, MCodeToolCallState>();
  private activeTurnId: string | null = null;
  private currentModeId: string | null;
  private currentModel: string | null;
  private currentThinkingOptionId: string | null;
  private streamedAssistantText = false;
  private streamedReasoning = false;
  private threadStarted = false;
  private interruptRequested = false;
  private closed = false;

  constructor(private readonly options: MCodeAgentSessionOptions) {
    this.currentModeId = options.config.modeId ?? "default";
    this.currentModel = options.config.model ?? "sonnet";
    this.currentThinkingOptionId = options.config.thinkingOptionId ?? "medium";
    options.runtimeSession.onMessage((message) => this.handleMessage(message));
    options.runtimeSession.onExit(({ error }) => this.handleExit(error));
  }

  get id(): string {
    return this.options.sessionId;
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (nextPrompt, nextOptions) => this.startTurn(nextPrompt, nextOptions),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.options.sessionId,
      reduceFinalText: appendOrReplaceGrowingAssistantMessage,
    });
  }

  async startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.closed) {
      throw new Error("MCode session is closed");
    }
    if (this.activeTurnId) {
      throw new Error("An MCode turn is already active");
    }
    const turnId = randomUUID();
    this.activeTurnId = turnId;
    this.streamedAssistantText = false;
    this.streamedReasoning = false;
    this.interruptRequested = false;
    this.options.runtimeSession.send({
      type: "user",
      session_id: this.options.sessionId,
      message: {
        role: "user",
        content: convertPromptInput(prompt),
      },
      parent_tool_use_id: null,
      uuid: options?.clientMessageId ?? randomUUID(),
    });
    this.emit({ type: "turn_started", provider: this.provider, turnId });
    return { turnId };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    yield* [];
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return {
      provider: this.provider,
      sessionId: this.options.sessionId,
      model: this.currentModel,
      modeId: this.currentModeId,
      thinkingOptionId: this.currentThinkingOptionId,
    };
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return MCODE_MODES;
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentModeId;
  }

  async setMode(modeId: string): Promise<void> {
    if (!MCODE_MODES.some((mode) => mode.id === modeId)) {
      throw new Error(`Unknown MCode mode '${modeId}'`);
    }
    this.currentModeId = modeId;
    this.sendControlRequest({ subtype: "set_permission_mode", mode: modeId });
    this.emit({
      type: "mode_changed",
      provider: this.provider,
      currentModeId: modeId,
      availableModes: MCODE_MODES,
    });
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return [...this.pendingPermissions.values()];
  }

  async respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void> {
    const request = this.pendingPermissions.get(requestId);
    if (!request) {
      throw new Error(`Unknown MCode permission request '${requestId}'`);
    }
    const input = isRecord(request.input) ? request.input : {};
    const toolUseID = stringValue(request.metadata?.toolUseID);
    const permissionResult =
      response.behavior === "allow"
        ? {
            behavior: "allow",
            updatedInput: response.updatedInput ?? input,
            updatedPermissions: response.updatedPermissions ?? [],
            toolUseID,
          }
        : {
            behavior: "deny",
            message: response.message ?? "Denied by user",
            interrupt: response.interrupt,
            toolUseID,
          };
    this.options.runtimeSession.send({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: requestId,
        response: permissionResult,
      },
    });
    this.pendingPermissions.delete(requestId);
    this.emit({
      type: "permission_resolved",
      provider: this.provider,
      requestId,
      resolution: response,
      turnId: this.activeTurnId ?? undefined,
    });
  }

  describePersistence(): AgentPersistenceHandle {
    return {
      provider: this.provider,
      sessionId: this.options.sessionId,
      nativeHandle: this.options.sessionId,
    };
  }

  async interrupt(): Promise<void> {
    if (!this.activeTurnId) {
      return;
    }
    this.interruptRequested = true;
    this.sendControlRequest({ subtype: "interrupt" });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.sendControlRequest({ subtype: "end_session", reason: "paseo_session_closed" });
    await this.options.runtimeSession.close();
  }

  async setModel(modelId: string | null): Promise<void> {
    this.currentModel = modelId;
    this.sendControlRequest({ subtype: "set_model", model: modelId ?? "default" });
    this.emit({
      type: "model_changed",
      provider: this.provider,
      runtimeInfo: await this.getRuntimeInfo(),
    });
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    this.currentThinkingOptionId = thinkingOptionId;
    const tokensByOption: Record<string, number> = {
      off: 0,
      low: 2_048,
      medium: 8_192,
      high: 16_384,
      max: 32_768,
    };
    this.sendControlRequest({
      subtype: "set_max_thinking_tokens",
      max_thinking_tokens: thinkingOptionId ? (tokensByOption[thinkingOptionId] ?? null) : null,
    });
    this.emit({
      type: "thinking_option_changed",
      provider: this.provider,
      thinkingOptionId,
    });
  }

  private handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case "system":
        this.handleSystemMessage(message);
        break;
      case "stream_event":
        this.handleStreamEvent(message);
        break;
      case "assistant":
        this.handleAssistantMessage(message);
        break;
      case "user":
        this.handleUserMessage(message);
        break;
      case "control_request":
        this.handleControlRequest(message);
        break;
      case "result":
        this.handleResult(message);
        break;
    }
  }

  private handleSystemMessage(message: Record<string, unknown>): void {
    if (message.subtype === "init" && !this.threadStarted) {
      this.threadStarted = true;
      this.currentModel = stringValue(message.model) ?? this.currentModel;
      this.currentModeId = stringValue(message.permissionMode) ?? this.currentModeId;
      this.emit({
        type: "thread_started",
        provider: this.provider,
        sessionId: stringValue(message.session_id) ?? this.options.sessionId,
      });
      return;
    }
    if (message.subtype === "status") {
      const mode = stringValue(message.permissionMode);
      if (mode && mode !== this.currentModeId) {
        this.currentModeId = mode;
        this.emit({
          type: "mode_changed",
          provider: this.provider,
          currentModeId: mode,
          availableModes: MCODE_MODES,
        });
      }
    }
  }

  private handleStreamEvent(message: Record<string, unknown>): void {
    const item = extractStreamDelta(message);
    if (!item) return;
    if (item.type === "assistant_message") this.streamedAssistantText = true;
    if (item.type === "reasoning") this.streamedReasoning = true;
    this.emitTimeline(item);
  }

  private handleAssistantMessage(message: Record<string, unknown>): void {
    const inner = isRecord(message.message) ? message.message : {};
    const messageId = stringValue(inner.id) ?? stringValue(message.uuid);
    for (const block of getMCodeContentBlocks(message)) {
      if (block.type === "text" && !this.streamedAssistantText) {
        const text = stringValue(block.text);
        if (text) this.emitTimeline({ type: "assistant_message", text, messageId });
        continue;
      }
      if (block.type === "thinking" && !this.streamedReasoning) {
        const text = stringValue(block.thinking);
        if (text) this.emitTimeline({ type: "reasoning", text });
        continue;
      }
      const toolCall = createMCodeToolCall(block);
      if (toolCall) {
        this.toolCalls.set(toolCall.callId, toolCall);
        this.emitTimeline(runningToolCall(toolCall));
      }
    }
  }

  private handleUserMessage(message: Record<string, unknown>): void {
    for (const block of getMCodeContentBlocks(message)) {
      if (block.type !== "tool_result") continue;
      const callId = stringValue(block.tool_use_id);
      if (!callId) continue;
      const state = this.toolCalls.get(callId);
      if (!state) continue;
      this.emitTimeline(
        settledToolCall(state, block.content, booleanValue(block.is_error) === true),
      );
      this.toolCalls.delete(callId);
    }
  }

  private handleControlRequest(message: Record<string, unknown>): void {
    const requestId = stringValue(message.request_id);
    const rawRequest = isRecord(message.request) ? message.request : null;
    if (!requestId || rawRequest?.subtype !== "can_use_tool") {
      return;
    }
    const name = stringValue(rawRequest.tool_name) ?? "MCode tool";
    const input = isRecord(rawRequest.input) ? rawRequest.input : {};
    const toolUseID = stringValue(rawRequest.tool_use_id);
    const toolCall = toolUseID ? this.toolCalls.get(toolUseID) : undefined;
    const suggestions = Array.isArray(rawRequest.permission_suggestions)
      ? rawRequest.permission_suggestions.filter(isRecord)
      : undefined;
    const request: AgentPermissionRequest = {
      id: requestId,
      provider: this.provider,
      name,
      kind: "tool",
      title: `Allow ${name}?`,
      description: describePermissionReason(rawRequest.decision_reason),
      input,
      detail: toolCall?.detail,
      suggestions,
      actions: [
        { id: "allow", label: "Allow", behavior: "allow", variant: "primary" },
        { id: "deny", label: "Deny", behavior: "deny", variant: "danger" },
      ],
      metadata: { toolUseID },
    };
    this.pendingPermissions.set(requestId, request);
    this.emit({
      type: "permission_requested",
      provider: this.provider,
      request,
      turnId: this.activeTurnId ?? undefined,
    });
  }

  private handleResult(message: Record<string, unknown>): void {
    const turnId = this.activeTurnId;
    if (!turnId) return;
    const usage = extractMCodeUsage(message);
    const failed = booleanValue(message.is_error) === true;
    if (this.interruptRequested) {
      this.emit({
        type: "turn_canceled",
        provider: this.provider,
        reason: "Interrupted",
        turnId,
      });
    } else if (failed) {
      this.emit({
        type: "turn_failed",
        provider: this.provider,
        error: describeResultError(message),
        turnId,
      });
    } else {
      this.emit({ type: "turn_completed", provider: this.provider, usage, turnId });
    }
    this.activeTurnId = null;
    this.streamedAssistantText = false;
    this.streamedReasoning = false;
    this.interruptRequested = false;
  }

  private handleExit(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    if (this.activeTurnId) {
      this.emit({
        type: "turn_failed",
        provider: this.provider,
        error: error.message,
        turnId: this.activeTurnId,
      });
      this.activeTurnId = null;
    }
    this.options.logger.warn({ error }, "MCode runtime exited");
  }

  private sendControlRequest(request: Record<string, unknown>): void {
    this.options.runtimeSession.send({
      type: "control_request",
      request_id: randomUUID(),
      request,
    });
  }

  private emitTimeline(item: AgentTimelineItem): void {
    this.emit({
      type: "timeline",
      provider: this.provider,
      item,
      turnId: this.activeTurnId ?? undefined,
    });
  }

  private emit(event: AgentStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}

function describePermissionReason(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    const reason = stringValue(value.reason) ?? stringValue(value.message);
    return reason ?? JSON.stringify(value);
  }
  return undefined;
}

function describeResultError(message: Record<string, unknown>): string {
  if (Array.isArray(message.errors)) {
    const errors = message.errors.filter((value): value is string => typeof value === "string");
    if (errors.length > 0) return errors.join("\n");
  }
  return (
    stringValue(message.result) ??
    stringValue(message.subtype) ??
    `MCode turn failed${numberValue(message.duration_ms) ? ` after ${message.duration_ms}ms` : ""}`
  );
}
