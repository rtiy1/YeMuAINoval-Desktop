import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import type pino from "pino";
import {
  dumpYamlFile,
  formatChapterFileName,
  formatVolumeDirName,
  isChapterFileName,
  isVolumeDirName,
  nextChapterNumber,
  nextVolumeNumber,
  NOVEL_DIRECTORY_LAYOUT,
  NOVEL_MANIFEST_FILE,
  parseChapterNumber,
  parseVolumeNumber,
  parseYamlFile,
  SNAPSHOTS_DIR,
  type Character,
  type CharacterIndex,
  type CharacterRelationshipEdge,
  type Faction,
  type GraphLayout,
  type Location,
  type NovelMetadata,
  type NovelValidationIssue,
  type Relationship,
  RelationshipsFileSchema,
  sortChapterNumbers,
  sortVolumeNumbers,
  summarizeNovelText,
  validateCharacterIndex,
  validateRelationships,
  withoutId,
  NovelMetadataSchema,
  CharacterSchema,
  LocationSchema,
  FactionSchema,
  ItemSchema,
  type CharacterGraphNode,
} from "@yemu/novel-core";
import type {
  NovelChapterEntry,
  NovelDescriptor,
  NovelEntityKind,
  NovelSnapshot,
  NovelTree,
  NovelVolumeEntry,
} from "@yemu/protocol/messages";

