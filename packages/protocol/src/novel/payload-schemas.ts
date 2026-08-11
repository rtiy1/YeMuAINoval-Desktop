import { z } from "zod";
import {
  CharacterGraphNodeSchema,
  CharacterRelationshipEdgeSchema,
  NovelValidationIssueSchema,
} from "@yemu/novel-core";

export { GraphLayoutSchema } from "@yemu/novel-core";
export type { GraphLayout } from "@yemu/novel-core";

export const NovelChapterEntrySchema = z.object({
  number: z.number().int().positive(),
  fileName: z.string(),
  title: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
  modifiedAt: z.string().nullable(),
});

export type NovelChapterEntry = z.infer<typeof NovelChapterEntrySchema>;

export const NovelVolumeEntrySchema = z.object({
  number: z.number().int().positive(),
  dirName: z.string(),
  chapters: z.array(NovelChapterEntrySchema),
});

export type NovelVolumeEntry = z.infer<typeof NovelVolumeEntrySchema>;

export const NovelTreeSchema = z.object({
  volumes: z.array(NovelVolumeEntrySchema),
  fragments: z.array(z.string()),
});

export type NovelTree = z.infer<typeof NovelTreeSchema>;

export const NovelDescriptorSchema = z.object({
  projectId: z.string(),
  projectRootPath: z.string(),
  title: z.string(),
  updatedAt: z.string().nullable(),
});

export type NovelDescriptor = z.infer<typeof NovelDescriptorSchema>;

export const NovelSnapshotSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
  kind: z.enum(["git", "directory"]),
  commitId: z.string().nullable(),
  path: z.string().nullable(),
});

export type NovelSnapshot = z.infer<typeof NovelSnapshotSchema>;

export const NovelEntityKindSchema = z.enum(["characters", "locations", "factions", "items"]);

export type NovelEntityKind = z.infer<typeof NovelEntityKindSchema>;

export const NovelEntityEntrySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type NovelEntityEntry = z.infer<typeof NovelEntityEntrySchema>;

export const NovelRelationshipsPayloadSchema = z.object({
  projectId: z.string(),
  revision: z.number().int().nonnegative(),
  nodes: z.array(CharacterGraphNodeSchema),
  edges: z.array(CharacterRelationshipEdgeSchema),
  issues: z.array(NovelValidationIssueSchema),
});

export type NovelRelationshipsPayload = z.infer<typeof NovelRelationshipsPayloadSchema>;
