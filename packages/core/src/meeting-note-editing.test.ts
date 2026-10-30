import { describe, expect, it } from "vitest";
import {
  enterEdit,
  indentEdit,
  inFencedCode,
  toggleBoldEdit,
  togglePrefixEdit,
  type TextEdit,
} from "./meeting-note-editing";

const apply = (text: string, e: TextEdit) => text.slice(0, e.start) + e.insert + text.slice(e.end);
const at = (text: string, needle: string) => text.indexOf(needle);

describe("indentEdit", () => {
  it("indents to the text start of the list item above", () => {
    expect(apply("1. a\nb", indentEdit("1. a\nb", 5, 5, false))).toBe("1. a\n   b");
    expect(apply("- a\nb", indentEdit("- a\nb", 4, 4, false))).toBe("- a\n  b");
    expect(apply("10. a\nb", indentEdit("10. a\nb", 6, 6, false))).toBe("10. a\n    b");
  });

  it("indents two spaces when the line above is not a list item", () => {
    expect(apply("a\nb", indentEdit("a\nb", 2, 2, false))).toBe("a\n  b");
  });

  it("indents every selected line by the same amount", () => {
    const text = "1. a\nb\nc";
    expect(apply(text, indentEdit(text, 5, 8, false))).toBe("1. a\n   b\n   c");
  });

  it("keeps the caret on the same character", () => {
    const e = indentEdit("- a\nbc", 5, 5, false);
    expect(apply("- a\nbc", e).slice(e.selStart)).toBe("c");
  });

  it("outdents to the indentation of the shallower list item above, or to zero", () => {
    expect(apply("1. a\n   - b", indentEdit("1. a\n   - b", 9, 9, true))).toBe("1. a\n- b");
    const deep = "- a\n  - b\n    - c";
    expect(apply(deep, indentEdit(deep, at(deep, "c"), at(deep, "c"), true))).toBe("- a\n  - b\n  - c");
    expect(apply("   x", indentEdit("   x", 3, 3, true))).toBe("x");
    expect(apply("x", indentEdit("x", 0, 0, true))).toBe("x");
  });
});

describe("enterEdit", () => {
  const enter = (text: string, caret = text.length) => {
    const e = enterEdit(text, caret, false);
    return e && { text: apply(text, e), caret: e.selStart };
  };

  it("continues bullets, numbers and tasks", () => {
    expect(enter("- a")).toEqual({ text: "- a\n- ", caret: 6 });
    expect(enter("  3. a")?.text).toBe("  3. a\n  4. ");
    expect(enter("- [x] a")?.text).toBe("- [x] a\n- [ ] ");
  });

  it("splits a list item when the caret is mid-line", () => {
    expect(enter("- ab", 3)?.text).toBe("- a\n- b");
  });

  it("ends the list on an empty top-level item", () => {
    expect(enter("x\n- ")).toEqual({ text: "x\n", caret: 2 });
    expect(enter("- [ ] ")?.text).toBe("");
  });

  it("outdents an empty nested item instead of ending the list", () => {
    expect(enter("   - ")?.text).toBe("- ");
  });

  it("leaves plain lines, IME composition and code blocks to the browser", () => {
    expect(enterEdit("plain", 5, false)).toBeNull();
    expect(enterEdit("- 가", 3, true)).toBeNull();
    expect(enterEdit("```\n- a", 7, false)).toBeNull();
  });
});

describe("togglePrefixEdit", () => {
  const toggle = (text: string, prefix: Parameters<typeof togglePrefixEdit>[3], s = 0, e = text.length) =>
    apply(text, togglePrefixEdit(text, s, e, prefix));

  it("adds and removes a bullet", () => {
    expect(toggle("a", "bullet")).toBe("- a");
    expect(toggle("- a", "bullet")).toBe("a");
  });

  it("turns a bullet into a task and back", () => {
    expect(toggle("- a", "task")).toBe("- [ ] a");
    expect(toggle("- [x] a", "task")).toBe("a");
    expect(toggle("- [ ] a", "bullet")).toBe("- a");
  });

  it("adds and removes a heading", () => {
    expect(toggle("a", "heading")).toBe("## a");
    expect(toggle("## a", "heading")).toBe("a");
  });

  it("numbers every selected line and keeps indentation", () => {
    expect(toggle("a\nb\nc", "number")).toBe("1. a\n2. b\n3. c");
    expect(toggle("1. a\n2. b", "number")).toBe("a\nb");
    expect(toggle("  a", "bullet")).toBe("  - a");
  });
});

describe("toggleBoldEdit", () => {
  it("wraps the selection and keeps it selected", () => {
    const e = toggleBoldEdit("a b c", 2, 3);
    expect(apply("a b c", e)).toBe("a **b** c");
    expect(apply("a b c", e).slice(e.selStart, e.selEnd)).toBe("b");
  });

  it("unwraps an already bold selection", () => {
    expect(apply("a **b** c", toggleBoldEdit("a **b** c", 4, 5))).toBe("a b c");
    expect(apply("a **b** c", toggleBoldEdit("a **b** c", 2, 7))).toBe("a b c");
  });

  it("inserts empty markers with the caret between them", () => {
    const e = toggleBoldEdit("ab", 1, 1);
    expect(apply("ab", e)).toBe("a****b");
    expect([e.selStart, e.selEnd]).toEqual([3, 3]);
  });
});

describe("inFencedCode", () => {
  it("knows whether the caret line sits inside a fence", () => {
    const text = "```\nx\n```\ny";
    expect(inFencedCode(text, at(text, "x"))).toBe(true);
    expect(inFencedCode(text, at(text, "y"))).toBe(false);
  });
});
