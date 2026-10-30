import { describe, expect, it } from "vitest";
import { rebaseMeetingNoteToggles } from "./meeting-note-rebase";

describe("rebaseMeetingNoteToggles", () => {
  it("returns my body untouched when the server did not move", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [ ] a", "- [ ] a\n더")).toEqual({
      body: "- [ ] a\n더",
      applied: 0,
      skipped: 0,
    });
  });

  it("applies a server tick to the matching line of my edited body", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a\n- [ ] b", "- [x] a\n- [ ] b", "새 줄\n- [ ] a\n- [ ] b\n추가")).toEqual({
      body: "새 줄\n- [x] a\n- [ ] b\n추가",
      applied: 1,
      skipped: 0,
    });
  });

  it("skips a task I edited", () => {
    expect(rebaseMeetingNoteToggles("- [x] a", "- [ ] a", "- [x] a 수정")).toEqual({
      body: "- [x] a 수정",
      applied: 0,
      skipped: 1,
    });
  });

  it("skips an ambiguous task", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "- [ ] a\n- [ ] a")).toEqual({
      body: "- [ ] a\n- [ ] a",
      applied: 0,
      skipped: 1,
    });
  });

  it("does not count a task I already set the same way", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "- [x] a")).toEqual({ body: "- [x] a", applied: 0, skipped: 0 });
  });

  it("keeps my CRLF line endings", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "x\r\n- [ ] a")).toEqual({
      body: "x\r\n- [x] a",
      applied: 1,
      skipped: 0,
    });
  });

  it("counts server ticks it could not place", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "- [ ] a\n- [ ] a")?.skipped).toBe(1);
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "- [ ] a 수정")?.skipped).toBe(1);
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [x] a", "- [ ] a")?.skipped).toBe(0);
  });

  it("returns null when the server changed more than checkboxes", () => {
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [ ] b", "- [ ] a")).toBeNull();
    expect(rebaseMeetingNoteToggles("- [ ] a", "- [ ] a\nx", "- [ ] a")).toBeNull();
    expect(rebaseMeetingNoteToggles("메모\n- [ ] a", "메모!\n- [x] a", "- [ ] a")).toBeNull();
  });
});
