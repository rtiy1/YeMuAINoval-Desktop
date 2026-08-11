import { z } from "zod";
import { NovelMetadataSchema, NovelValidationIssueSchema } from "@yemu/novel-core";
import {
  GraphLayoutSchema,
  NovelDescriptorSchema,
  NovelEntityKindSchema,
  NovelRelationshipsPayloadSchema,
  NovelSnapshotSchema,
  NovelTreeSchema,
} from "./payload-schemas.js";

// ---------------------------------------------------------------------------
// novel.list
// ---------------------------------------------------------------------------

export const NovelListRequestSchema = z.object({
  type: z.literal("novel.list.request"),
  requestId: z.string(),
});

export const NovelListResponseSchema = z.object({
  type: z.literal("novel.list.response"),
  payload: z.object({
    requestId: z.string(),
    novels: z.array(NovelDescriptorSchema).default([]),
  }),
});

// ---------------------------------------------------------------------------
// novel.get
// ---------------------------------------------------------------------------

export const NovelGetRequestSchema = z.object({
  type: z.literal("novel.get.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const NovelGetResponseSchema = z.object({
  type: z.literal("novel.get.response"),
  payload: z.object({
    requestId: z.string(),
    novel: NovelDescriptorSchema,
    metadata: NovelMetadataSchema,
    tree: NovelTreeSchema,
  }),
});

// ---------------------------------------------------------------------------
// novel.create / novel.update_metadata
// ---------------------------------------------------------------------------

export const NovelCreateRequestSchema = z.object({
  type: z.literal("novel.create.request"),
  requestId: z.string(),
  projectId: z.string(),
  title: z.string().trim().min(1).max(200),
});

export const NovelCreateResponseSchema = z.object({
  type: z.literal("novel.create.response"),
  payload: z.object({
    requestId: z.string(),
    novel: NovelDescriptorSchema,
  }),
});

export const NovelUpdateMetadataRequestSchema = z.object({
  type: z.literal("novel.update_metadata.request"),
  requestId: z.string(),
  projectId: z.string(),
  metadata: NovelMetadataSchema,
});

export const NovelUpdateMetadataResponseSchema = z.object({
  type: z.literal("novel.update_metadata.response"),
  payload: z.object({
    requestId: z.string(),
    novel: NovelDescriptorSchema,
  }),
});

// ---------------------------------------------------------------------------
// novel.add_volume / novel.add_chapter
// ---------------------------------------------------------------------------

export const NovelAddVolumeRequestSchema = z.object({
  type: z.literal("novel.add_volume.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const NovelAddVolumeResponseSchema = z.object({
  type: z.literal("novel.add_volume.response"),
  payload: z.object({
    requestId: z.string(),
    number: z.number().int().positive(),
    dirName: z.string(),
  }),
});

export const NovelAddChapterRequestSchema = z.object({
  type: z.literal("novel.add_chapter.request"),
  requestId: z.string(),
  projectId: z.string(),
  volume: z.number().int().positive(),
});

export const NovelAddChapterResponseSchema = z.object({
  type: z.literal("novel.add_chapter.response"),
  payload: z.object({
    requestId: z.string(),
    number: z.number().int().positive(),
    fileName: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// novel.read_chapter / novel.write_chapter
// ---------------------------------------------------------------------------

export const NovelReadChapterRequestSchema = z.object({
  type: z.literal("novel.read_chapter.request"),
  requestId: z.string(),
  projectId: z.string(),
  volume: z.number().int().positive(),
  chapter: z.number().int().positive(),
});

export const NovelReadChapterResponseSchema = z.object({
  type: z.literal("novel.read_chapter.response"),
  payload: z.object({
    requestId: z.string(),
    fileName: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    wordCount: z.number().int().nonnegative(),
    modifiedAt: z.string().nullable(),
  }),
});

export const NovelWriteChapterRequestSchema = z.object({
  type: z.literal("novel.write_chapter.request"),
  requestId: z.string(),
  projectId: z.string(),
  volume: z.number().int().positive(),
  chapter: z.number().int().positive(),
  content: z.string().max(20_000_000),
  expectedModifiedAt: z.string().nullable(),
});

export const NovelWriteChapterResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("written"), modifiedAt: z.string() }),
  z.object({ status: z.literal("conflict"), currentModifiedAt: z.string().nullable() }),
  z.object({ status: z.literal("missing") }),
]);

export const NovelWriteChapterResponseSchema = z.object({
  type: z.literal("novel.write_chapter.response"),
  payload: z.object({
    requestId: z.string(),
    result: NovelWriteChapterResultSchema,
  }),
});

// ---------------------------------------------------------------------------
// novel.list_entities / novel.upsert_entity / novel.remove_entity
// ---------------------------------------------------------------------------

export const NovelListEntitiesRequestSchema = z.object({
  type: z.literal("novel.list_entities.request"),
  requestId: z.string(),
  projectId: z.string(),
  kind: NovelEntityKindSchema,
});

export const NovelListEntitiesResponseSchema = z.object({
  type: z.literal("novel.list_entities.response"),
  payload: z.object({
    requestId: z.string(),
    kind: NovelEntityKindSchema,
    entities: z.array(z.record(z.string(), z.unknown())).default([]),
    issues: z.array(NovelValidationIssueSchema).default([]),
  }),
});

export const NovelUpsertEntityRequestSchema = z.object({
  type: z.literal("novel.upsert_entity.request"),
  requestId: z.string(),
  projectId: z.string(),
  kind: NovelEntityKindSchema,
  id: z.string().trim().min(1).max(120),
  data: z.record(z.string(), z.unknown()),
});

export const NovelUpsertEntityResponseSchema = z.object({
  type: z.literal("novel.upsert_entity.response"),
  payload: z.object({
    requestId: z.string(),
    id: z.string(),
  }),
});

export const NovelRemoveEntityRequestSchema = z.object({
  type: z.literal("novel.remove_entity.request"),
  requestId: z.string(),
  projectId: z.string(),
  kind: NovelEntityKindSchema,
  id: z.string().trim().min(1).max(120),
});

export const NovelRemoveEntityResponseSchema = z.object({
  type: z.literal("novel.remove_entity.response"),
  payload: z.object({
    requestId: z.string(),
    removed: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// novel.snapshot.create / novel.snapshot.list / novel.snapshot.restore
// ---------------------------------------------------------------------------

export const NovelSnapshotCreateRequestSchema = z.object({
  type: z.literal("novel.snapshot.create.request"),
  requestId: z.string(),
  projectId: z.string(),
  label: z.string().trim().max(200).nullable(),
});

export const NovelSnapshotCreateResponseSchema = z.object({
  type: z.literal("novel.snapshot.create.response"),
  payload: z.object({
    requestId: z.string(),
    snapshot: NovelSnapshotSchema,
  }),
});

export const NovelSnapshotListRequestSchema = z.object({
  type: z.literal("novel.snapshot.list.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const NovelSnapshotListResponseSchema = z.object({
  type: z.literal("novel.snapshot.list.response"),
  payload: z.object({
    requestId: z.string(),
    snapshots: z.array(NovelSnapshotSchema).default([]),
  }),
});

export const NovelSnapshotRestoreRequestSchema = z.object({
  type: z.literal("novel.snapshot.restore.request"),
  requestId: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
});

export const NovelSnapshotRestoreResponseSchema = z.object({
  type: z.literal("novel.snapshot.restore.response"),
  payload: z.object({
    requestId: z.string(),
    restored: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// novel.relationships.get
// ---------------------------------------------------------------------------

export const NovelRelationshipsGetRequestSchema = z.object({
  type: z.literal("novel.relationships.get.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const NovelRelationshipsGetResponseSchema = z.object({
  type: z.literal("novel.relationships.get.response"),
  payload: z.object({
    requestId: z.string(),
    snapshot: NovelRelationshipsPayloadSchema,
  }),
});

// ---------------------------------------------------------------------------
// novel.graph_layout.get / novel.graph_layout.set
// ---------------------------------------------------------------------------

export const NovelGraphLayoutGetRequestSchema = z.object({
  type: z.literal("novel.graph_layout.get.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const NovelGraphLayoutGetResponseSchema = z.object({
  type: z.literal("novel.graph_layout.get.response"),
  payload: z.object({
    requestId: z.string(),
    layout: GraphLayoutSchema.nullable(),
  }),
});

export const NovelGraphLayoutSetRequestSchema = z.object({
  type: z.literal("novel.graph_layout.set.request"),
  requestId: z.string(),
  projectId: z.string(),
  layout: GraphLayoutSchema,
});

export const NovelGraphLayoutSetResponseSchema = z.object({
  type: z.literal("novel.graph_layout.set.response"),
  payload: z.object({
    requestId: z.string(),
    saved: z.boolean(),
  }),
});
