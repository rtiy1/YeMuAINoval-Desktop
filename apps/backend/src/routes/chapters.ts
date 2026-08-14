/**
 * Chapters 路由 — 章节 CRUD + 自动保存。
 *
 * 保存时自动重算字数并同步项目级统计。
 */

import type { FastifyInstance } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';
import { countWords } from '../lib/word-count.js';

/** 重算项目级字数与章节数。 */
async function refreshProjectStats(projectId: string): Promise<void> {
  const db = getDb();
  const stats = await db
    .select({
      totalWords: sql<number>`COALESCE(SUM(${schema.chapters.wordCount}), 0)`,
      chapterCount: sql<number>`COUNT(*)`,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.projectId, projectId));
  const { totalWords, chapterCount } = stats[0] ?? { totalWords: 0, chapterCount: 0 };
  await db
    .update(schema.projects)
    .set({
      wordCount: totalWords,
      chapterCount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.projects.id, projectId));
}

export async function chapterRoutes(app: FastifyInstance): Promise<void> {
  // ---- 按卷列出章节 ----
  app.get<{ Params: { volumeId: string } }>(
    '/api/volumes/:volumeId/chapters',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select({
          id: schema.chapters.id,
          projectId: schema.chapters.projectId,
          volumeId: schema.chapters.volumeId,
          title: schema.chapters.title,
          wordCount: schema.chapters.wordCount,
          sortOrder: schema.chapters.sortOrder,
          createdAt: schema.chapters.createdAt,
          updatedAt: schema.chapters.updatedAt,
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.volumeId, req.params.volumeId))
        .orderBy(asc(schema.chapters.sortOrder));
      return { data: rows };
    },
  );

  // ---- 章节详情（含正文） ----
  app.get<{ Params: { id: string } }>('/api/chapters/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.id, req.params.id));
    if (!row) return reply.code(404).send({ error: '章节不存在' });
    return { data: row };
  });

  // ---- 创建章节 ----
  app.post<{ Params: { volumeId: string }; Body: { title: string } }>(
    '/api/volumes/:volumeId/chapters',
    async (req, reply) => {
      const { title } = req.body ?? {};
      if (!title?.trim()) return reply.code(400).send({ error: '标题不能为空' });
      const db = getDb();
      // 取 volume 的 projectId
      const [vol] = await db
        .select()
        .from(schema.volumes)
        .where(eq(schema.volumes.id, req.params.volumeId));
      if (!vol) return reply.code(404).send({ error: '卷不存在' });
      // 计算排序序号
      const existing = await db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.volumeId, req.params.volumeId));
      const [row] = await db
        .insert(schema.chapters)
        .values({
          projectId: vol.projectId,
          volumeId: req.params.volumeId,
          title: title.trim(),
          content: '',
          wordCount: 0,
          sortOrder: existing.length,
        })
        .returning();
      await refreshProjectStats(vol.projectId);
      return reply.code(201).send({ data: row });
    },
  );

  // ---- 更新章节（自动保存） ----
  app.put<{ Params: { id: string }; Body: { title?: string; content?: string; sortOrder?: number } }>(
    '/api/chapters/:id',
    async (req, reply) => {
      const db = getDb();
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (req.body.title !== undefined) patch.title = req.body.title.trim();
      if (req.body.sortOrder !== undefined) patch.sortOrder = req.body.sortOrder;
      if (req.body.content !== undefined) {
        patch.content = req.body.content;
        patch.wordCount = countWords(req.body.content);
      }
      const [row] = await db
        .update(schema.chapters)
        .set(patch)
        .where(eq(schema.chapters.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: '章节不存在' });
      await refreshProjectStats(row.projectId);
      return { data: row };
    },
  );

  // ---- 删除章节 ----
  app.delete<{ Params: { id: string } }>('/api/chapters/:id', async (req, reply) => {
    const db = getDb();
    const [row] = await db
      .delete(schema.chapters)
      .where(eq(schema.chapters.id, req.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: '章节不存在' });
    await refreshProjectStats(row.projectId);
    return reply.code(204).send();
  });
}
