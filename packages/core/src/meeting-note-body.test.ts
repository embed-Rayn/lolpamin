import { describe, expect, it } from "vitest";
import { extractMeetingNoteImageIds } from "./meeting-note-body";

describe("extractMeetingNoteImageIds", () => {
  it("returns every image id, deduplicated, in order", () => {
    expect(extractMeetingNoteImageIds("![](b)\ntext ![](x) text\n![캡처](a)\n![](b)")).toEqual(["b", "x", "a"]);
  });

  it("reads images inside list items and with a title", () => {
    expect(extractMeetingNoteImageIds('1. 안건\n   - ![](img1)\n![](img2 "제목")')).toEqual(["img1", "img2"]);
  });

  it("ignores links and an empty body", () => {
    expect(extractMeetingNoteImageIds("[링크](http://x)")).toEqual([]);
    expect(extractMeetingNoteImageIds("")).toEqual([]);
  });
});
