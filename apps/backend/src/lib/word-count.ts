/**
 * 中文字数统计工具。
 *
 * 对小说写作优化：中文按字计，英文按词计，空白与标点不计入。
 */

/** 统计文本字数（中文逐字、英文逐词）。 */
export function countWords(text: string): number {
  if (!text) return 0;
  // 移除 markdown 标记符号，避免污染计数
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/[#*_`>\-\[\]()!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 0;

  // 中日韩统一表意文字 + 常用中文标点外的字符
  const cjkMatches = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // 去掉 CJK 字符后按空格分词统计英文词数
  const nonCjk = cleaned.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ').trim();
  const wordCount = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;

  return cjkCount + wordCount;
}
