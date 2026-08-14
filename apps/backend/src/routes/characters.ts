/**
 * Characters 路由 — 角色档案 CRUD。
 */

import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export async function characterRoutes(app: FastifyInstance): Promise<void> {
  // ---- 按项目列出角色 ----
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/characters',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.projectId, req.params.projectId))
        .orderBy(asc(schema.characters.sortOrder));
      return { data: rows };
    },
  );

  // ---- 角色详情 ----
  app.get<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, req.params.id));
    if (!row) return reply.code(404).send({ error: '角色不存在' });
    return { data: row };
  });

  // ---- 创建角色 ----
  app.post<{ Params: { projectId: string }; Body: { name: string; role?: string; profile?: string; appearance?: string; personality?: string; backstory?: string } }>(
    '/api/projects/:projectId/characters',
    async (req, reply) => {
      const { name } = req.body ?? {};
      if (!name?.trim()) return reply.code(400).send({ error: '角色名不能为空' });
      const db = getDb();
      const existing = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.projectId, req.params.projectId));
      const [row] = await db
        .insert(schema.characters)
        .values({
          projectId: req.params.projectId,
          name: name.trim(),
          role: req.body.role?.trim() || null,
          profile: req.body.profile?.trim() || null,
          appearance: req.body.appearance?.trim() || null,
          personality: req.body.personality?.trim() || null,
          backstory: req.body.backstory?.trim() || null,
          sortOrder: existing.length,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ---- 更新角色 ----
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/characters/:id',
    async (req, reply) => {
      const db = getDb();
      const allowed = ['name', 'role', 'profile', 'appearance', 'personality', 'backstory', 'sortOrder'];
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          patch[key] = typeof req.body[key] === 'string' ? String(req.body[key]).trim() : req.body[key];
        }
      }
      const [row] = await db
        .update(schema.characters)
        .set(patch)
        .where(eq(schema.characters.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '角色不存在' });
      return { data: row };
    },
  );

  // ---- 删除角色 ----
  app.delete<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.characters)
      .where(eq(schema.characters.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '角色不存在' });
    return reply.code(204).send();
  });
}
