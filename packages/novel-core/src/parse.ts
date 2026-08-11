import { parseDocument, stringify } from "yaml";
import { type ZodType } from "zod";

export interface NovelValidationIssue {
  /** Path relative to the novel root. */
  file: string;
  /** Human-readable location such as `relationships[3].source` or `3:5`. */
  location: string | null;
  message: string;
  severity: "error" | "warning";
}

export type ParseYamlResult<T> =
  | { ok: true; data: T; issues: NovelValidationIssue[] }
  | { ok: false; data: null; issues: NovelValidationIssue[] };

/** Parse and validate a YAML fact file. Never throws. */
export function parseYamlFile<T>(
  content: string,
  file: string,
  schema: ZodType<T>,
): ParseYamlResult<T> {
  const issues: NovelValidationIssue[] = [];
  const document = parseDocument(content);
  if (document.errors.length > 0) {
    for (const error of document.errors) {
      issues.push({
        file,
        location: formatErrorLocation(error.linePos),
        message: error.message,
        severity: "error",
      });
    }
    return { ok: false, data: null, issues };
  }

  const raw = content.trim().length === 0 ? {} : (document.toJS() as unknown);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        file,
        location: issue.path.length > 0 ? issue.path.join(".") : null,
        message: issue.message,
        severity: "error",
      });
    }
    return { ok: false, data: null, issues };
  }
  return { ok: true, data: parsed.data, issues };
}

/** Serialize a validated fact file back to YAML with a stable header. */
export function dumpYamlFile(data: unknown): string {
  return stringify(data, {
    indent: 2,
    lineWidth: 0,
    aliasDuplicateObjects: false,
  });
}

interface LinePos {
  line: number;
  col: number;
}

function formatErrorLocation(linePos: readonly LinePos[] | undefined): string | null {
  const first = linePos?.[0];
  if (!first) {
    return null;
  }
  return `${first.line}:${first.col}`;
}
