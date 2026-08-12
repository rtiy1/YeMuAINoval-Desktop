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
 * Novel workbench state: book list, the open book's volume/chapter tree, the
 * active chapter draft, and debounced auto-save.
 *
 * Persistence goes through the `novel:*` IPC handlers
 * (electron/main/novelLibrary.ts). Tree mutations reuse the pure helpers in
 * `@/lib/novel` and immediately write novel.json; chapter body edits are
 * debounced. On the web host (no ipcRenderer) every action is a no-op and
 * `isNovelLibraryAvailable()` reports false so the page can show a hint.
 */

import { createHost } from '@/host';
import {
  addChapter,
  addVolume,
  countNovelWords,
  createEmptyBook,
  findChapter,
  moveChapter,
  removeChapter,
  removeEmptyVolume,
  renameBook,
  renameChapter,
  renameVolume,
  updateChapterWordCount,
  type NovelBookEntry,
  type NovelBookMeta,
} from '@/lib/novel';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NovelSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const AUTO_SAVE_DELAY_MS = 1500;

function novelIpc(): { invoke: (...args: any[]) => Promise<any> } | null {
  return createHost().ipcRenderer ?? null;
}

export function isNovelLibraryAvailable(): boolean {
  return novelIpc() != null;
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

interface NovelState {
  books: NovelBookEntry[];
  booksLoaded: boolean;
  libraryRoot: string | null;
  activeBookDir: string | null;
  activeBook: NovelBookMeta | null;
  activeChapterId: string | null;
  chapterContent: string;
  chapterLoading: boolean;
  saveState: NovelSaveState;

  loadBooks: () => Promise<void>;
  createBook: (
    title: string,
    firstVolumeTitle: string,
    firstChapterTitle: string
  ) => Promise<void>;
  openBook: (dir: string) => Promise<void>;
  closeBook: () => Promise<void>;
  selectChapter: (chapterId: string) => Promise<void>;
  setChapterContent: (content: string) => void;
  flushSave: () => Promise<void>;

  renameActiveBook: (title: string) => Promise<void>;
  addVolumeToActiveBook: (title: string) => Promise<void>;
  addChapterToVolume: (volumeId: string, title: string) => Promise<void>;
  renameVolumeInActiveBook: (volumeId: string, title: string) => Promise<void>;
  renameChapterInActiveBook: (
    chapterId: string,
    title: string
  ) => Promise<void>;
  moveChapterInActiveBook: (
    chapterId: string,
    direction: 'up' | 'down'
  ) => Promise<void>;
  deleteChapterFromActiveBook: (chapterId: string) => Promise<void>;
  deleteEmptyVolumeFromActiveBook: (volumeId: string) => Promise<boolean>;
  deleteBook: (dir: string) => Promise<void>;
  revealActiveBook: () => Promise<void>;
}

export const useNovelStore = create<NovelState>()(
  persist(
    (set, get) => {
      /** Write the active book's novel.json and refresh the book list entry. */
      const saveMeta = async (meta: NovelBookMeta): Promise<void> => {
        const ipc = novelIpc();
        const dir = get().activeBookDir;
        if (!ipc || !dir) return;
        set({
          activeBook: meta,
          books: get().books.map((b) => (b.dir === dir ? { ...b, meta } : b)),
        });
        await ipc.invoke('novel:save-book-meta', dir, meta);
      };

      const scheduleAutoSave = () => {
        cancelScheduledSave();
        autoSaveTimer = setTimeout(() => {
          autoSaveTimer = null;
          void get().flushSave();
        }, AUTO_SAVE_DELAY_MS);
      };

      return {
        books: [],
        booksLoaded: false,
        libraryRoot: null,
        activeBookDir: null,
        activeBook: null,
        activeChapterId: null,
        chapterContent: '',
        chapterLoading: false,
        saveState: 'idle',

        loadBooks: async () => {
          const ipc = novelIpc();
          if (!ipc) {
            set({ books: [], booksLoaded: true });
            return;
          }
          const [books, root] = await Promise.all([
            ipc.invoke('novel:list-books'),
            ipc.invoke('novel:get-root'),
          ]);
          set({
            books: Array.isArray(books) ? books : [],
            booksLoaded: true,
            libraryRoot: typeof root === 'string' ? root : null,
          });

          // Restore the persisted selection when it still exists on disk.
          const { activeBookDir, activeBook } = get();
          if (activeBookDir && !activeBook) {
            const entry = (books as NovelBookEntry[]).find(
              (b) => b.dir === activeBookDir
            );
            if (entry) {
              await get().openBook(entry.dir);
            } else {
              set({ activeBookDir: null, activeChapterId: null });
            }
          }
        },

        createBook: async (title, firstVolumeTitle, firstChapterTitle) => {
          const ipc = novelIpc();
          if (!ipc) return;
          await get().flushSave();
          const meta = createEmptyBook(
            title,
            firstVolumeTitle,
            firstChapterTitle
          );
          const entry: NovelBookEntry = await ipc.invoke(
            'novel:create-book',
            meta
          );
          set({
            books: [entry, ...get().books],
            activeBookDir: entry.dir,
            activeBook: entry.meta,
            activeChapterId: entry.meta.volumes[0]?.chapters[0]?.id ?? null,
            chapterContent: '',
            saveState: 'idle',
          });
        },

        openBook: async (dir) => {
          const ipc = novelIpc();
          if (!ipc) return;
          await get().flushSave();
          const meta: NovelBookMeta = await ipc.invoke('novel:read-book', dir);
          const persistedChapterId =
            get().activeBookDir === dir ? get().activeChapterId : null;
          const chapterId =
            persistedChapterId && findChapter(meta, persistedChapterId) !== null
              ? persistedChapterId
              : (meta.volumes.find((v) => v.chapters.length > 0)?.chapters[0]
                  ?.id ?? null);
          set({
            activeBookDir: dir,
            activeBook: meta,
            activeChapterId: null,
            chapterContent: '',
            saveState: 'idle',
          });
          if (chapterId) {
            await get().selectChapter(chapterId);
          }
        },

        closeBook: async () => {
          await get().flushSave();
          set({
            activeBookDir: null,
            activeBook: null,
            activeChapterId: null,
            chapterContent: '',
            saveState: 'idle',
          });
        },

        selectChapter: async (chapterId) => {
          const ipc = novelIpc();
          const { activeBookDir, activeBook, activeChapterId } = get();
          if (!ipc || !activeBookDir || !activeBook) return;
          if (chapterId === activeChapterId) return;
          if (!findChapter(activeBook, chapterId)) return;

          await get().flushSave();
          set({
            activeChapterId: chapterId,
            chapterLoading: true,
            chapterContent: '',
            saveState: 'idle',
          });
          const content: string = await ipc.invoke(
            'novel:read-chapter',
            activeBookDir,
            chapterId
          );
          // Ignore stale loads after a rapid chapter switch.
          if (get().activeChapterId === chapterId) {
            set({ chapterContent: content ?? '', chapterLoading: false });
          }
        },

        setChapterContent: (content) => {
          if (!get().activeChapterId) return;
          set({ chapterContent: content, saveState: 'dirty' });
          scheduleAutoSave();
        },

        flushSave: async () => {
          cancelScheduledSave();
          const ipc = novelIpc();
          const { activeBookDir, activeBook, activeChapterId, saveState } =
            get();
          if (
            !ipc ||
            !activeBookDir ||
            !activeBook ||
            !activeChapterId ||
            saveState !== 'dirty'
          ) {
            return;
          }
          const content = get().chapterContent;
          set({ saveState: 'saving' });
          try {
            await ipc.invoke(
              'novel:write-chapter',
              activeBookDir,
              activeChapterId,
              content
            );
            const withCount = updateChapterWordCount(
              get().activeBook ?? activeBook,
              activeChapterId,
              countNovelWords(content)
            );
            await saveMeta(withCount);
            // Edits made while the write was in flight re-dirty the draft.
            if (get().saveState === 'saving') {
              set({ saveState: 'saved' });
            }
          } catch (error) {
            console.error('[novelStore] save failed:', error);
            set({ saveState: 'error' });
          }
        },

        renameActiveBook: async (title) => {
          const meta = get().activeBook;
          if (!meta || !title.trim()) return;
          await saveMeta(renameBook(meta, title.trim()));
        },

        addVolumeToActiveBook: async (title) => {
          const meta = get().activeBook;
          if (!meta || !title.trim()) return;
          await saveMeta(addVolume(meta, title.trim()));
        },

        addChapterToVolume: async (volumeId, title) => {
          const ipc = novelIpc();
          const { activeBook, activeBookDir } = get();
          if (!ipc || !activeBook || !activeBookDir || !title.trim()) return;
          const result = addChapter(activeBook, volumeId, title.trim());
          if (!result) return;
          await ipc.invoke(
            'novel:write-chapter',
            activeBookDir,
            result.chapterId,
            ''
          );
          await saveMeta(result.meta);
          await get().selectChapter(result.chapterId);
        },

        renameVolumeInActiveBook: async (volumeId, title) => {
          const meta = get().activeBook;
          if (!meta || !title.trim()) return;
          await saveMeta(renameVolume(meta, volumeId, title.trim()));
        },

        renameChapterInActiveBook: async (chapterId, title) => {
          const meta = get().activeBook;
          if (!meta || !title.trim()) return;
          await saveMeta(renameChapter(meta, chapterId, title.trim()));
        },

        moveChapterInActiveBook: async (chapterId, direction) => {
          const meta = get().activeBook;
          if (!meta) return;
          const moved = moveChapter(meta, chapterId, direction);
          if (moved) await saveMeta(moved);
        },

        deleteChapterFromActiveBook: async (chapterId) => {
          const ipc = novelIpc();
          const { activeBook, activeBookDir, activeChapterId } = get();
          if (!ipc || !activeBook || !activeBookDir) return;

          if (activeChapterId === chapterId) {
            cancelScheduledSave();
            set({
              activeChapterId: null,
              chapterContent: '',
              saveState: 'idle',
            });
          }
          await ipc.invoke(
            'novel:delete-chapter-file',
            activeBookDir,
            chapterId
          );
          await saveMeta(removeChapter(activeBook, chapterId));
        },

        deleteEmptyVolumeFromActiveBook: async (volumeId) => {
          const meta = get().activeBook;
          if (!meta) return false;
          const next = removeEmptyVolume(meta, volumeId);
          if (!next) return false;
          await saveMeta(next);
          return true;
        },

        deleteBook: async (dir) => {
          const ipc = novelIpc();
          if (!ipc) return;
          if (get().activeBookDir === dir) {
            cancelScheduledSave();
            set({
              activeBookDir: null,
              activeBook: null,
              activeChapterId: null,
              chapterContent: '',
              saveState: 'idle',
            });
          }
          await ipc.invoke('novel:delete-book', dir);
          set({ books: get().books.filter((b) => b.dir !== dir) });
        },

        revealActiveBook: async () => {
          const ipc = novelIpc();
          const dir = get().activeBookDir;
          if (!ipc || !dir) return;
          await ipc.invoke('novel:reveal-book', dir);
        },
      };
    },
    {
      name: 'yemu-novel-workbench',
      partialize: (state) => ({
        activeBookDir: state.activeBookDir,
        activeChapterId: state.activeChapterId,
      }),
    }
  )
);

// Last-resort flush so closing the window mid-debounce doesn't drop edits.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void useNovelStore.getState().flushSave();
  });
}
