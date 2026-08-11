/**
 * Standard directory layout for a novel project.
 *
 * A novel is a plain directory; readable setting and manuscript files are the
 * source of truth. `.yemu/` only holds rebuildable indexes, layouts and
 * snapshots.
 */

export const NOVEL_MANIFEST_FILE = "novel.yaml" as const;

export const MANUSCRIPT_DIR = "manuscript" as const;
export const OUTLINE_DIR = "outline" as const;
export const STORY_BIBLE_DIR = "story-bible" as const;
export const TIMELINE_DIR = "timeline" as const;
export const RESEARCH_DIR = "research" as const;
export const ASSETS_DIR = "assets" as const;
export const EXPORTS_DIR = "exports" as const;
export const INTERNAL_DIR = ".yemu" as const;

export const STORY_BIBLE_SUBDIRS = ["characters", "locations", "factions", "items"] as const;

export type StoryBibleKind = (typeof STORY_BIBLE_SUBDIRS)[number];

export const SNAPSHOTS_DIR = ".yemu/snapshots" as const;
export const GRAPH_LAYOUT_FILE = ".yemu/graph-layout.json" as const;
export const INDEX_DB_FILE = ".yemu/index.sqlite" as const;

/** Directories created when scaffolding a new novel. */
export const NOVEL_DIRECTORY_LAYOUT: readonly string[] = [
  MANUSCRIPT_DIR,
  `${MANUSCRIPT_DIR}/volume-01`,
  `${MANUSCRIPT_DIR}/fragments`,
  OUTLINE_DIR,
  `${STORY_BIBLE_DIR}/characters`,
  `${STORY_BIBLE_DIR}/locations`,
  `${STORY_BIBLE_DIR}/factions`,
  `${STORY_BIBLE_DIR}/items`,
  TIMELINE_DIR,
  RESEARCH_DIR,
  ASSETS_DIR,
  EXPORTS_DIR,
  INTERNAL_DIR,
  SNAPSHOTS_DIR,
] as const;

/** Chapter file name pattern: `chapter-001.md`. */
const CHAPTER_FILE_PATTERN = /^chapter-(\d{3})\.md$/;
/** Volume directory name pattern: `volume-01`. */
const VOLUME_DIR_PATTERN = /^volume-(\d{2})$/;
/** Chapter reference pattern used in YAML (`fromChapter`/`toChapter`). */
export const CHAPTER_REF_PATTERN = /^chapter-(\d{3})$/;

export function formatVolumeDirName(number: number): string {
  return `volume-${String(number).padStart(2, "0")}`;
}

export function formatChapterFileName(number: number): string {
  return `chapter-${String(number).padStart(3, "0")}.md`;
}

export function isVolumeDirName(name: string): boolean {
  return VOLUME_DIR_PATTERN.test(name);
}

export function isChapterFileName(name: string): boolean {
  return CHAPTER_FILE_PATTERN.test(name);
}

export function parseVolumeNumber(dirName: string): number | null {
  const match = VOLUME_DIR_PATTERN.exec(dirName);
  return match ? Number(match[1]) : null;
}

export function parseChapterNumber(fileName: string): number | null {
  const match = CHAPTER_FILE_PATTERN.exec(fileName);
  return match ? Number(match[1]) : null;
}

export function parseChapterRef(reference: string): number | null {
  const match = CHAPTER_REF_PATTERN.exec(reference);
  return match ? Number(match[1]) : null;
}

/** Highest chapter number across all volumes, or null when empty. */
export function nextChapterNumber(volumeNumbers: readonly number[]): number {
  if (volumeNumbers.length === 0) {
    return 1;
  }
  const max = Math.max(...volumeNumbers);
  return max + 1;
}

/** Highest volume number across all volumes, or null when empty. */
export function nextVolumeNumber(volumeNumbers: readonly number[]): number {
  if (volumeNumbers.length === 0) {
    return 1;
  }
  const max = Math.max(...volumeNumbers);
  return max + 1;
}

/** Sort volume numbers ascending (stable for UI trees). */
export function sortVolumeNumbers(numbers: readonly number[]): number[] {
  return [...numbers].sort((a, b) => a - b);
}

export function sortChapterNumbers(numbers: readonly number[]): number[] {
  return [...numbers].sort((a, b) => a - b);
}
