import { describe, expect, it } from "vitest";
import { CharacterSchema, LocationSchema } from "./schemas.js";
import {
  factionIdFor,
  validateCharacterIndex,
  validateRelationships,
  withoutId,
} from "./validate.js";

function parseCharacter(raw: string) {
  const parsed = CharacterSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error("test fixture must be valid");
  }
  return parsed.data;
}

const fileFor = {
  character: (id: string) => `story-bible/characters/${id}.yaml`,
  faction: (id: string) => `story-bible/factions/${id}.yaml`,
};

describe("validateCharacterIndex", () => {
  it("reports duplicate character ids", () => {
    const issues = validateCharacterIndex(
      {
        characters: [
          parseCharacter('{"id":"lin-wan","name":"林晚"}'),
          parseCharacter('{"id":"lin-wan","name":"林晚"}'),
        ],
        locations: [],
        factions: [],
      },
      fileFor,
    );
    expect(issues.some((issue) => issue.message.includes("重复的人物 ID"))).toBe(true);
  });

  it("warns on duplicate names across characters", () => {
    const issues = validateCharacterIndex(
      {
        characters: [
          parseCharacter('{"id":"lin-wan","name":"林晚"}'),
          parseCharacter('{"id":"gu-ye","name":"林晚"}'),
        ],
        locations: [],
        factions: [],
      },
      fileFor,
    );
    expect(
      issues.some((issue) => issue.severity === "warning" && issue.message.includes("林晚")),
    ).toBe(true);
  });

  it("warns on dangling faction references", () => {
    const issues = validateCharacterIndex(
      {
        characters: [parseCharacter('{"id":"lin-wan","name":"林晚","faction":"faction-none"}')],
        locations: [],
        factions: [{ id: "faction-qin", name: "秦楼" }],
      },
      fileFor,
    );
    expect(issues.some((issue) => issue.message.includes("faction-none"))).toBe(true);
  });

  it("warns when a location writes a faction name instead of an id", () => {
    const location = LocationSchema.safeParse(
      JSON.parse('{"id":"old-city","name":"旧城","faction":"秦楼"}'),
    );
    expect(location.success).toBe(true);
    const issues = validateCharacterIndex(
      {
        characters: [],
        locations: location.success ? [location.data] : [],
        factions: [{ id: "faction-qin", name: "秦楼" }],
      },
      fileFor,
    );
    expect(issues.some((issue) => issue.message.includes("应写为 ID faction-qin"))).toBe(true);
  });
});

describe("validateRelationships", () => {
  const characterIds = new Set(["lin-wan", "gu-ye"]);

  it("accepts a valid relationship", () => {
    const issues = validateRelationships(
      [
        {
          id: "rel-1",
          source: "lin-wan",
          target: "gu-ye",
          type: "alliance",
          direction: "bidirectional",
          strength: 4,
          status: "active",
          fromChapter: "chapter-012",
          toChapter: null,
          public: true,
        },
      ],
      characterIds,
    );
    expect(issues).toEqual([]);
  });

  it("reports dangling references and duplicate ids", () => {
    const issues = validateRelationships(
      [
        {
          id: "rel-1",
          source: "lin-wan",
          target: "ghost",
          type: "alliance",
          direction: "bidirectional",
          strength: 3,
          status: "active",
          fromChapter: null,
          toChapter: null,
          public: true,
        },
        {
          id: "rel-1",
          source: "lin-wan",
          target: "gu-ye",
          type: "conflict",
          direction: "source_to_target",
          strength: 3,
          status: "active",
          fromChapter: null,
          toChapter: null,
          public: true,
        },
      ],
      characterIds,
    );
    expect(issues.some((issue) => issue.message.includes("ghost"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("重复的关系 ID"))).toBe(true);
  });

  it("warns when toChapter is before fromChapter", () => {
    const issues = validateRelationships(
      [
        {
          id: "rel-1",
          source: "lin-wan",
          target: "gu-ye",
          type: "alliance",
          direction: "bidirectional",
          strength: 3,
          status: "active",
          fromChapter: "chapter-012",
          toChapter: "chapter-005",
          public: true,
        },
      ],
      characterIds,
    );
    expect(issues.some((issue) => issue.message.includes("结束章节早于开始章节"))).toBe(true);
  });

  it("rejects a self-loop", () => {
    const issues = validateRelationships(
      [
        {
          id: "rel-1",
          source: "lin-wan",
          target: "lin-wan",
          type: "alliance",
          direction: "bidirectional",
          strength: 3,
          status: "active",
          fromChapter: null,
          toChapter: null,
          public: true,
        },
      ],
      characterIds,
    );
    expect(issues.some((issue) => issue.message.includes("起点和终点相同"))).toBe(true);
  });
});

describe("helpers", () => {
  it("strips the id field for file writes", () => {
    expect(withoutId({ id: "lin-wan", name: "林晚" })).toEqual({ name: "林晚" });
  });

  it("resolves a faction id by id or name", () => {
    const factions = [{ id: "faction-qin", name: "秦楼" }];
    expect(factionIdFor(factions, "faction-qin")).toBe("faction-qin");
    expect(factionIdFor(factions, "秦楼")).toBe("faction-qin");
    expect(factionIdFor(factions, "missing")).toBeNull();
  });
});
