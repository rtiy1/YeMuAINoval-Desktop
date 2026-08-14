/**
 * Projects 路由 — 项目 CRUD。
 *
 * 创建项目时自动生成一个默认卷，简化前端使用。
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';
import type { Project } from '../db/schema.js';
import { countWords } from '../lib/word-count.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // ---- 列表 ----
  app.get('/api/projects', async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.projects)
      .orderBy(asc(schema.projects.updatedAt));
    return { data: rows };
  });

  // ---- 详情 ----
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id));
    if (!row) return reply.code(404).send({ error: '项目不存在' });
    return { data: row };
  });

  // ---- 创建 ----
  app.post<{ Body: { title: string; description?: string } }>(
    '/api/projects',
    async (req, reply) => {
      const { title, description } = req.body ?? {};
      if (!title || !title.trim()) {
        return reply.code(400).send({ error: '标题不能为空' });
      }
      const db = getDb();
      const [project] = await db
        .insert(schema.projects)
        .values({
          title: title.trim(),
          description: description?.trim() || null,
        })
        .returning();
      // 自动创建默认卷：正文 + 其他
      await db.insert(schema.volumes).values([
        { projectId: project.id, title: '正文', sortOrder: 0 },
        { projectId: project.id, title: '其他', sortOrder: 1 },
      ]);
      return reply.code(201).send({ data: project });
    },
  );

  // ---- 更新 ----
  app.put<{ Params: { id: string }; Body: Partial<Pick<Project, 'title' | 'description' | 'coverPath'>> }>(
    '/api/projects/:id',
    async (req, reply) => {
      const db = getDb();
      const [row] = await db
        .update(schema.projects)
        .set({
          ...(req.body.title !== undefined && { title: req.body.title.trim() }),
          ...(req.body.description !== undefined && {
            description: req.body.description?.trim() || null,
          }),
          ...(req.body.coverPath !== undefined && { coverPath: req.body.coverPath }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.projects.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '项目不存在' });
      return { data: row };
    },
  );

  // ---- 删除 ----
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '项目不存在' });
    return reply.code(204).send();
  });
}
