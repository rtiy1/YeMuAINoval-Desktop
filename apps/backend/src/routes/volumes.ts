/**
 * Volumes 路由 — 分卷 CRUD + 重排。
 */

import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export async function volumeRoutes(app: FastifyInstance): Promise<void> {
  // ---- 按项目列出卷（含章节树） ----
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/volumes',
    async (req) => {
      const db = getDb();
      const vols = await db
        .select()
        .from(schema.volumes)
        .where(eq(schema.volumes.projectId, req.params.projectId))
        .orderBy(asc(schema.volumes.sortOrder));
      return { data: vols };
    },
  );

  // ---- 创建卷 ----
  app.post<{ Params: { projectId: string }; Body: { title: string } }>(
    '/api/projects/:projectId/volumes',
    async (req, reply) => {
      const { title } = req.body ?? {};
      if (!title?.trim()) return reply.code(400).send({ error: '标题不能为空' });
      const db = getDb();
      // 计算下一个排序序号
      const existing = await db
        .select()
        .from(schema.volumes)
        .where(eq(schema.volumes.projectId, req.params.projectId));
      const nextOrder = existing.length;
      const [row] = await db
        .insert(schema.volumes)
        .values({
          projectId: req.params.projectId,
          title: title.trim(),
          sortOrder: nextOrder,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ---- 更新卷 ----
  app.put<{ Params: { id: string }; Body: { title?: string; sortOrder?: number } }>(
    '/api/volumes/:id',
    async (req, reply) => {
      const db = getDb();
      const [row] = await db
        .update(schema.volumes)
        .set({
          ...(req.body.title !== undefined && { title: req.body.title.trim() }),
          ...(req.body.sortOrder !== undefined && { sortOrder: req.body.sortOrder }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.volumes.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '卷不存在' });
      return { data: row };
    },
  );

  // ---- 删除卷 ----
  app.delete<{ Params: { id: string } }>('/api/volumes/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.volumes)
      .where(eq(schema.volumes.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '卷不存在' });
    return reply.code(204).send();
  });
}
