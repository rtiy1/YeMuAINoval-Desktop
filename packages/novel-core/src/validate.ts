import { type Character, type Faction, type Location, type Relationship } from "./schemas.js";
import type { NovelValidationIssue } from "./parse.js";

/** A character node as exposed in the relationship graph snapshot. */
export interface CharacterGraphNode {
  id: string;
  name: string;
  aliases: string[];
  factionId: string | null;
  status: Character["status"];
  role: Character["role"];
}

/** An edge as exposed in the relationship graph snapshot. */
export interface CharacterRelationshipEdge extends Relationship {
  sourceLabel: string;
  targetLabel: string;
}

export interface RelationshipGraphSnapshot {
  projectId: string;
  revision: number;
  nodes: CharacterGraphNode[];
  edges: CharacterRelationshipEdge[];
  issues: NovelValidationIssue[];
}

export interface CharacterIndex {
  /** Characters must carry the id derived from their file name. */
  characters: Array<Character & { id: string }>;
  locations: Array<Location & { id: string }>;
  factions: Faction[];
}

/**
 * Validate fact-file indexes:
 * - duplicate character/faction/location ids;
 * - character `faction` refs that dangle.
 * Character ids are derived from file names unless the file carries an id.
 */
export function validateCharacterIndex(
  index: CharacterIndex,
  fileFor: { character: (id: string) => string; faction: (id: string) => string },
): NovelValidationIssue[] {
  const issues: NovelValidationIssue[] = [];

  const characterIds = new Set<string>();
  const characterByName = new Map<string, string>();
  for (const character of index.characters) {
    if (characterIds.has(character.id)) {
      issues.push({
        file: fileFor.character(character.id),
        location: "id",
        message: `重复的人物 ID：${character.id}`,
        severity: "error",
      });
    }
    characterIds.add(character.id);
    for (const alias of [character.name, ...character.aliases]) {
      const existing = characterByName.get(alias);
      if (existing && existing !== character.id) {
        issues.push({
          file: fileFor.character(character.id),
          location: "name",
          message: `人物名称「${alias}」与 ${existing} 重复`,
          severity: "warning",
        });
      }
      characterByName.set(alias, character.id);
    }
  }

  const factionIds = new Set(index.factions.map((faction) => faction.id));
  for (const character of index.characters) {
    if (character.faction && !factionIds.has(character.faction)) {
      issues.push({
        file: fileFor.character(character.id),
        location: "faction",
        message: `人物 ${character.id} 引用了不存在的势力 ${character.faction}`,
        severity: "warning",
      });
    }
  }

  const factionByName = new Map(index.factions.map((faction) => [faction.name, faction.id]));
  for (const location of index.locations) {
    if (location.faction && !factionIds.has(location.faction)) {
      const byName = factionByName.get(location.faction);
      if (byName) {
        issues.push({
          file: `story-bible/locations/${location.id}.yaml`,
          location: "faction",
          message: `地点 ${location.id} 的势力应写为 ID ${byName}（当前写成了名称）`,
          severity: "warning",
        });
      } else {
        issues.push({
          file: `story-bible/locations/${location.id}.yaml`,
          location: "faction",
          message: `地点 ${location.id} 引用了不存在的势力 ${location.faction}`,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

/** Validate relationships against a character id set (plan §10). */
export function validateRelationships(
  relationships: readonly Relationship[],
  characterIds: ReadonlySet<string>,
  file = "relationships.yaml",
): NovelValidationIssue[] {
  const issues: NovelValidationIssue[] = [];
  const seenIds = new Set<string>();

  relationships.forEach((relationship, index) => {
    const at = `relationships[${index}]`;
    if (seenIds.has(relationship.id)) {
      issues.push({
        file,
        location: `${at}.id`,
        message: `重复的关系 ID：${relationship.id}`,
        severity: "error",
      });
    }
    seenIds.add(relationship.id);

    if (!characterIds.has(relationship.source)) {
      issues.push({
        file,
        location: `${at}.source`,
        message: `关系 ${relationship.id} 的起点人物 ${relationship.source} 不存在`,
        severity: "error",
      });
    }
    if (!characterIds.has(relationship.target)) {
      issues.push({
        file,
        location: `${at}.target`,
        message: `关系 ${relationship.id} 的终点人物 ${relationship.target} 不存在`,
        severity: "error",
      });
    }
    if (relationship.source === relationship.target) {
      issues.push({
        file,
        location: `${at}`,
        message: `关系 ${relationship.id} 的起点和终点相同`,
        severity: "error",
      });
    }
    if (relationship.fromChapter && relationship.toChapter) {
      const from = Number(relationship.fromChapter.slice("chapter-".length));
      const to = Number(relationship.toChapter.slice("chapter-".length));
      if (to < from) {
        issues.push({
          file,
          location: `${at}.toChapter`,
          message: `关系 ${relationship.id} 的结束章节早于开始章节`,
          severity: "warning",
        });
      }
    }
  });

  return issues;
}

/** Strip `id` from a character/location/faction payload destined for a file. */
export function withoutId<T extends { id?: string | undefined }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest;
}

export function factionIdFor(factions: readonly Faction[], nameOrId: string): string | null {
  const byId = factions.find((faction) => faction.id === nameOrId);
  if (byId && byId.id !== undefined) {
    return byId.id;
  }
  const byName = factions.find((faction) => faction.name === nameOrId);
  return byName?.id ?? null;
}
