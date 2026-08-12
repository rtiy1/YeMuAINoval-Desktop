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

import { countNovelWords } from '@/lib/novel';
import { cn } from '@/lib/utils';
import type { NovelSaveState } from '@/store/novelStore';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ChapterEditorProps {
  chapterId: string;
  chapterTitle: string;
  content: string;
  loading: boolean;
  saveState: NovelSaveState;
  totalWords: number;
  onContentChange: (content: string) => void;
  onRenameChapter: (title: string) => void;
}

/** Distraction-light prose editor: title row, body textarea, status bar. */
export function ChapterEditor({
  chapterId,
  chapterTitle,
  content,
  loading,
  saveState,
  totalWords,
  onContentChange,
  onRenameChapter,
}: ChapterEditorProps) {
  const { t } = useTranslation();
  const [titleDraft, setTitleDraft] = useState(chapterTitle);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitleDraft(chapterTitle);
  }, [chapterTitle, chapterId]);

  // Fresh chapter: put the caret in the body so writing can start right away.
  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
  }, [chapterId, loading]);

  const chapterWords = useMemo(() => countNovelWords(content), [content]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === chapterTitle) {
      setTitleDraft(chapterTitle);
      return;
    }
    onRenameChapter(trimmed);
  };

  const saveLabel: Record<NovelSaveState, string | null> = {
    idle: null,
    dirty: t('novel.save-state-dirty'),
    saving: t('novel.save-state-saving'),
    saved: t('novel.save-state-saved'),
    error: t('novel.save-state-error'),
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-1 px-8 pt-8">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
          placeholder={t('novel.chapter-title-placeholder')}
          aria-label={t('novel.chapter-title-placeholder')}
          className="w-full border-none bg-transparent text-heading-base font-bold text-ds-text-neutral-default-default outline-none placeholder:text-ds-text-neutral-muted-default"
        />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle
            className="h-6 w-6 animate-spin text-ds-icon-neutral-muted-default"
            aria-hidden
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={t('novel.editor-placeholder')}
          aria-label={t('novel.editor-placeholder')}
          spellCheck={false}
          className={cn(
            'scrollbar mx-auto w-full max-w-3xl flex-1 resize-none border-none bg-transparent px-8 py-6 outline-none',
            'font-serif text-lg leading-9 text-ds-text-neutral-default-default',
            'placeholder:text-ds-text-neutral-muted-default'
          )}
        />
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-solid border-ds-border-neutral-subtle-default px-6 py-1.5">
        <div className="flex items-center gap-3 text-label-xs text-ds-text-neutral-muted-default">
          <span>{t('novel.chapter-words', { count: chapterWords })}</span>
          <span>{t('novel.total-words', { count: totalWords })}</span>
        </div>
        <span
          className={cn(
            'text-label-xs',
            saveState === 'error'
              ? 'text-ds-text-error-default-default'
              : 'text-ds-text-neutral-muted-default'
          )}
          role="status"
        >
          {saveLabel[saveState]}
        </span>
      </div>
    </div>
  );
}
