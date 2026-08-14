/**
 * 共享类型定义 — 前后端对齐的数据模型。
 */

export interface Project {
  id: string;
  title: string;
  description: string | null;
  wordCount: number;
  chapterCount: number;
  coverPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  projectId: string;
  volumeId: string;
  title: string;
  content: string;
  wordCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 章节列表项（不含正文 content，用于侧栏树）。 */
export interface ChapterListItem {
  id: string;
  projectId: string;
  volumeId: string;
  title: string;
  wordCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  profile: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorldInfoEntry {
  id: string;
  projectId: string;
  title: string;
  category: string | null;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSession {
  id: string;
  projectId: string;
  mcodeSessionId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type Settings = Record<string, string>;

// ---- Skills & Commands ----

export type SkillSource = 'bundled' | 'custom';
export type SkillCategory = 'writing' | 'memory' | 'debugging' | 'system' | 'code';

export interface SkillInfo {
  name: string;
  description: string;
  whenToUse?: string;
  argumentHint?: string;
  userInvocable: boolean;
  source: SkillSource;
  /** 是否受 ant/feature 限制（仅标注，前端展示锁定徽章）。 */
  restricted: boolean;
  category: SkillCategory;
}

export interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

// ---- Messages & Usage ----

/** 持久化的会话消息（从后端 REST 加载）。 */
export interface StoredMessage {
  id: string;
  agentSessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCallGroups?: Array<{ id: string; toolCalls: Array<{ id: string; name: string; input?: unknown }>; expanded: boolean }>;
  durationMs?: number;
  costUsd?: number;
  numTurns?: number;
  isError?: boolean;
  sortOrder: number;
  createdAt: string;
}

/** 会话使用量统计。 */
export interface SessionUsage {
  totalCostUsd: number;
  totalDurationMs: number;
  totalTurns: number;
  messageCount: number;
}

/** WebSocket 事件（后端 → 前端）。 */
export interface AgentEvent {
  kind:
    | 'init'
    | 'text_delta'
    | 'tool_use'
    | 'tool_result'
    | 'thinking'
    | 'assistant_done'
    | 'result'
    | 'error'
    | 'status';
  sessionId: string;
  agentSessionId: string;
  payload: unknown;
}
