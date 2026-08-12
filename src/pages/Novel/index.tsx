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
 * Novel workbench (小说工作台): editor-centric writing surface.
 *
 * Left rail — book switcher + volume/chapter tree; center — prose editor with
 * auto-save. Backed by the local library under `<documents>/YeMuNovels` via
 * the `novel:*` IPC (electron/main/novelLibrary.ts) and `useNovelStore`.
 */

import AlertDialog from '@/components/ui/alertDialog';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { totalWordCount } from '@/lib/novel';
import { cn } from '@/lib/utils';
import { isNovelLibraryAvailable, useNovelStore } from '@/store/novelStore';
import { BookOpen, FolderPlus, Monitor } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookSwitcher } from './BookSwitcher';
import { ChapterEditor } from './ChapterEditor';
import { ChapterTree } from './ChapterTree';
import { NamePromptDialog } from './NamePromptDialog';

type NamePrompt =
  | { kind: 'create-book' }
  | { kind: 'rename-book'; initialValue: string }
  | { kind: 'new-volume' }
  | { kind: 'rename-volume'; volumeId: string; initialValue: string }
  | { kind: 'new-chapter'; volumeId: string }
  | { kind: 'rename-chapter'; chapterId: string; initialValue: string };

type DeletePrompt =
  | { kind: 'book'; title: string }
  | { kind: 'chapter'; chapterId: string; title: string };

