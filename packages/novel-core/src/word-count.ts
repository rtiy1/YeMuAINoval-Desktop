/**
 * Chinese-aware text measurement used by novel word counts and stats.
 *
 * Rules:
 * - Each CJK ideograph counts as one character;
 * - Each full-width punctuation mark counts as one character;
 * - Each contiguous run of half-width letters/digits counts as one word;
 * - Whitespace and half-width punctuation are ignored.
 */

const CJK_IDEOGRAPH_PATTERN =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}]/gu;
const FULL_WIDTH_PUNCT_PATTERN = /[\u3000-\u303F\uFF00-\uFFEF\u2014\u2026]/gu;
const LATIN_RUN_PATTERN = /[A-Za-z0-9]+/g;

export function countCjkCharacters(text: string): number {
  return (text.match(CJK_IDEOGRAPH_PATTERN) ?? []).length;
}

export function countFullWidthPunctuation(text: string): number {
  return (text.match(FULL_WIDTH_PUNCT_PATTERN) ?? []).length;
}

export function countHalfWidthWords(text: string): number {
  return (text.match(LATIN_RUN_PATTERN) ?? []).length;
}

/** Total novel character count (CJK + full-width punctuation + latin words). */
export function countNovelCharacters(text: string): number {
  return countCjkCharacters(text) + countFullWidthPunctuation(text) + countHalfWidthWords(text);
}

export function countNovelLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r\n|\r|\n/).length;
}

export interface NovelTextStats {
  characters: number;
  cjkCharacters: number;
  fullWidthPunctuation: number;
  lines: number;
}

export function summarizeNovelText(text: string): NovelTextStats {
  return {
    characters: countNovelCharacters(text),
    cjkCharacters: countCjkCharacters(text),
    fullWidthPunctuation: countFullWidthPunctuation(text),
    lines: countNovelLines(text),
  };
}
