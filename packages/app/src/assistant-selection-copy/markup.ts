export const MARKDOWN_COPY_TAG_ATTRIBUTE = "data-yemu-markdown-tag";
export const MARKDOWN_COPY_IGNORE_ATTRIBUTE = "data-yemu-markdown-ignore";
export const MARKDOWN_COPY_LIST_MARKER_ATTRIBUTE = "data-yemu-markdown-list-marker";
export const MARKDOWN_COPY_UNWRAP_ATTRIBUTE = "data-yemu-markdown-unwrap";
export const MARKDOWN_COPY_LIST_START_ATTRIBUTE = "data-yemu-markdown-list-start";
export const MARKDOWN_COPY_LANGUAGE_ATTRIBUTE = "data-yemu-markdown-language";
export const MARKDOWN_COPY_ALIGN_ATTRIBUTE = "data-yemu-markdown-align";

/**
 * Trailing line breaks, with any indentation that followed the last one.
 *
 * Both ways of copying code strip these, for the same reason: pasting a trailing
 * newline into a terminal runs the last line. A fence body always ends in one, and
 * ends in several when the author left blank lines before the closing fence; a
 * selection picks one up whenever it overshoots the end of a rendered line.
 */
export const TRAILING_CODE_LINE_BREAKS = /(\r?\n[ \t]*)+$/;

export const markdownCopyDataSet = {
  blockquote: { yemuMarkdownTag: "blockquote" },
  br: { yemuMarkdownTag: "br" },
  code: { yemuMarkdownTag: "code" },
  h1: { yemuMarkdownTag: "h1" },
  h2: { yemuMarkdownTag: "h2" },
  h3: { yemuMarkdownTag: "h3" },
  h4: { yemuMarkdownTag: "h4" },
  h5: { yemuMarkdownTag: "h5" },
  h6: { yemuMarkdownTag: "h6" },
  hr: { yemuMarkdownTag: "hr" },
  ignore: { yemuMarkdownIgnore: "true" },
  li: { yemuMarkdownTag: "li" },
  listMarker: { yemuMarkdownIgnore: "true", yemuMarkdownListMarker: "true" },
  ol: { yemuMarkdownTag: "ol" },
  p: { yemuMarkdownTag: "p" },
  pre: { yemuMarkdownTag: "pre" },
  s: { yemuMarkdownTag: "s" },
  strong: { yemuMarkdownTag: "strong" },
  em: { yemuMarkdownTag: "em" },
  table: { yemuMarkdownTag: "table" },
  tbody: { yemuMarkdownTag: "tbody" },
  td: { yemuMarkdownTag: "td" },
  th: { yemuMarkdownTag: "th" },
  thead: { yemuMarkdownTag: "thead" },
  tr: { yemuMarkdownTag: "tr" },
  ul: { yemuMarkdownTag: "ul" },
  unwrap: { yemuMarkdownUnwrap: "true" },
} as const;

export type MarkdownCopyInlineTag = "br" | "code" | "em" | "s" | "strong";

export function markdownCopyOrderedListDataSet(start: unknown) {
  return {
    ...markdownCopyDataSet.ol,
    yemuMarkdownListStart: String(start ?? 1),
  } as const;
}

export function markdownCopyCodeBlockDataSet(language: string | null | undefined) {
  const fenceLanguage = language?.trim().split(/\s+/)[0];
  return {
    ...markdownCopyDataSet.pre,
    ...(fenceLanguage ? { yemuMarkdownLanguage: fenceLanguage } : {}),
  } as const;
}

export function markdownCopyTableCellDataSet(tag: "td" | "th", style: unknown) {
  const alignment =
    typeof style === "string"
      ? style.match(/(?:^|;)\s*text-align\s*:\s*(left|right|center)/i)?.[1]
      : null;
  return {
    ...markdownCopyDataSet[tag],
    ...(alignment ? { yemuMarkdownAlign: alignment.toLowerCase() } : {}),
  } as const;
}
