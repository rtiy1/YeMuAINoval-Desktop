/**
 * Messages 路由 — 会话消息历史 + 使用量统计。
 *
 * agent_messages 表存储每个会话的完整对话历史（用户 + 助手消息）。
 * 助手消息附带 costUsd / durationMs / numTurns 统计数据。
 */

import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // ---- 获取会话消息列表 ----
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/messages',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.agentMessages)
        .where(eq(schema.agentMessages.agentSessionId, req.params.id))
        .orderBy(schema.agentMessages.sortOrder);

      // 转为前端 ChatMessage 兼容结构
      const data = rows.map((row) => ({
        id: row.id,
        agentSessionId: row.agentSessionId,
        role: row.role,
        content: row.content,
        toolCallGroups: row.toolCalls ? JSON.parse(row.toolCalls) : undefined,
        durationMs: row.durationMs ?? undefined,
        costUsd: row.costUsd ?? undefined,
        numTurns: row.numTurns ?? undefined,
        isError: row.isError ?? false,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
      }));

      return { data };
    },
  );

  // ---- 获取会话使用量统计 ----
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/usage',
    async (req) => {
      const db = getDb();
      const rows = await db
        .select({
          costUsd: schema.agentMessages.costUsd,
          durationMs: schema.agentMessages.durationMs,
          numTurns: schema.agentMessages.numTurns,
        })
        .from(schema.agentMessages)
        .where(eq(schema.agentMessages.agentSessionId, req.params.id));

      let totalCostUsd = 0;
      let totalDurationMs = 0;
      let totalTurns = 0;
      for (const row of rows) {
        totalCostUsd += row.costUsd ?? 0;
        totalDurationMs += row.durationMs ?? 0;
        totalTurns += row.numTurns ?? 0;
      }

      return {
        data: {
          totalCostUsd,
          totalDurationMs,
          totalTurns,
          messageCount: rows.length,
        },
      };
    },
  );
}
