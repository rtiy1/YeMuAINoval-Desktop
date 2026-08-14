/**
 * SQLite 数据库初始化。
 *
 * 使用 better-sqlite3 同步驱动 + Drizzle ORM。
 * 启动时自动建表（IF NOT EXISTS），无需单独迁移步骤。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { config } from '../config.js';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

/** 确保数据目录存在。 */
function ensureDataDir(): void {
  if (!existsSync(dirname(config.DB_PATH))) {
    mkdirSync(dirname(config.DB_PATH), { recursive: true });
  }
}

/**
 * 初始化数据库并自动建表。
 * 必须在 Fastify 启动前调用一次。
 */
export function initDb(): void {
  ensureDataDir();

  const sqlite = new Database(config.DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // 自动建表（幂等）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      word_count INTEGER NOT NULL DEFAULT 0,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      cover_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS volumes (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES volumes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      profile TEXT,
      appearance TEXT,
      personality TEXT,
      backstory TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS world_info (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      mcode_session_id TEXT,
      title TEXT NOT NULL DEFAULT '新会话',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY NOT NULL,
      agent_session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      duration_ms INTEGER,
      cost_usd REAL,
      num_turns INTEGER,
      is_error INTEGER DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_volumes_project ON volumes(project_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id);
    CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
    CREATE INDEX IF NOT EXISTS idx_world_info_project ON world_info(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(agent_session_id);
  `);

  sqliteInstance = sqlite;
  dbInstance = drizzle(sqlite, { schema });
}

/** 获取 Drizzle 实例（必须在 initDb 之后调用）。 */
export function getDb() {
  if (!dbInstance) {
    throw new Error('数据库未初始化，请先调用 initDb()');
  }
  return dbInstance;
}

/** 获取原始 better-sqlite3 实例（用于批量操作或 PRAGMA）。 */
export function getSqlite() {
  if (!sqliteInstance) {
    throw new Error('数据库未初始化，请先调用 initDb()');
  }
  return sqliteInstance;
}

/** 关闭数据库连接。 */
export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

export { schema };
