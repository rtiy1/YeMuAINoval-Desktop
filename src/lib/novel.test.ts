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

import { describe, expect, it } from 'vitest';
import {
  addChapter,
  addVolume,
  countNovelWords,
  createEmptyBook,
  findChapter,
  flattenChapters,
  moveChapter,
  removeChapter,
  removeEmptyVolume,
  renameChapter,
  renameVolume,
  totalWordCount,
  updateChapterWordCount,
} from './novel';

function makeBook() {
  return createEmptyBook('测试书', '第一卷', '第一章');
}

describe('countNovelWords', () => {
  it('counts CJK prose by code points, ignoring whitespace', () => {
    expect(countNovelWords('')).toBe(0);
    expect(countNovelWords('  \n\t ')).toBe(0);
    expect(countNovelWords('你好世界')).toBe(4);
    expect(countNovelWords('你好，世界！')).toBe(6);
    expect(countNovelWords('第一行\n  第二行')).toBe(6);
    expect(countNovelWords('中英 mixed 文本')).toBe(9);
  });

  it('counts astral-plane characters once', () => {
    expect(countNovelWords('𠀀𠀁')).toBe(2);
  });
});

describe('createEmptyBook', () => {
  it('builds one volume with one empty chapter', () => {
    const book = makeBook();
    expect(book.title).toBe('测试书');
    expect(book.volumes).toHaveLength(1);
    expect(book.volumes[0].title).toBe('第一卷');
    expect(book.volumes[0].chapters).toHaveLength(1);
    expect(book.volumes[0].chapters[0].title).toBe('第一章');
    expect(book.volumes[0].chapters[0].wordCount).toBe(0);
    expect(book.id).toMatch(/^b_/);
    expect(book.volumes[0].id).toMatch(/^v_/);
    expect(book.volumes[0].chapters[0].id).toMatch(/^c_/);
  });
});

describe('volume operations', () => {
  it('appends a new volume', () => {
    const book = addVolume(makeBook(), '第二卷');
    expect(book.volumes).toHaveLength(2);
    expect(book.volumes[1].title).toBe('第二卷');
    expect(book.volumes[1].chapters).toHaveLength(0);
  });

  it('renames a volume without touching others', () => {
    const book = addVolume(makeBook(), '第二卷');
    const renamed = renameVolume(book, book.volumes[1].id, '终卷');
    expect(renamed.volumes[1].title).toBe('终卷');
    expect(renamed.volumes[0].title).toBe('第一卷');
  });

  it('removes only empty volumes', () => {
    const book = addVolume(makeBook(), '第二卷');
    expect(removeEmptyVolume(book, book.volumes[0].id)).toBeNull();
    const removed = removeEmptyVolume(book, book.volumes[1].id);
    expect(removed).not.toBeNull();
    expect(removed!.volumes).toHaveLength(1);
  });
});

describe('chapter operations', () => {
  it('adds a chapter to the target volume and returns its id', () => {
    const book = makeBook();
    const result = addChapter(book, book.volumes[0].id, '第二章');
    expect(result).not.toBeNull();
    expect(result!.meta.volumes[0].chapters).toHaveLength(2);
    expect(result!.meta.volumes[0].chapters[1].title).toBe('第二章');
    expect(result!.chapterId).toBe(result!.meta.volumes[0].chapters[1].id);
  });

  it('returns null for an unknown volume', () => {
    expect(addChapter(makeBook(), 'v_missing', 'x')).toBeNull();
  });

  it('renames and removes chapters', () => {
    const book = makeBook();
    const chapterId = book.volumes[0].chapters[0].id;
    const renamed = renameChapter(book, chapterId, '楔子');
    expect(renamed.volumes[0].chapters[0].title).toBe('楔子');

    const removed = removeChapter(renamed, chapterId);
    expect(removed.volumes[0].chapters).toHaveLength(0);
  });

  it('finds chapters across volumes', () => {
    let book = addVolume(makeBook(), '第二卷');
    const added = addChapter(book, book.volumes[1].id, '第二卷第一章')!;
    book = added.meta;

    const hit = findChapter(book, added.chapterId);
    expect(hit).not.toBeNull();
    expect(hit!.volume.id).toBe(book.volumes[1].id);
    expect(hit!.chapter.title).toBe('第二卷第一章');
    expect(findChapter(book, 'c_missing')).toBeNull();
  });
});

describe('moveChapter', () => {
  function bookWithThreeChapters() {
    let book = makeBook();
    const volumeId = book.volumes[0].id;
    book = addChapter(book, volumeId, '第二章')!.meta;
    book = addChapter(book, volumeId, '第三章')!.meta;
    return book;
  }

  it('swaps with the neighbour in the given direction', () => {
    const book = bookWithThreeChapters();
    const second = book.volumes[0].chapters[1];

    const up = moveChapter(book, second.id, 'up')!;
    expect(up.volumes[0].chapters.map((c) => c.title)).toEqual([
      '第二章',
      '第一章',
      '第三章',
    ]);

    const down = moveChapter(book, second.id, 'down')!;
    expect(down.volumes[0].chapters.map((c) => c.title)).toEqual([
      '第一章',
      '第三章',
      '第二章',
    ]);
  });

  it('returns null at the edges and for unknown chapters', () => {
    const book = bookWithThreeChapters();
    const [first, , last] = book.volumes[0].chapters;
    expect(moveChapter(book, first.id, 'up')).toBeNull();
    expect(moveChapter(book, last.id, 'down')).toBeNull();
    expect(moveChapter(book, 'c_missing', 'up')).toBeNull();
  });
});

describe('word counts', () => {
  it('updates a chapter word count and sums the whole book', () => {
    let book = makeBook();
    const volumeId = book.volumes[0].id;
    const firstId = book.volumes[0].chapters[0].id;
    const added = addChapter(book, volumeId, '第二章')!;
    book = added.meta;

    book = updateChapterWordCount(book, firstId, 1200);
    book = updateChapterWordCount(book, added.chapterId, 800);

    expect(book.volumes[0].chapters[0].wordCount).toBe(1200);
    expect(totalWordCount(book)).toBe(2000);
    expect(flattenChapters(book)).toHaveLength(2);
  });
});
