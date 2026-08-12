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
 * Novel workbench local library.
 *
 * Layout on disk (all under `<documents>/YeMuNovels`):
 *
 *   <root>/<bookDir>/novel.json            book metadata + volume/chapter tree
 *   <root>/<bookDir>/chapters/<id>.md      chapter body (markdown/plain text)
 *   <root>/<bookDir>/.trash/               soft-deleted chapter files
 *
 * The JSON manifest is the source of truth for ordering and titles; chapter
 * files are addressed only by their generated id, so renames never touch the
 * filesystem. Plain files keep the library user-inspectable and directly
 * readable by the agent runtime later.
 */

import { app, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface NovelChapterMeta {
  id: string;
  title: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

interface NovelVolume {
  id: string;
  title: string;
  chapters: NovelChapterMeta[];
}

interface NovelBookMeta {
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

const CHAPTER_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function libraryRoot(): string {
  return path.join(app.getPath('documents'), 'YeMuNovels');
}

function ensureLibraryRoot(): string {
  const root = libraryRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Resolve a book folder name to an absolute path, rejecting anything that
 * escapes the library root (path separators, `..`, absolute paths).
 */
function resolveBookPath(bookDir: string): string {
  if (
    typeof bookDir !== 'string' ||
    bookDir.length === 0 ||
    bookDir === '.' ||
    bookDir === '..' ||
    bookDir.includes('/') ||
    bookDir.includes('\\') ||
    path.isAbsolute(bookDir)
  ) {
    throw new Error(`Invalid book dir: ${bookDir}`);
  }
  const root = ensureLibraryRoot();
  const resolved = path.resolve(root, bookDir);
  if (resolved !== path.join(root, bookDir)) {
    throw new Error(`Invalid book dir: ${bookDir}`);
  }
  return resolved;
}

function assertChapterId(chapterId: string): void {
  if (typeof chapterId !== 'string' || !CHAPTER_ID_RE.test(chapterId)) {
    throw new Error(`Invalid chapter id: ${chapterId}`);
  }
}

function chapterFilePath(bookPath: string, chapterId: string): string {
  return path.join(bookPath, 'chapters', `${chapterId}.md`);
}

/** Atomic JSON write: temp file in the same dir, then rename over the target. */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readBookMeta(bookPath: string): NovelBookMeta | null {
  try {
    const raw = fs.readFileSync(path.join(bookPath, 'novel.json'), 'utf-8');
    const meta = JSON.parse(raw) as NovelBookMeta;
    if (!meta || typeof meta !== 'object' || !Array.isArray(meta.volumes)) {
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

/**
 * Derive a filesystem-safe folder name from the book title, appending `-2`,
 * `-3`, ... on collision. The folder name is fixed at creation time; later
 * title renames only touch novel.json.
 */
function allocateBookDir(root: string, title: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|.\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 60) || 'untitled';
  let candidate = base;
  let n = 2;
  while (fs.existsSync(path.join(root, candidate))) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

function listBooks(): NovelBookEntry[] {
  const root = ensureLibraryRoot();
  const entries: NovelBookEntry[] = [];
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith('.')) continue;
    const bookPath = path.join(root, name);
    try {
      if (!fs.statSync(bookPath).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = readBookMeta(bookPath);
    if (meta) entries.push({ dir: name, meta });
  }
  return entries.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
}

function createBook(meta: NovelBookMeta): NovelBookEntry {
  const root = ensureLibraryRoot();
  const dir = allocateBookDir(root, meta.title);
  const bookPath = path.join(root, dir);
  fs.mkdirSync(path.join(bookPath, 'chapters'), { recursive: true });
  writeJsonAtomic(path.join(bookPath, 'novel.json'), meta);
  for (const volume of meta.volumes) {
    for (const chapter of volume.chapters) {
      assertChapterId(chapter.id);
      const file = chapterFilePath(bookPath, chapter.id);
      if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf-8');
    }
  }
  return { dir, meta };
}

export function registerNovelLibraryIpcHandlers(): void {
  ipcMain.handle('novel:get-root', () => ensureLibraryRoot());

  ipcMain.handle('novel:list-books', () => listBooks());

  ipcMain.handle('novel:create-book', (_event, meta: NovelBookMeta) =>
    createBook(meta)
  );

  ipcMain.handle('novel:read-book', (_event, bookDir: string) => {
    const meta = readBookMeta(resolveBookPath(bookDir));
    if (!meta) throw new Error(`novel.json not found in ${bookDir}`);
    return meta;
  });

  ipcMain.handle(
    'novel:save-book-meta',
    (_event, bookDir: string, meta: NovelBookMeta) => {
      const bookPath = resolveBookPath(bookDir);
      writeJsonAtomic(path.join(bookPath, 'novel.json'), meta);
      return { success: true };
    }
  );

  ipcMain.handle(
    'novel:read-chapter',
    (_event, bookDir: string, chapterId: string) => {
      assertChapterId(chapterId);
      const file = chapterFilePath(resolveBookPath(bookDir), chapterId);
      try {
        return fs.readFileSync(file, 'utf-8');
      } catch {
        return '';
      }
    }
  );

  ipcMain.handle(
    'novel:write-chapter',
    (_event, bookDir: string, chapterId: string, content: string) => {
      assertChapterId(chapterId);
      const bookPath = resolveBookPath(bookDir);
      fs.mkdirSync(path.join(bookPath, 'chapters'), { recursive: true });
      fs.writeFileSync(
        chapterFilePath(bookPath, chapterId),
        content ?? '',
        'utf-8'
      );
      return { success: true };
    }
  );

  // Soft delete: keep the body under .trash so a mis-click never loses prose.
  ipcMain.handle(
    'novel:delete-chapter-file',
    (_event, bookDir: string, chapterId: string) => {
      assertChapterId(chapterId);
      const bookPath = resolveBookPath(bookDir);
      const file = chapterFilePath(bookPath, chapterId);
      if (fs.existsSync(file)) {
        const trashDir = path.join(bookPath, '.trash');
        fs.mkdirSync(trashDir, { recursive: true });
        fs.renameSync(
          file,
          path.join(trashDir, `${chapterId}-${Date.now()}.md`)
        );
      }
      return { success: true };
    }
  );

  ipcMain.handle('novel:delete-book', async (_event, bookDir: string) => {
    const bookPath = resolveBookPath(bookDir);
    if (fs.existsSync(bookPath)) {
      await shell.trashItem(bookPath);
    }
    return { success: true };
  });

  ipcMain.handle('novel:reveal-book', (_event, bookDir: string) => {
    const bookPath = resolveBookPath(bookDir);
    return shell.openPath(bookPath);
  });
}
