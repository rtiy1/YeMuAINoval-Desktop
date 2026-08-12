// ========= Copyright 2025-2026 @ YeMu All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ YeMu All Rights Reserved. =========

/**
 * Novel workbench domain model and pure tree operations.
 *
 * Mirrors the on-disk JSON protocol owned by `electron/main/novelLibrary.ts`:
 * `novel.json` is the source of truth for titles and ordering, chapter bodies
 * live in separate `chapters/<id>.md` files addressed only by id.
 *
 * All operations are immutable (return a new meta) so the store can hand
 * snapshots straight to React and persistence stays a single "write current
 * meta" call.
 */

export interface NovelChapterMeta {
  id: string;
  title: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface NovelVolume {
  id: string;
  title: string;
  chapters: NovelChapterMeta[];
}

export interface NovelBookMeta {
  id: string;
  title: string;
  author: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  volumes: NovelVolume[];
}

export interface NovelBookEntry {
  /** Folder name under the library root (single path segment). */
  dir: string;
  meta: NovelBookMeta;
}

export function newNovelId(prefix: 'b' | 'v' | 'c'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Word count for CJK-heavy prose: strip all whitespace, count Unicode code
 * points. Matches how Chinese writing tools report 字数.
 */
export function countNovelWords(text: string): number {
  if (!text) return 0;
  return [...text.replace(/\s/g, '')].length;
}

export function createEmptyBook(
  title: string,
  firstVolumeTitle: string,
  firstChapterTitle: string
): NovelBookMeta {
  const now = Date.now();
  return {
    id: newNovelId('b'),
    title,
    author: '',
    summary: '',
    createdAt: now,
    updatedAt: now,
    volumes: [
      {
        id: newNovelId('v'),
        title: firstVolumeTitle,
        chapters: [
          {
            id: newNovelId('c'),
            title: firstChapterTitle,
            wordCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
  };
}

export function findChapter(
  meta: NovelBookMeta,
  chapterId: string
): { volume: NovelVolume; chapter: NovelChapterMeta } | null {
  for (const volume of meta.volumes) {
    const chapter = volume.chapters.find((c) => c.id === chapterId);
    if (chapter) return { volume, chapter };
  }
  return null;
}

/** All chapters in reading order (volume order, then chapter order). */
export function flattenChapters(meta: NovelBookMeta): NovelChapterMeta[] {
  return meta.volumes.flatMap((v) => v.chapters);
}

export function totalWordCount(meta: NovelBookMeta): number {
  return flattenChapters(meta).reduce((sum, c) => sum + (c.wordCount || 0), 0);
}

function touch(meta: NovelBookMeta): NovelBookMeta {
  return { ...meta, updatedAt: Date.now() };
}

export function renameBook(meta: NovelBookMeta, title: string): NovelBookMeta {
  return touch({ ...meta, title });
}

export function addVolume(meta: NovelBookMeta, title: string): NovelBookMeta {
  const volume: NovelVolume = { id: newNovelId('v'), title, chapters: [] };
  return touch({ ...meta, volumes: [...meta.volumes, volume] });
}

export function renameVolume(
  meta: NovelBookMeta,
  volumeId: string,
  title: string
): NovelBookMeta {
  return touch({
    ...meta,
    volumes: meta.volumes.map((v) => (v.id === volumeId ? { ...v, title } : v)),
  });
}

/** Only empty volumes can be removed; returns null when the volume has chapters. */
export function removeEmptyVolume(
  meta: NovelBookMeta,
  volumeId: string
): NovelBookMeta | null {
  const volume = meta.volumes.find((v) => v.id === volumeId);
  if (!volume || volume.chapters.length > 0) return null;
  return touch({
    ...meta,
    volumes: meta.volumes.filter((v) => v.id !== volumeId),
  });
}

export function addChapter(
  meta: NovelBookMeta,
  volumeId: string,
  title: string
): { meta: NovelBookMeta; chapterId: string } | null {
  if (!meta.volumes.some((v) => v.id === volumeId)) return null;
  const now = Date.now();
  const chapter: NovelChapterMeta = {
    id: newNovelId('c'),
    title,
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const next = touch({
    ...meta,
    volumes: meta.volumes.map((v) =>
      v.id === volumeId ? { ...v, chapters: [...v.chapters, chapter] } : v
    ),
  });
  return { meta: next, chapterId: chapter.id };
}

export function renameChapter(
  meta: NovelBookMeta,
  chapterId: string,
  title: string
): NovelBookMeta {
  return touch({
    ...meta,
    volumes: meta.volumes.map((v) =>
      v.chapters.some((c) => c.id === chapterId)
        ? {
            ...v,
            chapters: v.chapters.map((c) =>
              c.id === chapterId ? { ...c, title, updatedAt: Date.now() } : c
            ),
          }
        : v
    ),
  });
}

export function removeChapter(
  meta: NovelBookMeta,
  chapterId: string
): NovelBookMeta {
  return touch({
    ...meta,
    volumes: meta.volumes.map((v) =>
      v.chapters.some((c) => c.id === chapterId)
        ? { ...v, chapters: v.chapters.filter((c) => c.id !== chapterId) }
        : v
    ),
  });
}

export function updateChapterWordCount(
  meta: NovelBookMeta,
  chapterId: string,
  wordCount: number
): NovelBookMeta {
  return touch({
    ...meta,
    volumes: meta.volumes.map((v) =>
      v.chapters.some((c) => c.id === chapterId)
        ? {
            ...v,
            chapters: v.chapters.map((c) =>
              c.id === chapterId
                ? { ...c, wordCount, updatedAt: Date.now() }
                : c
            ),
          }
        : v
    ),
  });
}

/**
 * Move a chapter one position up or down within its volume. Returns null when
 * the move is out of range (already first/last) so callers can skip a save.
 */
export function moveChapter(
  meta: NovelBookMeta,
  chapterId: string,
  direction: 'up' | 'down'
): NovelBookMeta | null {
  for (const volume of meta.volumes) {
    const index = volume.chapters.findIndex((c) => c.id === chapterId);
    if (index === -1) continue;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= volume.chapters.length) return null;
    const chapters = [...volume.chapters];
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    return touch({
      ...meta,
      volumes: meta.volumes.map((v) =>
        v.id === volume.id ? { ...v, chapters } : v
      ),
    });
  }
  return null;
}
