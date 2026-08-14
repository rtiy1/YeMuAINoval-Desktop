/**
 * Settings 路由 — KV 设置（模型 provider / api_key / base_url）。
 *
 * 设置采用 key-value 结构，前端读取后注入 MCode 环境。
 * 敏感字段（api_key）不做额外加密——本地 SQLite 已是私有数据。
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // ---- 读取全部设置 ----
  app.get('/api/settings', async () => {
    const db = getDb();
    const rows = await db.select().from(schema.settings);
    // 转为 { key: value } 对象
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return { data: settings };
  });

  // ---- 批量更新设置 ----
  app.put<{ Body: Record<string, string> }>('/api/settings', async (req) => {
    const db = getDb();
    const entries = Object.entries(req.body ?? {});
    for (const [key, value] of entries) {
      // upsert：不存在则插入
      const [existing] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, key));
      if (existing) {
        await db
          .update(schema.settings)
          .set({ value: String(value), updatedAt: new Date().toISOString() })
          .where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value: String(value) });
      }
    }
    return { data: req.body };
  });
}
