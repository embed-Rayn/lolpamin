import { describe, expect, it } from "vitest";
import { extractMeetingNoteTasks, normalizeAssignee, toggleMeetingNoteTaskLine } from "./meeting-note-tasks";

const md = new Date("2026-10-30T00:00:00Z");

describe("extractMeetingNoteTasks", () => {
  it("reads checked state, assignees and due", () => {
    expect(extractMeetingNoteTasks("- [ ] @소영 @병준 날짜 후보 ~11/14\n- [x] 끝난 일", md)).toEqual([
      { line: 0, checked: false, text: "날짜 후보", assignees: ["소영", "병준"], due: "2026-11-14", parentText: null },
      { line: 1, checked: true, text: "끝난 일", assignees: [], due: null, parentText: null },
    ]);
  });

  it("accepts * + and numbered bullets, X and indentation", () => {
    const tasks = extractMeetingNoteTasks("* [X] a\n+ [ ] b\n1. [ ] c\n   - [ ] d", md);
    expect(tasks.map((t) => [t.line, t.checked, t.text])).toEqual([
      [0, true, "a"],
      [1, false, "b"],
      [2, false, "c"],
      [3, false, "d"],
    ]);
  });

  it("inherits assignee and due separately from the nearest ancestor that names them", () => {
    const body = "2. 캠핑 @병준 ~11/14\n   - [ ] 후보 날짜 정리\n   - [ ] @소영 장소 알아보기 ~11/10\n     - [ ] 펜션 전화";
    const tasks = extractMeetingNoteTasks(body, md);
    expect(tasks).toEqual([
      { line: 1, checked: false, text: "후보 날짜 정리", assignees: ["병준"], due: "2026-11-14", parentText: "캠핑" },
      { line: 2, checked: false, text: "장소 알아보기", assignees: ["소영"], due: "2026-11-10", parentText: "캠핑" },
      { line: 3, checked: false, text: "펜션 전화", assignees: ["소영"], due: "2026-11-10", parentText: "장소 알아보기" },
    ]);
  });

  it("own @ replaces inherited assignees, siblings are not ancestors", () => {
    const tasks = extractMeetingNoteTasks("- [ ] @a 부모\n  - [ ] @b 자식\n  - [ ] 형제", md);
    expect(tasks.map((t) => t.assignees)).toEqual([["a"], ["b"], ["a"]]);
  });

  it("a heading or an unindented non-list line cuts the ancestor chain; a blank line does not", () => {
    const body = "- 상위 @a\n\n  - [ ] x\n# 제목\n  - [ ] y\n- 상위2 @b\n문단\n  - [ ] z";
    const tasks = extractMeetingNoteTasks(body, md);
    expect(tasks.map((t) => [t.text, t.assignees])).toEqual([
      ["x", ["a"]],
      ["y", []],
      ["z", []],
    ]);
  });

  it("skips fenced code and blockquotes", () => {
    const body = "```\n- [ ] no\n```\n~~~\n- [ ] no\n~~~\n> - [ ] no\n- [ ] yes";
    expect(extractMeetingNoteTasks(body, md).map((t) => t.text)).toEqual(["yes"]);
  });

  it("due year rolls over before the meeting date", () => {
    const december = new Date("2026-12-20T00:00:00Z");
    expect(extractMeetingNoteTasks("- [ ] a ~1/5", december)[0].due).toBe("2027-01-05");
    expect(extractMeetingNoteTasks("- [ ] a ~2026/3/1", december)[0].due).toBe("2026-03-01");
    expect(extractMeetingNoteTasks("- [ ] a ~12/20", december)[0].due).toBe("2026-12-20");
  });

  it("invalid due stays as text", () => {
    expect(extractMeetingNoteTasks("- [ ] a ~13/40", md)[0]).toMatchObject({ text: "a ~13/40", due: null });
  });

  it("handles CRLF", () => {
    expect(extractMeetingNoteTasks("- [ ] a\r\n- [ ] b", md).map((t) => [t.line, t.text])).toEqual([
      [0, "a"],
      [1, "b"],
    ]);
  });

  it("dedupes assignees case-insensitively, keeping first spelling", () => {
    expect(extractMeetingNoteTasks("- [ ] @Rayn @rayn x", md)[0].assignees).toEqual(["Rayn"]);
    expect(normalizeAssignee("Rayn")).toBe("rayn");
  });
});

describe("toggleMeetingNoteTaskLine", () => {
  it("toggles exactly the given line among identical tasks", () => {
    expect(toggleMeetingNoteTaskLine("- [ ] a\n- [ ] a", md, 1, "a", true)).toBe("- [ ] a\n- [x] a");
  });

  it("unchecks and keeps indentation, assignees and due", () => {
    expect(toggleMeetingNoteTaskLine("  1. [x] @b c ~11/1", md, 0, "c", false)).toBe("  1. [ ] @b c ~11/1");
  });

  it("refuses a text mismatch, a non-task line and a line out of range", () => {
    expect(toggleMeetingNoteTaskLine("- [ ] a", md, 0, "b", true)).toBeNull();
    expect(toggleMeetingNoteTaskLine("- a", md, 0, "a", true)).toBeNull();
    expect(toggleMeetingNoteTaskLine("- [ ] a", md, 3, "a", true)).toBeNull();
  });

  it("keeps CRLF line endings", () => {
    expect(toggleMeetingNoteTaskLine("- [ ] a\r\n- [ ] b", md, 1, "b", true)).toBe("- [ ] a\r\n- [x] b");
  });
});