export default function NovelPage() {
  const { t } = useTranslation();
  const available = isNovelLibraryAvailable();

  const books = useNovelStore((s) => s.books);
  const booksLoaded = useNovelStore((s) => s.booksLoaded);
  const activeBookDir = useNovelStore((s) => s.activeBookDir);
  const activeBook = useNovelStore((s) => s.activeBook);
  const activeChapterId = useNovelStore((s) => s.activeChapterId);
  const chapterContent = useNovelStore((s) => s.chapterContent);
  const chapterLoading = useNovelStore((s) => s.chapterLoading);
  const saveState = useNovelStore((s) => s.saveState);

  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);

  useEffect(() => {
    void useNovelStore.getState().loadBooks();
    // Leaving the page (or unmounting on route change) must not drop edits.
    return () => {
      void useNovelStore.getState().flushSave();
    };
  }, []);

  const activeChapter = useMemo(() => {
    if (!activeBook || !activeChapterId) return null;
    for (const volume of activeBook.volumes) {
      const chapter = volume.chapters.find((c) => c.id === activeChapterId);
      if (chapter) return chapter;
    }
    return null;
  }, [activeBook, activeChapterId]);

  const totalWords = useMemo(
    () => (activeBook ? totalWordCount(activeBook) : 0),
    [activeBook]
  );

  const handleNamePromptConfirm = useCallback(
    (value: string) => {
      const prompt = namePrompt;
      setNamePrompt(null);
      if (!prompt) return;
      const store = useNovelStore.getState();
      switch (prompt.kind) {
        case 'create-book':
          void store.createBook(
            value,
            t('novel.default-first-volume'),
            t('novel.default-first-chapter')
          );
          break;
        case 'rename-book':
          void store.renameActiveBook(value);
          break;
        case 'new-volume':
          void store.addVolumeToActiveBook(value);
          break;
        case 'rename-volume':
          void store.renameVolumeInActiveBook(prompt.volumeId, value);
          break;
        case 'new-chapter':
          void store.addChapterToVolume(prompt.volumeId, value);
          break;
        case 'rename-chapter':
          void store.renameChapterInActiveBook(prompt.chapterId, value);
          break;
      }
    },
    [namePrompt, t]
  );

  const namePromptLabels = useMemo(() => {
    if (!namePrompt) return null;
    switch (namePrompt.kind) {
      case 'create-book':
        return {
          title: t('novel.create-book'),
          placeholder: t('novel.book-title-placeholder'),
          confirm: t('novel.create'),
        };
      case 'rename-book':
        return {
          title: t('novel.rename-book'),
          placeholder: t('novel.book-title-placeholder'),
          confirm: t('novel.rename'),
        };
      case 'new-volume':
        return {
          title: t('novel.new-volume'),
          placeholder: t('novel.volume-title-placeholder'),
          confirm: t('novel.create'),
        };
      case 'rename-volume':
        return {
          title: t('novel.rename-volume'),
          placeholder: t('novel.volume-title-placeholder'),
          confirm: t('novel.rename'),
        };
      case 'new-chapter':
        return {
          title: t('novel.new-chapter'),
          placeholder: t('novel.chapter-title-placeholder'),
          confirm: t('novel.create'),
        };
      case 'rename-chapter':
        return {
          title: t('novel.rename-chapter'),
          placeholder: t('novel.chapter-title-placeholder'),
          confirm: t('novel.rename'),
        };
    }
  }, [namePrompt, t]);

  const confirmDelete = useCallback(() => {
    const prompt = deletePrompt;
    setDeletePrompt(null);
    if (!prompt) return;
    const store = useNovelStore.getState();
    if (prompt.kind === 'book' && store.activeBookDir) {
      void store.deleteBook(store.activeBookDir);
    } else if (prompt.kind === 'chapter') {
      void store.deleteChapterFromActiveBook(prompt.chapterId);
    }
  }, [deletePrompt]);

  const panelClass =
    'rounded-2xl bg-ds-bg-neutral-subtle-default flex h-full min-h-0 min-w-0 flex-col overflow-hidden';

  if (!available) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-1 pb-1 pt-10">
        <div
          className={cn(panelClass, 'items-center justify-center gap-3 p-8')}
        >
          <Monitor
            className="h-10 w-10 text-ds-icon-neutral-muted-default"
            aria-hidden
          />
          <span className="text-body-md text-ds-text-neutral-subtle-default">
            {t('novel.desktop-only')}
          </span>
        </div>
      </div>
    );
  }

  const showEmptyLibrary = booksLoaded && books.length === 0 && !activeBook;

  return (
    <div className="flex h-full min-h-0 flex-row overflow-hidden px-1 pb-1 pt-10">
      {namePromptLabels && namePrompt && (
        <NamePromptDialog
          open
          title={namePromptLabels.title}
          placeholder={namePromptLabels.placeholder}
          initialValue={
            'initialValue' in namePrompt ? namePrompt.initialValue : ''
          }
          confirmLabel={namePromptLabels.confirm}
          onCancel={() => setNamePrompt(null)}
          onConfirm={handleNamePromptConfirm}
        />
      )}

      <AlertDialog
        isOpen={deletePrompt != null}
        onClose={() => setDeletePrompt(null)}
        onConfirm={confirmDelete}
        title={
          deletePrompt?.kind === 'book'
            ? t('novel.delete-book')
            : t('novel.delete-chapter')
        }
        message={
          deletePrompt?.kind === 'book'
            ? t('novel.delete-book-confirm', { title: deletePrompt.title })
            : t('novel.delete-chapter-confirm', {
                title: deletePrompt?.title ?? '',
              })
        }
        confirmText={t('novel.delete')}
        cancelText={t('novel.cancel')}
      />

      {showEmptyLibrary ? (
        <div
          className={cn(panelClass, 'items-center justify-center gap-3 p-8')}
        >
          <BookOpen
            className="h-10 w-10 text-ds-icon-neutral-muted-default"
            aria-hidden
          />
          <span className="text-heading-sm font-bold text-ds-text-neutral-default-default">
            {t('novel.empty-title')}
          </span>
          <span className="max-w-md text-center text-body-sm text-ds-text-neutral-subtle-default">
            {t('novel.empty-desc')}
          </span>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setNamePrompt({ kind: 'create-book' })}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            {t('novel.create-book')}
          </Button>
        </div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full min-h-0 w-full gap-0"
        >
          <ResizablePanel
            defaultSize={22}
            minSize={16}
            maxSize={34}
            className="min-h-0 min-w-0 pr-1"
          >
            <div className={cn(panelClass, 'gap-1 p-1')}>
              <BookSwitcher
                books={books}
                activeBookDir={activeBookDir}
                activeBookTitle={activeBook?.title ?? null}
                onSwitchBook={(dir) =>
                  void useNovelStore.getState().openBook(dir)
                }
                onCreateBook={() => setNamePrompt({ kind: 'create-book' })}
                onRenameBook={() =>
                  activeBook &&
                  setNamePrompt({
                    kind: 'rename-book',
                    initialValue: activeBook.title,
                  })
                }
                onDeleteBook={() =>
                  activeBook &&
                  setDeletePrompt({ kind: 'book', title: activeBook.title })
                }
                onRevealBook={() =>
                  void useNovelStore.getState().revealActiveBook()
                }
              />

              {activeBook && (
                <>
                  <ChapterTree
                    book={activeBook}
                    activeChapterId={activeChapterId}
                    onSelectChapter={(chapterId) =>
                      void useNovelStore.getState().selectChapter(chapterId)
                    }
                    onAddChapter={(volumeId) =>
                      setNamePrompt({ kind: 'new-chapter', volumeId })
                    }
                    onRenameChapter={(chapterId, currentTitle) =>
                      setNamePrompt({
                        kind: 'rename-chapter',
                        chapterId,
                        initialValue: currentTitle,
                      })
                    }
                    onMoveChapter={(chapterId, direction) =>
                      void useNovelStore
                        .getState()
                        .moveChapterInActiveBook(chapterId, direction)
                    }
                    onDeleteChapter={(chapterId, title) =>
                      setDeletePrompt({ kind: 'chapter', chapterId, title })
                    }
                    onRenameVolume={(volumeId, currentTitle) =>
                      setNamePrompt({
                        kind: 'rename-volume',
                        volumeId,
                        initialValue: currentTitle,
                      })
                    }
                    onDeleteVolume={(volumeId) =>
                      void useNovelStore
                        .getState()
                        .deleteEmptyVolumeFromActiveBook(volumeId)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 justify-start"
                    onClick={() => setNamePrompt({ kind: 'new-volume' })}
                  >
                    <FolderPlus className="h-4 w-4" aria-hidden />
                    {t('novel.new-volume')}
                  </Button>
                </>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle
            className={cn(
              'w-[2px] shrink-0 bg-transparent after:bg-ds-bg-neutral-default-default after:transition-colors',
              'transition-colors hover:bg-ds-bg-brand-subtle-default',
              'data-[resize-handle-state=drag]:after:bg-ds-bg-brand-default-focus'
            )}
          />
          <ResizablePanel
            defaultSize={78}
            minSize={50}
            className="min-h-0 min-w-[320px]"
          >
            <div className={panelClass}>
              {activeBook && activeChapter && activeChapterId ? (
                <ChapterEditor
                  chapterId={activeChapterId}
                  chapterTitle={activeChapter.title}
                  content={chapterContent}
                  loading={chapterLoading}
                  saveState={saveState}
                  totalWords={totalWords}
                  onContentChange={(content) =>
                    useNovelStore.getState().setChapterContent(content)
                  }
                  onRenameChapter={(title) =>
                    void useNovelStore
                      .getState()
                      .renameChapterInActiveBook(activeChapterId, title)
                  }
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-8">
                  <span className="text-body-sm text-ds-text-neutral-muted-default">
                    {t('novel.select-chapter')}
                  </span>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
