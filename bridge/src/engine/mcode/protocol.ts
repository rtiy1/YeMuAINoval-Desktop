import type {
  AgentPromptInput,
  AgentTimelineItem,
  AgentUsage,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "../agent-sdk-types.js";

export interface MCodeContentBlock extends Record<string, unknown> {
  type: string;
}

export interface MCodeToolCallState {
  callId: string;
  name: string;
  input: Record<string, unknown>;
  detail: ToolCallDetail;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function getMCodeContentBlocks(message: Record<string, unknown>): MCodeContentBlock[] {
  const inner = isRecord(message.message) ? message.message : null;
  const content = inner?.content;
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(
    (block): block is MCodeContentBlock => isRecord(block) && typeof block.type === "string",
  );
}

export function convertPromptInput(prompt: AgentPromptInput): string | MCodeContentBlock[] {
  if (typeof prompt === "string") {
    return prompt;
  }

  return prompt.map((block) => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "image") {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: block.mimeType,
          data: block.data,
        },
      };
    }

    const attachment = block as unknown as Record<string, unknown>;
    const path = stringValue(attachment.path);
    const fileName = stringValue(attachment.fileName);
    return {
      type: "text",
      text: path
        ? `[Attached file${fileName ? ` ${fileName}` : ""}: ${path}]`
        : `[YeMu AI Novel attachment: ${JSON.stringify(attachment)}]`,
    };
  });
}

export function extractStreamDelta(message: Record<string, unknown>): AgentTimelineItem | null {
  const event = isRecord(message.event) ? message.event : null;
  if (event?.type !== "content_block_delta") {
    return null;
  }
  const delta = isRecord(event.delta) ? event.delta : null;
  const text = stringValue(delta?.text) ?? stringValue(delta?.thinking);
  if (!text) {
    return null;
  }
  return delta?.type === "thinking_delta"
    ? { type: "reasoning", text }
    : { type: "assistant_message", text };
}

export function extractMCodeUsage(message: Record<string, unknown>): AgentUsage | undefined {
  const usage = isRecord(message.usage) ? message.usage : null;
  const inputTokens = numberValue(usage?.input_tokens);
  const cachedInputTokens = numberValue(usage?.cache_read_input_tokens);
  const outputTokens = numberValue(usage?.output_tokens);
  const totalCostUsd = numberValue(message.total_cost_usd);
  if (
    inputTokens === undefined &&
    cachedInputTokens === undefined &&
    outputTokens === undefined &&
    totalCostUsd === undefined
  ) {
    return undefined;
  }
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalCostUsd,
  };
}

export function createMCodeToolCall(block: MCodeContentBlock): MCodeToolCallState | undefined {
  if (block.type !== "tool_use") {
    return undefined;
  }
  const callId = stringValue(block.id);
  const name = stringValue(block.name);
  if (!callId || !name) {
    return undefined;
  }
  const input = isRecord(block.input) ? block.input : {};
  return {
    callId,
    name,
    input,
    detail: mapToolDetail(name, input),
  };
}

export function runningToolCall(state: MCodeToolCallState): ToolCallTimelineItem {
  return {
    type: "tool_call",
    callId: state.callId,
    name: state.name,
    detail: state.detail,
    status: "running",
    error: null,
  };
}

export function settledToolCall(
  state: MCodeToolCallState,
  content: unknown,
  failed: boolean,
): ToolCallTimelineItem {
  const output = extractToolResultText(content);
  const detail = attachToolOutput(state.detail, output);
  if (failed) {
    return {
      type: "tool_call",
      callId: state.callId,
      name: state.name,
      detail,
      status: "failed",
      error: output || "MCode tool failed",
    };
  }
  return {
    type: "tool_call",
    callId: state.callId,
    name: state.name,
    detail,
    status: "completed",
    error: null,
  };
}

export function extractToolResultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return content == null ? "" : JSON.stringify(content);
  }
  return content
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (isRecord(entry) && typeof entry.text === "string") return entry.text;
      return JSON.stringify(entry);
    })
    .filter(Boolean)
    .join("\n");
}

type ToolDetailMapper = (input: Record<string, unknown>) => ToolCallDetail;

const mapShellTool: ToolDetailMapper = (input) => ({
  type: "shell",
  command: stringValue(input.command) ?? stringValue(input.script) ?? "",
  cwd: stringValue(input.cwd),
});

const mapReadTool: ToolDetailMapper = (input) => ({
  type: "read",
  filePath: stringValue(input.file_path) ?? stringValue(input.path) ?? "",
  offset: numberValue(input.offset),
  limit: numberValue(input.limit),
});

const mapEditTool: ToolDetailMapper = (input) => ({
  type: "edit",
  filePath: stringValue(input.file_path) ?? stringValue(input.path) ?? "",
  oldString: stringValue(input.old_string),
  newString: stringValue(input.new_string),
});

const mapWriteTool: ToolDetailMapper = (input) => ({
  type: "write",
  filePath: stringValue(input.file_path) ?? stringValue(input.path) ?? "",
  content: stringValue(input.content),
});

const mapSearchTool: ToolDetailMapper = (input) => ({
  type: "search",
  query: stringValue(input.pattern) ?? stringValue(input.query) ?? stringValue(input.glob) ?? "",
  toolName: "search",
});

const mapWebSearchTool: ToolDetailMapper = (input) => ({
  type: "search",
  query: stringValue(input.pattern) ?? stringValue(input.query) ?? stringValue(input.glob) ?? "",
  toolName: "web_search",
});

const mapFetchTool: ToolDetailMapper = (input) => ({
  type: "fetch",
  url: stringValue(input.url) ?? "",
  prompt: stringValue(input.prompt),
});

const TOOL_DETAIL_MAPPERS: Record<string, ToolDetailMapper> = {
  bash: mapShellTool,
  shell: mapShellTool,
  powershell: mapShellTool,
  read: mapReadTool,
  edit: mapEditTool,
  multiedit: mapEditTool,
  notebookedit: mapEditTool,
  write: mapWriteTool,
  grep: mapSearchTool,
  glob: mapSearchTool,
  search: mapSearchTool,
  websearch: mapWebSearchTool,
  webfetch: mapFetchTool,
  fetch: mapFetchTool,
};

function mapToolDetail(name: string, input: Record<string, unknown>): ToolCallDetail {
  const normalizedName = name.toLowerCase();
  const mapper = TOOL_DETAIL_MAPPERS[normalizedName];
  if (mapper) return mapper(input);
  if (normalizedName.includes("plan") && typeof input.plan === "string") {
    return { type: "plan", text: input.plan };
  }
  return { type: "unknown", input, output: null };
}

function attachToolOutput(detail: ToolCallDetail, output: string): ToolCallDetail {
  switch (detail.type) {
    case "shell":
      return { ...detail, output };
    case "read":
      return { ...detail, content: output || detail.content };
    case "fetch":
      return { ...detail, result: output };
    case "search":
      return { ...detail, content: output };
    case "sub_agent":
      return { ...detail, log: output || detail.log };
    case "plain_text":
      return { ...detail, text: output };
    case "unknown":
      return { ...detail, output };
    default:
      return detail;
  }
}
