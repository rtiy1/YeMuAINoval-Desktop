/**
 * 后端运行配置。
 *
 * 所有配置项优先读取环境变量，回退到安全默认值。
 * 桌面版通过 Electron 主进程注入 PORT / DATA_DIR 等环境变量。
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envStr(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw && raw.length > 0 ? raw : fallback;
}

/** 数据目录：存放 SQLite 数据库与 MCode 会话日志。 */
export const DATA_DIR = envStr(
  'YEMU_DATA_DIR',
  join(homedir(), '.yemu-ai-novel'),
);

/** SQLite 数据库文件路径。 */
export const DB_PATH = join(DATA_DIR, 'yemu.db');

/** HTTP 监听端口。 */
export const PORT = envInt('YEMU_PORT', 8787);

/** HTTP 监听地址。 */
export const HOST = envStr('YEMU_HOST', '127.0.0.1');

/** 前端构建产物目录（生产模式下由后端静态托管）。 */
export const FRONTEND_DIST = envStr(
  'YEMU_FRONTEND_DIST',
  join(process.cwd(), '..', 'frontend', 'dist'),
);

/** 是否处于开发模式。 */
export const IS_DEV = envStr('NODE_ENV', 'development') === 'development';

/** MCode 会话空闲超时（毫秒），超时后回收子进程。 */
export const MCODE_IDLE_TIMEOUT_MS = envInt('YEMU_MCODE_IDLE_TIMEOUT_MS', 30 * 60 * 1000);

export const config = {
  DATA_DIR,
  DB_PATH,
  PORT,
  HOST,
  FRONTEND_DIST,
  IS_DEV,
  MCODE_IDLE_TIMEOUT_MS,
} as const;
