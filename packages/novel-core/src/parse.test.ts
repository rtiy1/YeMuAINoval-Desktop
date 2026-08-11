import { describe, expect, it } from "vitest";
import { dumpYamlFile, parseYamlFile } from "./parse.js";
import { CharacterSchema, NovelMetadataSchema, RelationshipsFileSchema } from "./schemas.js";

describe("parseYamlFile", () => {
  it("parses and validates a valid novel.yaml", () => {
    const result = parseYamlFile(
      "title: 长安雪\nschemaVersion: 1\nstatus: drafting\n",
      "novel.yaml",
      NovelMetadataSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("长安雪");
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.genres).toEqual([]);
    }
  });

  it("applies schema defaults for missing fields", () => {
    const result = parseYamlFile("title: 长安雪\n", "novel.yaml", NovelMetadataSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("drafting");
      expect(result.data.synopsis).toBeNull();
    }
  });

  it("reports YAML syntax errors with a line location", () => {
    const result = parseYamlFile("title: [unclosed\n", "novel.yaml", NovelMetadataSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].severity).toBe("error");
      expect(result.issues[0].file).toBe("novel.yaml");
      expect(result.issues[0].location).toMatch(/^\d+:\d+$/);
    }
  });

  it("reports schema errors with field paths", () => {
    const result = parseYamlFile(
      "name: 林晚\nrole: narrator\n",
      "characters/lin-wan.yaml",
      CharacterSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].location).toBe("role");
    }
  });

  it("parses an empty relationships file into defaults", () => {
    const result = parseYamlFile("", "relationships.yaml", RelationshipsFileSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.relationships).toEqual([]);
    }
  });
});

describe("dumpYamlFile", () => {
  it("round-trips parsed data", () => {
    const result = parseYamlFile(
      "title: 长安雪\nstatus: drafting\n",
      "novel.yaml",
      NovelMetadataSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dumped = dumpYamlFile(result.data);
      const reparsed = parseYamlFile(dumped, "novel.yaml", NovelMetadataSchema);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) {
        expect(reparsed.data.title).toBe("长安雪");
      }
    }
  });
});
