/**
 * Agent Sessions 路由 — 管理前端会话与 MCode 子进程的映射。
 */

import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDb, schema } from '../db/index.js';

export async function agentSessionRoutes(app: FastifyInstance): Promise<void> {
  // ---- 按项目列出会话 ----
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/sessions',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.agentSessions)
        .where(eq(schema.agentSessions.projectId, req.params.projectId))
        .orderBy(asc(schema.agentSessions.createdAt));
      return { data: rows };
    },
  );

  // ---- 创建会话（预分配 MCode session UUID） ----
  app.post<{ Params: { projectId: string }; Body: { title?: string } }>(
    '/api/projects/:projectId/sessions',
    async (req, reply) => {
      const db = getDb();
      const [row] = await db
        .insert(schema.agentSessions)
        .values({
          projectId: req.params.projectId,
          mcodeSessionId: randomUUID(),
          title: req.body.title?.trim() || '新会话',
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ---- 更新会话标题 ----
  app.put<{ Params: { id: string }; Body: { title?: string } }>(
    '/api/sessions/:id',
    async (req, reply) => {
      const db = getDb();
      const [row] = await db
        .update(schema.agentSessions)
        .set({
          ...(req.body.title !== undefined && { title: req.body.title.trim() }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentSessions.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '会话不存在' });
      return { data: row };
    },
  );

  // ---- 删除会话 ----
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.agentSessions)
      .where(eq(schema.agentSessions.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '会话不存在' });
    return reply.code(204).send();
  });
}
