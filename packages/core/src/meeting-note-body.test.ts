import { describe, expect, it } from "vitest";
import { extractMeetingNoteImageIds, parseInlineBold, parseMeetingNoteBody } from "./meeting-note-body";

const plain = (text: string) => [{ text, bold: false }];

describe("parseInlineBold", () => {
  it("splits matched ** pairs", () => {
    expect(parseInlineBold("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });

  it("keeps an unmatched ** literal", () => {
    expect(parseInlineBold("a**b")).toEqual(plain("a**b"));
    expect(parseInlineBold("a**b**c**d")).toEqual([
      { text: "a", bold: false },
      { text: "b", bold: true },
      { text: "c**d", bold: false },
    ]);
  });

  it("drops empty pieces", () => {
    expect(parseInlineBold("**x**")).toEqual([{ text: "x", bold: true }]);
    expect(parseInlineBold("")).toEqual([]);
  });
});

describe("parseMeetingNoteBody", () => {
  it("parses headings of three levels", () => {
    expect(parseMeetingNoteBody("# 안건\n## 세부\n### 메모")).toEqual([
      { kind: "heading", level: 1, spans: plain("안건") },
      { kind: "heading", level: 2, spans: plain("세부") },
      { kind: "heading", level: 3, spans: plain("메모") },
    ]);
  });

  it("treats #### and #text as paragraph text", () => {
    expect(parseMeetingNoteBody("#### x\n#y")).toEqual([
      { kind: "paragraph", lines: [plain("#### x"), plain("#y")] },
    ]);
  });

  it("groups consecutive bullet, number and checklist lines", () => {
    expect(parseMeetingNoteBody("- a\n- b\n1. c\n5. d\n- [ ] e\n- [x] f\n- [X] g")).toEqual([
      { kind: "bullets", items: [plain("a"), plain("b")] },
      { kind: "numbers", items: [plain("c"), plain("d")] },
      {
        kind: "checklist",
        items: [
          { checked: false, spans: plain("e") },
          { checked: true, spans: plain("f") },
          { checked: true, spans: plain("g") },
        ],
      },
    ]);
  });

  it("splits lists of the same kind on a blank line", () => {
    expect(parseMeetingNoteBody("- a\n\n- b")).toEqual([
      { kind: "bullets", items: [plain("a")] },
      { kind: "bullets", items: [plain("b")] },
    ]);
  });

  it("ignores leading indentation", () => {
    expect(parseMeetingNoteBody("   - a\n\t- b")).toEqual([{ kind: "bullets", items: [plain("a"), plain("b")] }]);
  });

  it("joins consecutive plain lines into one paragraph and splits on blank lines", () => {
    expect(parseMeetingNoteBody("one\ntwo\n\n\nthree")).toEqual([
      { kind: "paragraph", lines: [plain("one"), plain("two")] },
      { kind: "paragraph", lines: [plain("three")] },
    ]);
  });

  it("reads a whole-line image and leaves a mid-sentence one as text", () => {
    expect(parseMeetingNoteBody("![](img1)\n![캡처](img2)\n이건 ![](img3) 글자")).toEqual([
      { kind: "image", id: "img1" },
      { kind: "image", id: "img2" },
      { kind: "paragraph", lines: [plain("이건 ![](img3) 글자")] },
    ]);
  });

  it("handles CRLF and an empty body", () => {
    expect(parseMeetingNoteBody("a\r\nb")).toEqual([{ kind: "paragraph", lines: [plain("a"), plain("b")] }]);
    expect(parseMeetingNoteBody("")).toEqual([]);
    expect(parseMeetingNoteBody("\n\n")).toEqual([]);
  });

  it("keeps bold inside list items", () => {
    expect(parseMeetingNoteBody("- **결정**: 진행")).toEqual([
      { kind: "bullets", items: [[{ text: "결정", bold: true }, { text: ": 진행", bold: false }]] },
    ]);
  });
});

describe("extractMeetingNoteImageIds", () => {
  it("returns whole-line image ids, deduplicated, in order", () => {
    expect(extractMeetingNoteImageIds("![](b)\ntext ![](x) text\n![](a)\n![](b)")).toEqual(["b", "a"]);
  });
});
