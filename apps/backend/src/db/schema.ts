/**
 * Drizzle ORM Schema — 夜幕 AI 小说桌面版数据模型。
 *
 * 对齐 OpenFic 精简版：项目 / 卷 / 章节 / 角色 / 世界观 / Agent 会话 / 设置。
 * 主键统一用 nanoid 字符串，时间戳存 ISO 字符串（SQLite 友好）。
 */

import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

const now = () => sql<string>`(datetime('now'))`;

/** 小说项目。 */
export const projects = sqliteTable('projects', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text('title').notNull(),
  description: text('description'),
  wordCount: integer('word_count').notNull().default(0),
  chapterCount: integer('chapter_count').notNull().default(0),
  coverPath: text('cover_path'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/** 卷（分卷）。每个项目创建时自动生成一个默认卷。 */
export const volumes = sqliteTable('volumes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/** 章节。 */
export const chapters = sqliteTable('chapters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  volumeId: text('volume_id')
    .notNull()
    .references(() => volumes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  wordCount: integer('word_count').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/** 角色档案。 */
export const characters = sqliteTable('characters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'), // 主角 / 配角 / 反派 ...
  profile: text('profile'), // 简介
  appearance: text('appearance'), // 外貌
  personality: text('personality'), // 性格
  backstory: text('backstory'), // 背景故事
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/** 世界观条目。 */
export const worldInfo = sqliteTable('world_info', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category'), // 地点 / 组织 / 物品 / 设定 ...
  content: text('content').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/**
 * Agent 会话 — 映射前端会话到 MCode 子进程 session UUID。
 * 每个项目可有多条会话；每条会话对应一个长驻 MCode 进程。
 */
export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  mcodeSessionId: text('mcode_session_id'), // MCode --session-id (UUID)
  title: text('title').notNull().default('新会话'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/** KV 设置表：模型 provider / api_key / base_url 等。 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(now),
});

/**
 * Agent 消息 — 持久化每个会话的对话历史。
 * 用户消息和助手消息都存于此表。
 * 助手消息附带 cost_usd / duration_ms / num_turns 统计数据。
 */
export const agentMessages = sqliteTable('agent_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  agentSessionId: text('agent_session_id')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON 序列化的 ToolCallGroup[]
  durationMs: integer('duration_ms'), // 仅 assistant
  costUsd: real('cost_usd'), // 仅 assistant
  numTurns: integer('num_turns'), // 仅 assistant
  isError: integer('is_error', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(now),
});

// ---- 类型导出 ----

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Volume = typeof volumes.$inferSelect;
export type NewVolume = typeof volumes.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type WorldInfoEntry = typeof worldInfo.$inferSelect;
export type NewWorldInfoEntry = typeof worldInfo.$inferInsert;
export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
export type Setting = typeof settings.$inferSelect;
