import { z } from "zod";
import { CHAPTER_REF_PATTERN } from "./structure.js";

/** Current schema version for novel.yaml and relationships.yaml. */
export const NOVEL_SCHEMA_VERSION = 1;

export const NovelIdSchema = z.string().trim().min(1).max(120);

export const NovelMetadataSchema = z.object({
  schemaVersion: z.number().int().positive().default(NOVEL_SCHEMA_VERSION),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(120).nullable().default(null),
  genres: z.array(z.string().trim().min(1)).max(20).default([]),
  synopsis: z.string().max(20000).nullable().default(null),
  status: z.enum(["drafting", "paused", "completed"]).default("drafting"),
  /** Path (relative to the novel root) of the style guide markdown file. */
  styleGuide: z.string().trim().max(400).nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});

export type NovelMetadata = z.infer<typeof NovelMetadataSchema>;

export const CharacterRoleSchema = z.enum(["protagonist", "supporting", "antagonist", "other"]);

export const CharacterSchema = z.object({
  id: NovelIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1)).max(50).default([]),
  role: CharacterRoleSchema.default("other"),
  description: z.string().max(20000).nullable().default(null),
  gender: z.string().max(40).nullable().default(null),
  age: z.string().max(40).nullable().default(null),
  faction: NovelIdSchema.nullable().default(null),
  status: z.enum(["active", "dead", "absent", "unknown"]).default("active"),
  notes: z.string().max(40000).nullable().default(null),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
});

export type Character = z.infer<typeof CharacterSchema>;

export const LocationSchema = z.object({
  id: NovelIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1)).max(50).default([]),
  kind: z.enum(["city", "region", "building", "world", "other"]).default("other"),
  description: z.string().max(20000).nullable().default(null),
  faction: NovelIdSchema.nullable().default(null),
  status: z.enum(["active", "ruined", "abandoned", "unknown"]).default("active"),
  notes: z.string().max(40000).nullable().default(null),
});

export type Location = z.infer<typeof LocationSchema>;

export const FactionSchema = z.object({
  id: NovelIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1)).max(50).default([]),
  description: z.string().max(20000).nullable().default(null),
  leader: NovelIdSchema.nullable().default(null),
  members: z.array(NovelIdSchema).max(500).default([]),
  status: z.enum(["active", "dissolved", "dormant", "unknown"]).default("active"),
  notes: z.string().max(40000).nullable().default(null),
});

export type Faction = z.infer<typeof FactionSchema>;

export const ItemSchema = z.object({
  id: NovelIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(20000).nullable().default(null),
  owner: NovelIdSchema.nullable().default(null),
  status: z.enum(["active", "lost", "destroyed", "unknown"]).default("active"),
  notes: z.string().max(40000).nullable().default(null),
});

export type Item = z.infer<typeof ItemSchema>;

export const NovelRulesFileSchema = z.object({
  schemaVersion: z.number().int().positive().default(NOVEL_SCHEMA_VERSION),
  rules: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        rule: z.string().min(1).max(20000),
        scope: z.string().max(400).nullable().default(null),
      }),
    )
    .default([]),
});

export type NovelRulesFile = z.infer<typeof NovelRulesFileSchema>;

// ---------------------------------------------------------------------------
// Relationships (stage D)
// ---------------------------------------------------------------------------

export const RelationshipTypeSchema = z.enum([
  "alliance",
  "conflict",
  "kinship",
  "romance",
  "mentorship",
  "subordinate",
  "debt",
  "secret",
  "other",
]);

export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const RelationshipDirectionSchema = z.enum(["bidirectional", "source_to_target"]);

export type RelationshipDirection = z.infer<typeof RelationshipDirectionSchema>;

export const RelationshipStatusSchema = z.enum(["active", "past", "tentative"]);

export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>;

export const ChapterRefSchema = z
  .string()
  .regex(CHAPTER_REF_PATTERN, "章节引用必须是 chapter-001 形式");

export const RelationshipSchema = z.object({
  id: z.string().trim().min(1).max(120),
  source: NovelIdSchema,
  target: NovelIdSchema,
  type: RelationshipTypeSchema,
  label: z.string().trim().max(200).nullable().default(null),
  direction: RelationshipDirectionSchema.default("bidirectional"),
  strength: z.number().int().min(1).max(5).default(3),
  status: RelationshipStatusSchema.default("active"),
  fromChapter: ChapterRefSchema.nullable().default(null),
  toChapter: ChapterRefSchema.nullable().default(null),
  public: z.boolean().default(true),
  notes: z.string().max(20000).nullable().default(null),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export const RelationshipsFileSchema = z.object({
  schemaVersion: z.number().int().positive().default(NOVEL_SCHEMA_VERSION),
  relationships: z.array(RelationshipSchema).default([]),
});

export type RelationshipsFile = z.infer<typeof RelationshipsFileSchema>;

// ---------------------------------------------------------------------------
// Wire-friendly snapshot/layout payloads
// ---------------------------------------------------------------------------

export const NovelValidationIssueSchema = z.object({
  /** Path relative to the novel root. */
  file: z.string(),
  /** Human-readable location such as `relationships[3].source` or `3:5`. */
  location: z.string().nullable(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
});

export type NovelValidationIssueWire = z.infer<typeof NovelValidationIssueSchema>;

export const CharacterGraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  factionId: z.string().nullable(),
  status: CharacterSchema.shape.status,
  role: CharacterSchema.shape.role,
});

export type CharacterGraphNodeWire = z.infer<typeof CharacterGraphNodeSchema>;

export const CharacterRelationshipEdgeSchema = RelationshipSchema.extend({
  sourceLabel: z.string(),
  targetLabel: z.string(),
});

export type CharacterRelationshipEdgeWire = z.infer<typeof CharacterRelationshipEdgeSchema>;

export const GraphLayoutSchema = z.object({
  nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  revision: z.number().int().nonnegative(),
});

export type GraphLayout = z.infer<typeof GraphLayoutSchema>;
