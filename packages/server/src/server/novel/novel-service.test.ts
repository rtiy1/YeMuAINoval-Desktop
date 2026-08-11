import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NovelChapterMissingError,
  NovelNotFoundError,
  NovelService,
  NovelValidationError,
} from "./novel-service.js";

let tempRoot: string;
let service: NovelService;
let projectIds: string[] = [];

function createLogger() {
  return pino({ level: "silent" });
}

function project(projectId: string, rootPath: string) {
  projectIds.push(projectId);
  return { projectId, rootPath };
}

function makeService(projects: Array<{ projectId: string; rootPath: string }>) {
  return new NovelService({
    listProjectRoots: async () => projects,
    projectRootOf: async (projectId) =>
      projects.find((entry) => entry.projectId === projectId)?.rootPath ?? null,
    logger: createLogger(),
  });
}

function writeNovelYaml(rootPath: string, title: string) {
  writeFileSync(path.join(rootPath, "novel.yaml"), `title: ${title}\n`, "utf8");
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "novel-service-"));
  projectIds = [];
});

afterEach(() => {
  const { rmSync } = require("node:fs") as typeof import("node:fs");
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("NovelService", () => {
  it("lists novels only from projects with novel.yaml", async () => {
    const a = path.join(tempRoot, "novel-a");
    const b = path.join(tempRoot, "plain-project");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeNovelYaml(a, "长安雪");
    service = makeService([project("p-a", a), project("p-b", b)]);

    const novels = await service.listNovels();
    expect(novels).toHaveLength(1);
    expect(novels[0].projectId).toBe("p-a");
    expect(novels[0].title).toBe("长安雪");
  });

  it("scaffolds the standard directory layout on create", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);

    const novel = await service.createNovel("p-1", "测试之书");
    expect(novel.title).toBe("测试之书");
    expect(existsSync(path.join(root, "manuscript", "volume-01"))).toBe(true);
    expect(existsSync(path.join(root, "manuscript", "fragments"))).toBe(true);
    expect(existsSync(path.join(root, "outline"))).toBe(true);
    expect(existsSync(path.join(root, "story-bible", "characters"))).toBe(true);
    expect(existsSync(path.join(root, "story-bible", "locations"))).toBe(true);
    expect(existsSync(path.join(root, "story-bible", "factions"))).toBe(true);
    expect(existsSync(path.join(root, "story-bible", "items"))).toBe(true);
    expect(existsSync(path.join(root, "timeline"))).toBe(true);
    expect(existsSync(path.join(root, "research"))).toBe(true);
    expect(existsSync(path.join(root, "assets"))).toBe(true);
    expect(existsSync(path.join(root, "exports"))).toBe(true);
    expect(existsSync(path.join(root, ".yemu", "snapshots"))).toBe(true);
    expect(readFileSync(path.join(root, "novel.yaml"), "utf8")).toContain("测试之书");
  });

  it("rejects creating a novel twice", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "第一本");
    await expect(service.createNovel("p-1", "第二本")).rejects.toThrow(/already exists/);
  });

  it("adds volumes and chapters with zero-padded names", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");

    // volume-01 is scaffolded with the standard layout, so the first explicit
    // volume is 02.
    const volume = await service.addVolume("p-1");
    expect(volume.dirName).toBe("volume-02");
    const chapter = await service.addChapter("p-1", volume.number);
    expect(chapter.fileName).toBe("chapter-001.md");

    const chapter2 = await service.addChapter("p-1", volume.number);
    expect(chapter2.fileName).toBe("chapter-002.md");

    const volume2 = await service.addVolume("p-1");
    expect(volume2.dirName).toBe("volume-03");

    const { tree } = await service.getNovel("p-1");
    expect(tree.volumes).toHaveLength(3);
    expect(tree.volumes[1].chapters.map((entry) => entry.number)).toEqual([1, 2]);
  });

  it("reads and writes chapters with conflict detection", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    await service.addVolume("p-1");
    const chapter = await service.addChapter("p-1", 1);

    const read = await service.readChapter("p-1", 1, chapter.number);
    expect(read.fileName).toBe("chapter-001.md");

    const written = await service.writeChapter(
      "p-1",
      1,
      chapter.number,
      "# 第一章 雪落\n\n长安的雪落了一夜。",
      null,
    );
    expect(written.status).toBe("written");
    if (written.status === "written") {
      const conflict = await service.writeChapter(
        "p-1",
        1,
        chapter.number,
        "覆盖",
        "2000-01-01T00:00:00.000Z",
      );
      expect(conflict.status).toBe("conflict");
    }

    const reread = await service.readChapter("p-1", 1, chapter.number);
    expect(reread.content).toContain("长安的雪落了一夜");
    expect(reread.wordCount).toBe(14);
    expect(reread.title).toBe("第一章 雪落");
  });

  it("rejects writing a missing chapter and reading one", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    const result = await service.writeChapter("p-1", 1, 9, "内容", null);
    expect(result.status).toBe("missing");
    await expect(service.readChapter("p-1", 1, 9)).rejects.toBeInstanceOf(NovelChapterMissingError);
  });

  it("upserts, lists and removes story bible entities", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");

    await service.upsertEntity("p-1", "characters", "lin-wan", {
      name: "林晚",
      role: "protagonist",
      faction: null,
      status: "active",
    });
    await service.upsertEntity("p-1", "factions", "faction-qin", {
      name: "秦楼",
    });

    const characters = await service.listEntitiesForProject("p-1", "characters");
    expect(characters.entities).toHaveLength(1);
    expect(characters.entities[0].id).toBe("lin-wan");
    expect((characters.entities[0] as { name: string }).name).toBe("林晚");
    expect(characters.issues).toEqual([]);

    await expect(
      service.upsertEntity("p-1", "characters", "bad", { role: "narrator" } as never),
    ).rejects.toBeInstanceOf(NovelValidationError);

    expect(await service.removeEntity("p-1", "characters", "lin-wan")).toBe(true);
    expect(await service.removeEntity("p-1", "characters", "lin-wan")).toBe(false);
    const after = await service.listEntitiesForProject("p-1", "characters");
    expect(after.entities).toHaveLength(0);
  });

  it("creates, lists and restores directory snapshots", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    await service.addVolume("p-1");
    await service.addChapter("p-1", 1);
    await service.writeChapter("p-1", 1, 1, "第一章 雪落", null);

    const snapshot = await service.createSnapshot("p-1", "第一章完成");
    expect(snapshot.kind).toBe("directory");
    const snapshots = await service.listSnapshotsForProject("p-1");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe("第一章完成");

    await service.writeChapter("p-1", 1, 1, "被覆盖的内容", null);
    expect((await service.readChapter("p-1", 1, 1)).content).toBe("被覆盖的内容");

    const restored = await service.restoreSnapshot("p-1", snapshot.id);
    expect(restored).toBe(true);
    expect((await service.readChapter("p-1", 1, 1)).content).toBe("第一章 雪落");
    expect(existsSync(path.join(root, "novel.yaml"))).toBe(true);
  });

  it("restore ignores unknown snapshot ids and rejects non-novel roots", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await expect(service.restoreSnapshot("p-1", "snap-nope")).rejects.toBeInstanceOf(
      NovelNotFoundError,
    );
    await service.createNovel("p-1", "长安雪");
    expect(await service.restoreSnapshot("p-1", "snap-nope")).toBe(false);
  });

  it("exposes relationships and graph layout", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    await service.upsertEntity("p-1", "characters", "lin-wan", {
      name: "林晚",
      role: "protagonist",
    });
    await service.upsertEntity("p-1", "characters", "gu-ye", {
      name: "顾夜",
      role: "antagonist",
    });
    writeFileSync(
      path.join(root, "relationships.yaml"),
      [
        "schemaVersion: 1",
        "relationships:",
        "  - id: rel-1",
        "    source: lin-wan",
        "    target: gu-ye",
        "    type: conflict",
        "    strength: 4",
        "",
      ].join("\n"),
      "utf8",
    );

    const graph = await service.getRelationships("p-1");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].sourceLabel).toBe("林晚");
    expect(graph.edges[0].targetLabel).toBe("顾夜");
    expect(graph.issues.filter((issue) => issue.severity === "error")).toEqual([]);

    expect(await service.getGraphLayout("p-1")).toBeNull();
    await service.setGraphLayout("p-1", {
      nodes: { "lin-wan": { x: 1, y: 2 } },
      revision: 3,
    });
    const layout = await service.getGraphLayout("p-1");
    expect(layout?.nodes["lin-wan"]).toEqual({ x: 1, y: 2 });
    expect(layout?.revision).toBe(3);
    expect(existsSync(path.join(root, ".yemu", "graph-layout.json"))).toBe(true);
  });

  it("reports dangling relationship references as issues", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    writeFileSync(
      path.join(root, "relationships.yaml"),
      [
        "schemaVersion: 1",
        "relationships:",
        "  - id: rel-ghost",
        "    source: lin-wan",
        "    target: ghost-person",
        "    type: alliance",
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await service.getRelationships("p-1");
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(1);
    expect(graph.issues.some((issue) => issue.message.includes("ghost-person"))).toBe(true);
  });

  it("keeps an unreadable relationships.yaml from breaking the snapshot", async () => {
    const root = path.join(tempRoot, "novel");
    mkdirSync(root, { recursive: true });
    service = makeService([project("p-1", root)]);
    await service.createNovel("p-1", "长安雪");
    writeFileSync(path.join(root, "relationships.yaml"), "relationships: [unclosed\n", "utf8");
    const graph = await service.getRelationships("p-1");
    expect(graph.edges).toEqual([]);
    expect(graph.issues.length).toBeGreaterThan(0);
  });
});