export class NovelNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Novel project not found: ${projectId}`);
    this.name = "NovelNotFoundError";
  }
}

export class NovelValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: NovelValidationIssue[],
  ) {
    super(message);
    this.name = "NovelValidationError";
  }
}

export class NovelChapterMissingError extends Error {
  constructor(volume: number, chapter: number) {
    super(`Chapter ${volume}/${chapter} does not exist`);
    this.name = "NovelChapterMissingError";
  }
}

const SnapshotManifestSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
  kind: z.literal("directory"),
});

interface ProjectRootInfo {
  projectId: string;
  rootPath: string;
}

export interface NovelServiceOptions {
  listProjectRoots: () => Promise<ProjectRootInfo[]>;
  projectRootOf: (projectId: string) => Promise<string | null>;
  logger: pino.Logger;
  now?: () => Date;
}

const ENTITY_SCHEMAS: Record<
  NovelEntityKind,
  { schema: z.ZodType<unknown>; dir: string; idLabel: string }
> = {
  characters: { schema: CharacterSchema, dir: "characters", idLabel: "character" },
  locations: { schema: LocationSchema, dir: "locations", idLabel: "location" },
  factions: { schema: FactionSchema, dir: "factions", idLabel: "faction" },
  items: { schema: ItemSchema, dir: "items", idLabel: "item" },
};

export class NovelService {
  private readonly logger: pino.Logger;
  private readonly now: () => Date;

  constructor(options: NovelServiceOptions) {
    this.listProjectRoots = options.listProjectRoots;
    this.projectRootOf = options.projectRootOf;
    this.logger = options.logger.child({ module: "novel-service" });
    this.now = options.now ?? (() => new Date());
  }

  private readonly listProjectRoots: NovelServiceOptions["listProjectRoots"];
  private readonly projectRootOf: NovelServiceOptions["projectRootOf"];

  private requireNovelRoot(rootPath: string): void {
    if (!existsSync(path.join(rootPath, NOVEL_MANIFEST_FILE))) {
      throw new NovelNotFoundError(rootPath);
    }
  }

  private async requireRoot(projectId: string): Promise<string> {
    const rootPath = await this.projectRootOf(projectId);
    if (!rootPath) {
      throw new NovelNotFoundError(projectId);
    }
    this.requireNovelRoot(rootPath);
    return rootPath;
  }

  private readYaml(filePath: string): string {
    return readFileSync(filePath, "utf8");
  }

  private readMetadata(rootPath: string): NovelMetadata {
    const filePath = path.join(rootPath, NOVEL_MANIFEST_FILE);
    if (!existsSync(filePath)) {
      throw new NovelNotFoundError(rootPath);
    }
    const result = parseYamlFile(this.readYaml(filePath), NOVEL_MANIFEST_FILE, NovelMetadataSchema);
    if (!result.ok) {
      throw new NovelValidationError(`novel.yaml is invalid`, result.issues);
    }
    return result.data;
  }

  private descriptorFor(projectId: string, rootPath: string): NovelDescriptor {
    const metadata = this.readMetadata(rootPath);
    const stat = statSync(rootPath);
    return {
      projectId,
      projectRootPath: rootPath,
      title: metadata.title,
      updatedAt: metadata.updatedAt ?? stat.mtime.toISOString(),
    };
  }

  async listNovels(): Promise<NovelDescriptor[]> {
    const projects = await this.listProjectRoots();
    const novels: NovelDescriptor[] = [];
    for (const project of projects) {
      if (!existsSync(path.join(project.rootPath, NOVEL_MANIFEST_FILE))) {
        continue;
      }
      try {
        novels.push(this.descriptorFor(project.projectId, project.rootPath));
      } catch (error) {
        this.logger.warn({ err: error, projectId: project.projectId }, "Skipping invalid novel");
      }
    }
    return novels;
  }

  async createNovel(projectId: string, title: string): Promise<NovelDescriptor> {
    const rootPath = await this.projectRootOf(projectId);
    if (!rootPath) {
      throw new NovelNotFoundError(projectId);
    }
    if (existsSync(path.join(rootPath, NOVEL_MANIFEST_FILE))) {
      throw new Error(`Novel already exists in ${rootPath}`);
    }
    for (const directory of NOVEL_DIRECTORY_LAYOUT) {
      mkdirSync(path.join(rootPath, directory), { recursive: true });
    }
    const now = this.now().toISOString();
    const metadata: NovelMetadata = {
      schemaVersion: 1,
      title,
      author: null,
      genres: [],
      synopsis: null,
      status: "drafting",
      styleGuide: null,
      createdAt: now,
      updatedAt: now,
    };
    writeFileSync(path.join(rootPath, NOVEL_MANIFEST_FILE), dumpYamlFile(metadata), "utf8");
    return this.descriptorFor(projectId, rootPath);
  }

  async getNovel(projectId: string): Promise<{
    novel: NovelDescriptor;
    metadata: NovelMetadata;
    tree: NovelTree;
  }> {
    const rootPath = await this.requireRoot(projectId);
    return {
      novel: this.descriptorFor(projectId, rootPath),
      metadata: this.readMetadata(rootPath),
      tree: this.scanTree(rootPath),
    };
  }

  async updateMetadata(projectId: string, metadata: NovelMetadata): Promise<NovelDescriptor> {
    const rootPath = await this.requireRoot(projectId);
    const next: NovelMetadata = {
      ...metadata,
      schemaVersion: metadata.schemaVersion ?? 1,
      updatedAt: this.now().toISOString(),
    };
    writeFileSync(path.join(rootPath, NOVEL_MANIFEST_FILE), dumpYamlFile(next), "utf8");
    return this.descriptorFor(projectId, rootPath);
  }

  scanTree(rootPath: string): NovelTree {
    const manuscriptRoot = path.join(rootPath, "manuscript");
    const volumes: NovelVolumeEntry[] = [];
    if (existsSync(manuscriptRoot)) {
      const volumeNumbers = readdirSync(manuscriptRoot)
        .filter((name) => isVolumeDirName(name))
        .map((name) => parseVolumeNumber(name))
        .filter((number): number is number => number !== null);
      for (const volumeNumber of sortVolumeNumbers(volumeNumbers)) {
        const dirName = formatVolumeDirName(volumeNumber);
        const volumePath = path.join(manuscriptRoot, dirName);
        const chapters: NovelChapterEntry[] = [];
        const chapterNumbers = readdirSync(volumePath)
          .filter((name) => isChapterFileName(name))
          .map((name) => parseChapterNumber(name))
          .filter((number): number is number => number !== null);
        for (const chapterNumber of sortChapterNumbers(chapterNumbers)) {
          const fileName = formatChapterFileName(chapterNumber);
          const chapter = this.scanChapter(volumePath, fileName);
          if (chapter) {
            chapters.push(chapter);
          }
        }
        volumes.push({ number: volumeNumber, dirName, chapters });
      }
    }
    const fragmentsDir = path.join(manuscriptRoot, "fragments");
    const fragments: string[] = existsSync(fragmentsDir)
      ? readdirSync(fragmentsDir)
          .filter((name) => name.endsWith(".md"))
          .sort()
      : [];
    return { volumes, fragments };
  }

  private scanChapter(volumePath: string, fileName: string): NovelChapterEntry | null {
    const filePath = path.join(volumePath, fileName);
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, "utf8");
    const number = parseChapterNumber(fileName);
    if (number === null) {
      return null;
    }
    return {
      number,
      fileName,
      title: extractChapterTitle(content),
      wordCount: summarizeNovelText(content).characters,
      modifiedAt: statSync(filePath).mtime.toISOString(),
    };
  }

  async addVolume(projectId: string): Promise<{ number: number; dirName: string }> {
    const rootPath = await this.requireRoot(projectId);
    const tree = this.scanTree(rootPath);
    const number = nextVolumeNumber(tree.volumes.map((volume) => volume.number));
    const dirName = formatVolumeDirName(number);
    mkdirSync(path.join(rootPath, "manuscript", dirName), { recursive: true });
    return { number, dirName };
  }

  async addChapter(
    projectId: string,
    volume: number,
  ): Promise<{ number: number; fileName: string }> {
    const rootPath = await this.requireRoot(projectId);
    const tree = this.scanTree(rootPath);
    const volumeEntry = tree.volumes.find((entry) => entry.number === volume);
    const number = nextChapterNumber(
      (volumeEntry?.chapters ?? []).map((chapter) => chapter.number),
    );
    const fileName = formatChapterFileName(number);
    const filePath = path.join(rootPath, "manuscript", formatVolumeDirName(volume), fileName);
    writeFileSync(filePath, `# ${fileName.replace(".md", "")}\n\n`, "utf8");
    return { number, fileName };
  }

  private resolveChapterPath(
    rootPath: string,
    volume: number,
    chapter: number,
  ): { filePath: string; volumeDir: string; fileName: string } {
    const volumeDir = formatVolumeDirName(volume);
    const fileName = formatChapterFileName(chapter);
    const filePath = path.join(rootPath, "manuscript", volumeDir, fileName);
    return { filePath, volumeDir, fileName };
  }

  async readChapter(
    projectId: string,
    volume: number,
    chapter: number,
  ): Promise<{
    fileName: string;
    title: string | null;
    content: string;
    wordCount: number;
    modifiedAt: string | null;
  }> {
    const rootPath = await this.requireRoot(projectId);
    const { filePath, fileName } = this.resolveChapterPath(rootPath, volume, chapter);
    if (!existsSync(filePath)) {
      throw new NovelChapterMissingError(volume, chapter);
    }
    const content = readFileSync(filePath, "utf8");
    return {
      fileName,
      title: extractChapterTitle(content),
      content,
      wordCount: summarizeNovelText(content).characters,
      modifiedAt: statSync(filePath).mtime.toISOString(),
    };
  }

  async writeChapter(
    projectId: string,
    volume: number,
    chapter: number,
    content: string,
    expectedModifiedAt: string | null,
  ): Promise<
    | { status: "written"; modifiedAt: string }
    | { status: "conflict"; currentModifiedAt: string | null }
    | { status: "missing" }
  > {
    const rootPath = await this.requireRoot(projectId);
    const { filePath } = this.resolveChapterPath(rootPath, volume, chapter);
    if (!existsSync(filePath)) {
      return { status: "missing" };
    }
    const currentModifiedAt = statSync(filePath).mtime.toISOString();
    if (expectedModifiedAt !== null && expectedModifiedAt !== currentModifiedAt) {
      return { status: "conflict", currentModifiedAt };
    }
    writeFileSync(filePath, content, "utf8");
    return { status: "written", modifiedAt: statSync(filePath).mtime.toISOString() };
  }

  // -------------------------------------------------------------------------
  // Story bible entities
  // -------------------------------------------------------------------------

  private entityDirFor(kind: NovelEntityKind): string {
    return path.join("story-bible", ENTITY_SCHEMAS[kind].dir);
  }

  private entityFilePath(rootPath: string, kind: NovelEntityKind, id: string): string {
    return path.join(rootPath, this.entityDirFor(kind), `${id}.yaml`);
  }

  listEntities(
    rootPath: string,
    kind: NovelEntityKind,
  ): { entities: Array<Record<string, unknown>>; issues: NovelValidationIssue[] } {
    const dir = path.join(rootPath, this.entityDirFor(kind));
    const issues: NovelValidationIssue[] = [];
    const entities: Array<Record<string, unknown>> = [];
    if (!existsSync(dir)) {
      return { entities, issues };
    }
    const schemaInfo = ENTITY_SCHEMAS[kind];
    for (const fileName of readdirSync(dir)
      .filter((name) => name.endsWith(".yaml"))
      .sort()) {
      const id = fileName.slice(0, -".yaml".length);
      const filePath = path.join(dir, fileName);
      const result = parseYamlFile(
        readFileSync(filePath, "utf8"),
        `${schemaInfo.dir}/${fileName}`,
        schemaInfo.schema,
      );
      if (!result.ok) {
        issues.push(...result.issues);
        continue;
      }
      entities.push({ id, ...withoutId(result.data as { id?: string }) });
    }
    return { entities, issues };
  }

  async listEntitiesForProject(
    projectId: string,
    kind: NovelEntityKind,
  ): Promise<{ entities: Array<Record<string, unknown>>; issues: NovelValidationIssue[] }> {
    const rootPath = await this.requireRoot(projectId);
    return this.listEntities(rootPath, kind);
  }

  async upsertEntity(
    projectId: string,
    kind: NovelEntityKind,
    id: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const rootPath = await this.requireRoot(projectId);
    const schemaInfo = ENTITY_SCHEMAS[kind];
    const result = schemaInfo.schema.safeParse(data);
    if (!result.success) {
      const issues: NovelValidationIssue[] = result.error.issues.map((issue) => ({
        file: `${schemaInfo.dir}/${id}.yaml`,
        location: issue.path.length > 0 ? issue.path.join(".") : null,
        message: issue.message,
        severity: "error" as const,
      }));
      throw new NovelValidationError(`Invalid ${schemaInfo.idLabel} payload`, issues);
    }
    const filePath = this.entityFilePath(rootPath, kind, id);
    const { id: _id, ...payload } = result.data as Record<string, unknown>;
    writeFileSync(filePath, dumpYamlFile(payload), "utf8");
    return id;
  }

  async removeEntity(projectId: string, kind: NovelEntityKind, id: string): Promise<boolean> {
    const rootPath = await this.requireRoot(projectId);
    const filePath = this.entityFilePath(rootPath, kind, id);
    if (!existsSync(filePath)) {
      return false;
    }
    rmSync(filePath);
    return true;
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  async createSnapshot(projectId: string, label: string | null): Promise<NovelSnapshot> {
    const rootPath = await this.requireRoot(projectId);
    const id = `snap-${this.now().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
    const snapshotDir = path.join(rootPath, SNAPSHOTS_DIR, id);
    mkdirSync(snapshotDir, { recursive: true });
    copyTree(rootPath, snapshotDir, (relativePath) => {
      const firstSegment = relativePath.split(path.sep)[0];
      return firstSegment === ".yemu";
    });
    const createdAt = this.now().toISOString();
    const manifest = {
      id,
      label,
      createdAt,
      kind: "directory" as const,
    };
    writeFileSync(path.join(snapshotDir, "snapshot.yaml"), dumpYamlFile(manifest), "utf8");
    return { ...manifest, commitId: null, path: snapshotDir };
  }

  listSnapshots(rootPath: string): NovelSnapshot[] {
    const snapshotsDir = path.join(rootPath, SNAPSHOTS_DIR);
    if (!existsSync(snapshotsDir)) {
      return [];
    }
    const snapshots: NovelSnapshot[] = [];
    for (const id of readdirSync(snapshotsDir).sort().toReversed()) {
      const manifestPath = path.join(snapshotsDir, id, "snapshot.yaml");
      if (!existsSync(manifestPath)) {
        continue;
      }
      const result = parseYamlFile(
        readFileSync(manifestPath, "utf8"),
        `${SNAPSHOTS_DIR}/${id}/snapshot.yaml`,
        SnapshotManifestSchema,
      );
      if (!result.ok) {
        this.logger.warn({ id }, "Skipping unreadable snapshot manifest");
        continue;
      }
      snapshots.push({ ...result.data, commitId: null, path: path.join(snapshotsDir, id) });
    }
    return snapshots;
  }

  async listSnapshotsForProject(projectId: string): Promise<NovelSnapshot[]> {
    const rootPath = await this.requireRoot(projectId);
    return this.listSnapshots(rootPath);
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<boolean> {
    const rootPath = await this.requireRoot(projectId);
    const snapshotDir = path.join(rootPath, SNAPSHOTS_DIR, snapshotId);
    if (!existsSync(path.join(snapshotDir, "snapshot.yaml"))) {
      return false;
    }
    // Clear the current tree (except .yemu internals) then copy the snapshot back.
    for (const entry of readdirSync(rootPath)) {
      if (entry === ".yemu") {
        continue;
      }
      rmSync(path.join(rootPath, entry), { recursive: true, force: true });
    }
    copyTree(snapshotDir, rootPath, (relativePath) => relativePath === "snapshot.yaml");
    return true;
  }

  // -------------------------------------------------------------------------
  // Relationships (stage D)
  // -------------------------------------------------------------------------

  private loadCharacterIndex(rootPath: string): CharacterIndex {
    const characters: Array<Character & { id: string }> = [];
    const locations: Array<Location & { id: string }> = [];
    const factions: Faction[] = [];
    const charactersDir = path.join(rootPath, "story-bible", "characters");
    if (existsSync(charactersDir)) {
      for (const fileName of readdirSync(charactersDir).filter((name) => name.endsWith(".yaml"))) {
        const id = fileName.slice(0, -".yaml".length);
        const result = parseYamlFile(
          readFileSync(path.join(charactersDir, fileName), "utf8"),
          `story-bible/characters/${fileName}`,
          CharacterSchema,
        );
        if (result.ok) {
          characters.push({ ...result.data, id: result.data.id ?? id });
        }
      }
    }
    const locationsDir = path.join(rootPath, "story-bible", "locations");
    if (existsSync(locationsDir)) {
      for (const fileName of readdirSync(locationsDir).filter((name) => name.endsWith(".yaml"))) {
        const id = fileName.slice(0, -".yaml".length);
        const result = parseYamlFile(
          readFileSync(path.join(locationsDir, fileName), "utf8"),
          `story-bible/locations/${fileName}`,
          LocationSchema,
        );
        if (result.ok) {
          locations.push({ ...result.data, id: result.data.id ?? id });
        }
      }
    }
    const factionsDir = path.join(rootPath, "story-bible", "factions");
    if (existsSync(factionsDir)) {
      for (const fileName of readdirSync(factionsDir).filter((name) => name.endsWith(".yaml"))) {
        const id = fileName.slice(0, -".yaml".length);
        const result = parseYamlFile(
          readFileSync(path.join(factionsDir, fileName), "utf8"),
          `story-bible/factions/${fileName}`,
          FactionSchema,
        );
        if (result.ok) {
          factions.push({ ...result.data, id: result.data.id ?? id });
        }
      }
    }
    return { characters, locations, factions };
  }

  async getRelationships(projectId: string): Promise<{
    revision: number;
    nodes: CharacterGraphNode[];
    edges: CharacterRelationshipEdge[];
    issues: NovelValidationIssue[];
  }> {
    const rootPath = await this.requireRoot(projectId);
    const issues: NovelValidationIssue[] = [];
    const index = this.loadCharacterIndex(rootPath);
    issues.push(
      ...validateCharacterIndex(index, {
        character: (id) => `story-bible/characters/${id}.yaml`,
        faction: (id) => `story-bible/factions/${id}.yaml`,
      }),
    );
    const nodes = index.characters.map((character) => ({
      id: character.id,
      name: character.name,
      aliases: character.aliases,
      factionId: character.faction,
      status: character.status,
      role: character.role,
    }));
    const relationshipsFile = path.join(rootPath, "relationships.yaml");
    let relationships: Relationship[] = [];
    if (existsSync(relationshipsFile)) {
      const result = parseYamlFile(
        readFileSync(relationshipsFile, "utf8"),
        "relationships.yaml",
        RelationshipsFileSchema,
      );
      if (!result.ok) {
        issues.push(...result.issues);
      } else {
        relationships = result.data.relationships;
      }
    }
    const characterIds = new Set(index.characters.map((character) => character.id));
    issues.push(...validateRelationships(relationships, characterIds));
    const characterById = new Map(index.characters.map((character) => [character.id, character]));
    const edges: CharacterRelationshipEdge[] = relationships.map((relationship) =>
      Object.assign({}, relationship, {
        sourceLabel: characterById.get(relationship.source)?.name ?? relationship.source,
        targetLabel: characterById.get(relationship.target)?.name ?? relationship.target,
      }),
    );
    const revision = Math.floor(
      (existsSync(relationshipsFile) ? statSync(relationshipsFile).mtimeMs : 0) +
        statSync(rootPath).mtimeMs,
    );
    return { revision, nodes, edges, issues };
  }

  async getGraphLayout(projectId: string): Promise<GraphLayout | null> {
    const rootPath = await this.requireRoot(projectId);
    const filePath = path.join(rootPath, ".yemu", "graph-layout.json");
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as GraphLayout;
    } catch (error) {
      this.logger.warn({ err: error }, "Discarding unreadable graph layout");
      return null;
    }
  }

  async setGraphLayout(projectId: string, layout: GraphLayout): Promise<boolean> {
    const rootPath = await this.requireRoot(projectId);
    const filePath = path.join(rootPath, ".yemu", "graph-layout.json");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(layout), "utf8");
    return true;
  }
}

function extractChapterTitle(content: string): string | null {
  const match = /^#\s+(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function copyTree(
  sourceDir: string,
  targetDir: string,
  skip: (relativePath: string) => boolean,
): void {
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = entry.name;
    if (skip(relativePath)) {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetPath, (childPath) => skip(path.join(relativePath, childPath)));
      continue;
    }
    if (entry.isSymbolicLink()) {
      copyFileSync(readlinkSync(sourcePath), targetPath);
      continue;
    }
    copyFileSync(sourcePath, targetPath);
  }
}
