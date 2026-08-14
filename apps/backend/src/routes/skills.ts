/**
 * Skills 路由 — 技能列表、命令列表、技能开关持久化。
 *
 * 技能和命令的元数据来自静态目录（skills-catalog.ts），
 * 无法从 MCode 包动态导入（见该文件头部说明）。
 *
 * 开关状态：存入 settings 表的 skills.enabled 键（逗号分隔）。
 * 按设计决策：仅持久化，不注入 MCode 系统提示。
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';
import {
  SKILL_CATALOG,
  COMMAND_CATALOG,
  DEFAULT_ENABLED_SKILLS,
} from '../mcode/skills-catalog.js';

/** settings 表中存储已启用技能的键名。 */
const SKILLS_ENABLED_KEY = 'skills.enabled';

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  // ---- 技能目录 ----
  app.get('/api/skills', async () => {
    return { data: SKILL_CATALOG };
  });

  // ---- 已启用的技能列表 ----
  app.get('/api/skills/enabled', async () => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, SKILLS_ENABLED_KEY));

    if (!row?.value) {
      return { data: DEFAULT_ENABLED_SKILLS };
    }
    const enabled = row.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { data: enabled };
  });

  // ---- 更新已启用的技能列表 ----
  app.put<{ Body: { skills: string[] } }>('/api/skills/enabled', async (req) => {
    const db = getDb();
    const skills = (req.body?.skills ?? [])
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim());
    const value = skills.join(',');

    const [existing] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, SKILLS_ENABLED_KEY));

    if (existing) {
      await db
        .update(schema.settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(schema.settings.key, SKILLS_ENABLED_KEY));
    } else {
      await db.insert(schema.settings).values({ key: SKILLS_ENABLED_KEY, value });
    }

    return { data: skills };
  });

  // ---- 斜杠命令目录 ----
  app.get('/api/commands', async () => {
    return { data: COMMAND_CATALOG };
  });
}
