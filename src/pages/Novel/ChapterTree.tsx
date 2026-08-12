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

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NovelBookMeta, NovelVolume } from '@/lib/novel';
import { cn } from '@/lib/utils';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ChapterTreeCallbacks {
  onSelectChapter: (chapterId: string) => void;
  onAddChapter: (volumeId: string) => void;
  onRenameChapter: (chapterId: string, currentTitle: string) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
  onRenameVolume: (volumeId: string, currentTitle: string) => void;
  onDeleteVolume: (volumeId: string) => void;
}

interface ChapterTreeProps extends ChapterTreeCallbacks {
  book: NovelBookMeta;
  activeChapterId: string | null;
}

function VolumeSection({
  volume,
  activeChapterId,
  callbacks,
}: {
  volume: NovelVolume;
  activeChapterId: string | null;
  callbacks: ChapterTreeCallbacks;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col">
      <div className="group/volume flex items-center gap-0.5 rounded-lg px-1 py-0.5 hover:bg-ds-bg-neutral-default-hover">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-ds-icon-neutral-muted-default transition-transform',
              !expanded && '-rotate-90'
            )}
            aria-hidden
          />
          <span className="truncate text-label-sm font-medium text-ds-text-neutral-subtle-default">
            {volume.title}
          </span>
          <span className="shrink-0 text-label-xs text-ds-text-neutral-muted-default">
            {t('novel.chapter-count', { count: volume.chapters.length })}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          buttonContent="icon-only"
          className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/volume:opacity-100"
          aria-label={t('novel.new-chapter')}
          onClick={() => callbacks.onAddChapter(volume.id)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              buttonContent="icon-only"
              className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/volume:opacity-100 data-[state=open]:opacity-100"
              aria-label={t('novel.volume-menu')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => callbacks.onRenameVolume(volume.id, volume.title)}
            >
              <Pencil aria-hidden />
              {t('novel.rename-volume')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={volume.chapters.length > 0}
              className="text-ds-text-error-default-default"
              onClick={() => callbacks.onDeleteVolume(volume.id)}
            >
              <Trash2 aria-hidden />
              {t('novel.delete-volume')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="flex flex-col gap-px pl-3">
          {volume.chapters.map((chapter, index) => {
            const active = chapter.id === activeChapterId;
            return (
              <div
                key={chapter.id}
                className={cn(
                  'group/chapter flex items-center gap-1 rounded-lg px-2 py-1',
                  active
                    ? 'bg-ds-bg-neutral-default-active'
                    : 'hover:bg-ds-bg-neutral-default-hover'
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => callbacks.onSelectChapter(chapter.id)}
                  aria-current={active ? 'true' : undefined}
                >
                  <FileText
                    className="h-3.5 w-3.5 shrink-0 text-ds-icon-neutral-muted-default"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'truncate text-body-sm',
                      active
                        ? 'font-medium text-ds-text-neutral-default-default'
                        : 'text-ds-text-neutral-subtle-default'
                    )}
                  >
                    {chapter.title}
                  </span>
                  {chapter.wordCount > 0 && (
                    <span className="ml-auto shrink-0 text-label-xs text-ds-text-neutral-muted-default">
                      {chapter.wordCount}
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      buttonContent="icon-only"
                      className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/chapter:opacity-100 data-[state=open]:opacity-100"
                      aria-label={t('novel.chapter-menu')}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() =>
                        callbacks.onRenameChapter(chapter.id, chapter.title)
                      }
                    >
                      <Pencil aria-hidden />
                      {t('novel.rename-chapter')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === 0}
                      onClick={() => callbacks.onMoveChapter(chapter.id, 'up')}
                    >
                      <ArrowUp aria-hidden />
                      {t('novel.move-up')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === volume.chapters.length - 1}
                      onClick={() =>
                        callbacks.onMoveChapter(chapter.id, 'down')
                      }
                    >
                      <ArrowDown aria-hidden />
                      {t('novel.move-down')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-ds-text-error-default-default"
                      onClick={() =>
                        callbacks.onDeleteChapter(chapter.id, chapter.title)
                      }
                    >
                      <Trash2 aria-hidden />
                      {t('novel.delete-chapter')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Volume/chapter navigation for the open book. */
export function ChapterTree({
  book,
  activeChapterId,
  ...callbacks
}: ChapterTreeProps) {
  return (
    <div className="scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 py-1">
      {book.volumes.map((volume) => (
        <VolumeSection
          key={volume.id}
          volume={volume}
          activeChapterId={activeChapterId}
          callbacks={callbacks}
        />
      ))}
    </div>
  );
}
