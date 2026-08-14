/**
 * 系统提示拼装 — 为 MCode 注入小说创作上下文。
 *
 * 每次发消息前，把当前项目的角色档案、世界观条目、
 * 活动章节的前文摘要拼成上下文块，作为 user 消息前缀注入。
 *
 * 设计取舍：不修改 MCode 的 system prompt（子进程无法注入），
 * 而是用一个"上下文卡"前缀拼接到用户消息前，效果等同且无侵入。
 */

import { asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';

export interface ContextOptions {
  /** 项目 ID。 */
  projectId: string;
  /** 活动章节 ID（可为空）。 */
  chapterId?: string | null;
  /** 用户实际输入的消息。 */
  userMessage: string;
  /** @提及注入的章节/角色 ID 列表。 */
  mentionedChapterIds?: string[];
  mentionedCharacterIds?: string[];
}

/** 截取章节前文末尾 N 字作为上下文（避免超长）。 */
const CHAPTER_CONTEXT_MAX_CHARS = 4000;

/** 构建 MCode 输入消息（上下文 + 用户消息）。 */
export async function buildAgentMessage(opts: ContextOptions): Promise<string> {
  const db = getDb();
  const sections: string[] = [];

  // ---- 项目信息 ----
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, opts.projectId));
  if (project) {
    sections.push(`# 当前项目\n《${project.title}》\n${project.description ?? ''}`);
  }

  // ---- 角色档案 ----
  const targetCharIds = opts.mentionedCharacterIds?.length
    ? opts.mentionedCharacterIds
    : null;
  const characterQuery = targetCharIds
    ? db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.projectId, opts.projectId))
    : db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.projectId, opts.projectId));
  const characters = await characterQuery;
  const filteredChars = targetCharIds
    ? characters.filter((c) => targetCharIds.includes(c.id))
    : characters;
  if (filteredChars.length > 0) {
    const charLines = filteredChars.map(
      (c) =>
        `### ${c.name}${c.role ? `（${c.role}）` : ''}\n` +
        [
          c.profile && `简介：${c.profile}`,
          c.appearance && `外貌：${c.appearance}`,
          c.personality && `性格：${c.personality}`,
          c.backstory && `背景：${c.backstory}`,
        ]
          .filter(Boolean)
          .join('\n'),
    );
    sections.push(`# 角色档案\n${charLines.join('\n\n')}`);
  }

  // ---- 世界观条目 ----
  const worldEntries = await db
    .select()
    .from(schema.worldInfo)
    .where(eq(schema.worldInfo.projectId, opts.projectId))
    .orderBy(asc(schema.worldInfo.sortOrder));
  if (worldEntries.length > 0) {
    const worldLines = worldEntries.map(
      (w) =>
        `### ${w.title}${w.category ? `（${w.category}）` : ''}\n${w.content}`,
    );
    sections.push(`# 世界观设定\n${worldLines.join('\n\n')}`);
  }

  // ---- 章节前文上下文 ----
  const chapterIds = [
    ...(opts.chapterId ? [opts.chapterId] : []),
    ...(opts.mentionedChapterIds ?? []),
  ];
  const uniqueChapterIds = [...new Set(chapterIds)];
  if (uniqueChapterIds.length > 0) {
    const chapterBlocks: string[] = [];
    for (const cid of uniqueChapterIds) {
      const [chapter] = await db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.id, cid));
      if (chapter) {
        const preview =
          chapter.content.length > CHAPTER_CONTEXT_MAX_CHARS
            ? `…（前文省略）${chapter.content.slice(-CHAPTER_CONTEXT_MAX_CHARS)}`
            : chapter.content;
        chapterBlocks.push(`### 《${chapter.title}》\n${preview}`);
      }
    }
    if (chapterBlocks.length > 0) {
      sections.push(`# 章节前文\n${chapterBlocks.join('\n\n')}`);
    }
  }

  // ---- 拼装最终消息 ----
  const contextBlock = sections.join('\n\n---\n\n');
  return [
    contextBlock,
    '',
    '---',
    '',
    '以上是创作上下文。请基于这些设定协助创作。',
    '项目结构说明：「正文」卷用于存放小说正文章节；「其他」卷用于存放设定文档、大纲、灵感笔记等非正文产物。',
    '写作时，正文内容放入「正文」卷，其他产物放入「其他」卷。',
    '',
    '以下是用户的请求：',
    '',
    opts.userMessage,
  ].join('\n');
}
