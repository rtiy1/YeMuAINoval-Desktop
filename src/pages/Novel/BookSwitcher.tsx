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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NovelBookEntry } from '@/lib/novel';
import {
  BookOpen,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface BookSwitcherProps {
  books: NovelBookEntry[];
  activeBookDir: string | null;
  activeBookTitle: string | null;
  onSwitchBook: (dir: string) => void;
  onCreateBook: () => void;
  onRenameBook: () => void;
  onDeleteBook: () => void;
  onRevealBook: () => void;
}

/** Current book title + dropdown to switch/create/manage books. */
export function BookSwitcher({
  books,
  activeBookDir,
  activeBookTitle,
  onSwitchBook,
  onCreateBook,
  onRenameBook,
  onDeleteBook,
  onRevealBook,
}: BookSwitcherProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full min-w-0 justify-start"
          aria-label={t('novel.book-menu')}
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left font-medium">
            {activeBookTitle ?? t('novel.workbench-title')}
          </span>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-ds-icon-neutral-muted-default"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {books.length > 0 && (
          <>
            <DropdownMenuLabel className="text-label-xs text-ds-text-neutral-muted-default">
              {t('novel.switch-book')}
            </DropdownMenuLabel>
            {books.map((book) => (
              <DropdownMenuItem
                key={book.dir}
                onClick={() => onSwitchBook(book.dir)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {book.meta.title}
                </span>
                {book.dir === activeBookDir && <Check aria-hidden />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onCreateBook}>
          <Plus aria-hidden />
          {t('novel.create-book')}
        </DropdownMenuItem>
        {activeBookDir && (
          <>
            <DropdownMenuItem onClick={onRenameBook}>
              <Pencil aria-hidden />
              {t('novel.rename-book')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRevealBook}>
              <FolderOpen aria-hidden />
              {t('novel.open-folder')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-ds-text-error-default-default"
              onClick={onDeleteBook}
            >
              <Trash2 aria-hidden />
              {t('novel.delete-book')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
