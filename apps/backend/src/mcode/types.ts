/**
 * MCode NDJSON 流协议类型定义。
 *
 * 对齐 MCode stream-json 输出格式（packages/mcode/src/entrypoints/sdk/coreTypes.generated.ts）。
 * SDKMessage 在 MCode 中是宽松的 `{ type: string; [key: string]: unknown }`，
 * 这里收窄为我们关心的子集，便于前端渲染。
 */

// ---- MCode stdout 输出的 NDJSON 消息（子集） ----

/** 系统初始化消息 — 每轮首个事件，携带会话元数据。 */
export interface MCodeSystemInit {
  type: 'system';
  subtype: 'init';
  session_id: string;
  cwd: string;
  model: string;
  tools: string[];
  permissionMode: string;
  mcode_code_version: string;
  uuid: string;
}

/** 系统状态消息（含会话状态变更等）。 */
export interface MCodeSystemStatus {
  type: 'system';
  subtype: string;
  [key: string]: unknown;
}

/** 助手消息内容块。 */
export interface MCodeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

/** 助手消息 — LLM 输出（文本 / 工具调用 / 思考）。 */
export interface MCodeAssistantMessage {
  type: 'assistant';
  session_id?: string;
  parent_tool_use_id?: string | null;
  message: {
    id: string;
    role: 'assistant';
    content: MCodeContentBlock[];
    model?: string;
    stop_reason?: string;
  };
  uuid: string;
}

/** 流式增量事件 — 文本逐 token 流式输出。 */
export interface MCodeStreamEvent {
  type: 'stream_event';
  event: {
    type: 'content_block_delta' | 'content_block_start' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
    index?: number;
    delta?: {
      type: string;
      text?: string;
      partial_json?: string;
      stop_reason?: string;
    };
    content_block?: MCodeContentBlock;
    message?: { id?: string; model?: string };
  };
}

/** 结果消息 — 一轮对话结束。 */
export interface MCodeResult {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns';
  result: string;
  is_error: boolean;
  duration_ms: number;
  total_cost_usd?: number;
  session_id: string;
  num_turns: number;
}

/** 用户回显消息（--replay-user-messages 启用时）。 */
export interface MCodeUserEcho {
  type: 'user';
  session_id?: string;
  message: {
    role: 'user';
    content: string | unknown[];
  };
  uuid: string;
}

/** MCode 输出消息联合类型。 */
export type MCodeOutputMessage =
  | MCodeSystemInit
  | MCodeSystemStatus
  | MCodeAssistantMessage
  | MCodeStreamEvent
  | MCodeResult
  | MCodeUserEcho;

// ---- 发送给 MCode stdin 的 NDJSON 消息 ----

/** 用户消息 — 写入 MCode stdin 驱动一轮对话。 */
export interface MCodeUserInput {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  session_id?: string;
}

// ---- 经 WebSocket 转发给前端的归一化事件 ----

/** 发往前端的事件信封。 */
export interface AgentEvent {
  /** 事件类型（归一化后）。 */
  kind:
    | 'init' // 会话初始化
    | 'text_delta' // 文本增量流式
    | 'tool_use' // 工具调用开始
    | 'tool_result' // 工具结果
    | 'thinking' // 思考过程
    | 'assistant_done' // 一条助手消息完成
    | 'result' // 一轮对话结束
    | 'error' // 错误
    | 'status'; // 状态
  /** MCode 会话 ID。 */
  sessionId: string;
  /** 内部会话 ID（数据库中的 agent_session.id）。 */
  agentSessionId: string;
  /** 负载数据，结构取决于 kind。 */
  payload: unknown;
}
