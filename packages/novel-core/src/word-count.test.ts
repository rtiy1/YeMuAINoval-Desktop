import { describe, expect, it } from "vitest";
import {
  countCjkCharacters,
  countFullWidthPunctuation,
  countHalfWidthWords,
  countNovelCharacters,
  countNovelLines,
  summarizeNovelText,
} from "./word-count.js";

describe("Chinese word counts", () => {
  it("counts each CJK ideograph once", () => {
    expect(countCjkCharacters("第一章 风起云涌")).toBe(7);
    expect(countCjkCharacters("")).toBe(0);
    expect(countCjkCharacters("hello world")).toBe(0);
  });

  it("counts full-width punctuation", () => {
    expect(countFullWidthPunctuation("她说：「快走！」——那是命令。")).toBe(7);
    expect(countFullWidthPunctuation("plain text")).toBe(0);
  });

  it("counts half-width words as runs", () => {
    expect(countHalfWidthWords("进入 007 号房间，call him 3 times")).toBe(5);
    expect(countHalfWidthWords("中文only")).toBe(1);
  });

  it("combines CJK, full-width punctuation and latin words", () => {
    expect(countNovelCharacters("风起于青萍之末。")).toBe(8);
    expect(countNovelCharacters("第1章 THE END")).toBe(5);
    expect(countNovelCharacters("")).toBe(0);
  });

  it("counts lines without trailing newline quirks", () => {
    expect(countNovelLines("")).toBe(0);
    expect(countNovelLines("one")).toBe(1);
    expect(countNovelLines("one\ntwo\nthree")).toBe(3);
    expect(countNovelLines("one\r\ntwo")).toBe(2);
  });

  it("summarizes all measurements together", () => {
    const stats = summarizeNovelText("第一幕 开场。\nIt begins here.");
    expect(stats.cjkCharacters).toBe(5);
    expect(stats.fullWidthPunctuation).toBe(1);
    expect(stats.characters).toBe(9);
    expect(stats.lines).toBe(2);
  });
});
