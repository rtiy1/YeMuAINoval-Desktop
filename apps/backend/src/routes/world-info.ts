/**
 * World Info 路由 — 世界观条目 CRUD。
 */

import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export async function worldInfoRoutes(app: FastifyInstance): Promise<void> {
  // ---- 按项目列出 ----
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/world-info',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.worldInfo)
        .where(eq(schema.worldInfo.projectId, req.params.projectId))
        .orderBy(asc(schema.worldInfo.sortOrder));
      return { data: rows };
    },
  );

  // ---- 详情 ----
  app.get<{ Params: { id: string } }>('/api/world-info/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.worldInfo)
      .where(eq(schema.worldInfo.id, req.params.id));
    if (!row) return reply.code(404).send({ error: '条目不存在' });
    return { data: row };
  });

  // ---- 创建 ----
  app.post<{ Params: { projectId: string }; Body: { title: string; category?: string; content?: string } }>(
    '/api/projects/:projectId/world-info',
    async (req, reply) => {
      const { title } = req.body ?? {};
      if (!title?.trim()) return reply.code(400).send({ error: '标题不能为空' });
      const db = getDb();
      const existing = await db
        .select()
        .from(schema.worldInfo)
        .where(eq(schema.worldInfo.projectId, req.params.projectId));
      const [row] = await db
        .insert(schema.worldInfo)
        .values({
          projectId: req.params.projectId,
          title: title.trim(),
          category: req.body.category?.trim() || null,
          content: req.body.content?.trim() || '',
          sortOrder: existing.length,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ---- 更新 ----
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/world-info/:id',
    async (req, reply) => {
      const db = getDb();
      const allowed = ['title', 'category', 'content', 'sortOrder'];
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          patch[key] = typeof req.body[key] === 'string' ? String(req.body[key]).trim() : req.body[key];
        }
      }
      const [row] = await db
        .update(schema.worldInfo)
        .set(patch)
        .where(eq(schema.worldInfo.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '条目不存在' });
      return { data: row };
    },
  );

  // ---- 删除 ----
  app.delete<{ Params: { id: string } }>('/api/world-info/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.worldInfo)
      .where(eq(schema.worldInfo.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '条目不存在' });
    return reply.code(204).send();
  });
}
