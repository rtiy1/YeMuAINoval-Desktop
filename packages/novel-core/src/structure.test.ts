import { describe, expect, it } from "vitest";
import {
  formatChapterFileName,
  formatVolumeDirName,
  isChapterFileName,
  isVolumeDirName,
  nextChapterNumber,
  nextVolumeNumber,
  parseChapterNumber,
  parseChapterRef,
  parseVolumeNumber,
  sortChapterNumbers,
  sortVolumeNumbers,
} from "./structure.js";

describe("volume and chapter naming", () => {
  it("formats zero-padded volume directories", () => {
    expect(formatVolumeDirName(1)).toBe("volume-01");
    expect(formatVolumeDirName(12)).toBe("volume-12");
  });

  it("formats zero-padded chapter files", () => {
    expect(formatChapterFileName(1)).toBe("chapter-001.md");
    expect(formatChapterFileName(142)).toBe("chapter-142.md");
  });

  it("parses volume numbers", () => {
    expect(parseVolumeNumber("volume-01")).toBe(1);
    expect(parseVolumeNumber("volume-23")).toBe(23);
    expect(parseVolumeNumber("volume-1")).toBeNull();
    expect(parseVolumeNumber("chapter-001.md")).toBeNull();
  });

  it("parses chapter file numbers", () => {
    expect(parseChapterNumber("chapter-001.md")).toBe(1);
    expect(parseChapterNumber("chapter-142.md")).toBe(142);
    expect(parseChapterNumber("chapter-1.md")).toBeNull();
    expect(parseChapterNumber("volume-01")).toBeNull();
  });

  it("recognizes chapter files and volume dirs only", () => {
    expect(isChapterFileName("chapter-007.md")).toBe(true);
    expect(isChapterFileName("第一章.md")).toBe(false);
    expect(isChapterFileName("chapter-7.md")).toBe(false);
    expect(isVolumeDirName("volume-01")).toBe(true);
    expect(isVolumeDirName("volume-1")).toBe(false);
    expect(isVolumeDirName("manuscript")).toBe(false);
  });

  it("parses chapter references used in YAML", () => {
    expect(parseChapterRef("chapter-012")).toBe(12);
    expect(parseChapterRef("chapter-012.md")).toBeNull();
    expect(parseChapterRef("volume-01")).toBeNull();
  });

  it("computes the next chapter number after the highest", () => {
    expect(nextChapterNumber([])).toBe(1);
    expect(nextChapterNumber([1, 2, 3])).toBe(4);
    expect(nextChapterNumber([7])).toBe(8);
  });

  it("computes the next volume number after the highest", () => {
    expect(nextVolumeNumber([])).toBe(1);
    expect(nextVolumeNumber([1, 2])).toBe(3);
    expect(nextVolumeNumber([9])).toBe(10);
  });

  it("sorts numbers ascending", () => {
    expect(sortChapterNumbers([9, 1, 42])).toEqual([1, 9, 42]);
    expect(sortVolumeNumbers([2, 1, 3])).toEqual([1, 2, 3]);
  });
});
