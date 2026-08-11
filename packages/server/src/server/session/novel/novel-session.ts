import type pino from "pino";
import type {
  NovelAddChapterRequestMessage,
  NovelAddVolumeRequestMessage,
  NovelCreateRequestMessage,
  NovelGetRequestMessage,
  NovelGraphLayoutGetRequestMessage,
  NovelGraphLayoutSetRequestMessage,
  NovelListEntitiesRequestMessage,
  NovelListRequestMessage,
  NovelReadChapterRequestMessage,
  NovelRelationshipsGetRequestMessage,
  NovelRemoveEntityRequestMessage,
  NovelSnapshotCreateRequestMessage,
  NovelSnapshotListRequestMessage,
  NovelSnapshotRestoreRequestMessage,
  NovelUpdateMetadataRequestMessage,
  NovelUpsertEntityRequestMessage,
  NovelWriteChapterRequestMessage,
  SessionOutboundMessage,
} from "@yemu/protocol/messages";
import type { GraphLayout, NovelMetadata } from "@yemu/novel-core";
import { NovelService } from "../../novel/novel-service.js";

export interface NovelSessionOptions {
  host: {
    emit: (msg: SessionOutboundMessage) => void;
  };
  service: NovelService;
  logger: pino.Logger;
}

export class NovelSession {
  private readonly host: NovelSessionOptions["host"];
  private readonly service: NovelService;

  constructor(options: NovelSessionOptions) {
    this.host = options.host;
    this.service = options.service;
  }

  async handleListRequest(msg: NovelListRequestMessage): Promise<void> {
    const novels = await this.service.listNovels();
    this.host.emit({
      type: "novel.list.response",
      payload: { requestId: msg.requestId, novels },
    });
  }

  async handleGetRequest(msg: NovelGetRequestMessage): Promise<void> {
    const result = await this.service.getNovel(msg.projectId);
    this.host.emit({
      type: "novel.get.response",
      payload: { requestId: msg.requestId, ...result },
    });
  }

  async handleCreateRequest(msg: NovelCreateRequestMessage): Promise<void> {
    const novel = await this.service.createNovel(msg.projectId, msg.title);
    this.host.emit({
      type: "novel.create.response",
      payload: { requestId: msg.requestId, novel },
    });
  }

  async handleUpdateMetadataRequest(msg: NovelUpdateMetadataRequestMessage): Promise<void> {
    const novel = await this.service.updateMetadata(msg.projectId, msg.metadata);
    this.host.emit({
      type: "novel.update_metadata.response",
      payload: { requestId: msg.requestId, novel },
    });
  }

  async handleAddVolumeRequest(msg: NovelAddVolumeRequestMessage): Promise<void> {
    const result = await this.service.addVolume(msg.projectId);
    this.host.emit({
      type: "novel.add_volume.response",
      payload: { requestId: msg.requestId, ...result },
    });
  }

  async handleAddChapterRequest(msg: NovelAddChapterRequestMessage): Promise<void> {
    const result = await this.service.addChapter(msg.projectId, msg.volume);
    this.host.emit({
      type: "novel.add_chapter.response",
      payload: { requestId: msg.requestId, ...result },
    });
  }

  async handleReadChapterRequest(msg: NovelReadChapterRequestMessage): Promise<void> {
    const result = await this.service.readChapter(msg.projectId, msg.volume, msg.chapter);
    this.host.emit({
      type: "novel.read_chapter.response",
      payload: { requestId: msg.requestId, ...result },
    });
  }

  async handleWriteChapterRequest(msg: NovelWriteChapterRequestMessage): Promise<void> {
    const result = await this.service.writeChapter(
      msg.projectId,
      msg.volume,
      msg.chapter,
      msg.content,
      msg.expectedModifiedAt,
    );
    this.host.emit({
      type: "novel.write_chapter.response",
      payload: { requestId: msg.requestId, result },
    });
  }

  async handleListEntitiesRequest(msg: NovelListEntitiesRequestMessage): Promise<void> {
    const result = await this.service.listEntitiesForProject(msg.projectId, msg.kind);
    this.host.emit({
      type: "novel.list_entities.response",
      payload: { requestId: msg.requestId, kind: msg.kind, ...result },
    });
  }

  async handleUpsertEntityRequest(msg: NovelUpsertEntityRequestMessage): Promise<void> {
    const id = await this.service.upsertEntity(msg.projectId, msg.kind, msg.id, msg.data);
    this.host.emit({
      type: "novel.upsert_entity.response",
      payload: { requestId: msg.requestId, id },
    });
  }

  async handleRemoveEntityRequest(msg: NovelRemoveEntityRequestMessage): Promise<void> {
    const removed = await this.service.removeEntity(msg.projectId, msg.kind, msg.id);
    this.host.emit({
      type: "novel.remove_entity.response",
      payload: { requestId: msg.requestId, removed },
    });
  }

  async handleSnapshotCreateRequest(msg: NovelSnapshotCreateRequestMessage): Promise<void> {
    const snapshot = await this.service.createSnapshot(msg.projectId, msg.label);
    this.host.emit({
      type: "novel.snapshot.create.response",
      payload: { requestId: msg.requestId, snapshot },
    });
  }

  async handleSnapshotListRequest(msg: NovelSnapshotListRequestMessage): Promise<void> {
    const snapshots = await this.service.listSnapshotsForProject(msg.projectId);
    this.host.emit({
      type: "novel.snapshot.list.response",
      payload: { requestId: msg.requestId, snapshots },
    });
  }

  async handleSnapshotRestoreRequest(msg: NovelSnapshotRestoreRequestMessage): Promise<void> {
    const restored = await this.service.restoreSnapshot(msg.projectId, msg.snapshotId);
    this.host.emit({
      type: "novel.snapshot.restore.response",
      payload: { requestId: msg.requestId, restored },
    });
  }

  async handleRelationshipsGetRequest(msg: NovelRelationshipsGetRequestMessage): Promise<void> {
    const result = await this.service.getRelationships(msg.projectId);
    this.host.emit({
      type: "novel.relationships.get.response",
      payload: {
        requestId: msg.requestId,
        snapshot: { projectId: msg.projectId, ...result },
      },
    });
  }

  async handleGraphLayoutGetRequest(msg: NovelGraphLayoutGetRequestMessage): Promise<void> {
    const layout = await this.service.getGraphLayout(msg.projectId);
    this.host.emit({
      type: "novel.graph_layout.get.response",
      payload: { requestId: msg.requestId, layout },
    });
  }

  async handleGraphLayoutSetRequest(msg: NovelGraphLayoutSetRequestMessage): Promise<void> {
    const saved = await this.service.setGraphLayout(msg.projectId, msg.layout);
    this.host.emit({
      type: "novel.graph_layout.set.response",
      payload: { requestId: msg.requestId, saved },
    });
  }
}

export type { GraphLayout, NovelMetadata };
