import { parseListItem } from "./meeting-note-tasks";

// Text transforms behind the meeting-note editor's keys and toolbar. Each returns one
// replacement of [start, end) and where the selection lands, so the editor can apply it as a
// single undoable insertion.

export interface TextEdit {
  start: number;
  end: number;
  insert: string;
  selStart: number;
  selEnd: number;
}

export type LinePrefix = "heading" | "bullet" | "number" | "task";

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s+/;
const CHECKBOX = /^\[[ xX]\]\s*/;
const DEFAULT_INDENT = 2;

function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndAt(text: string, pos: number): number {
  const end = text.indexOf("\n", pos);
  return end < 0 ? text.length : end;
}

const indentOf = (line: string) => line.length - line.trimStart().length;

// The whole lines a selection touches. A selection ending at the very start of a line does
// not take that line.
function lineBlock(text: string, selStart: number, selEnd: number) {
  const start = lineStartAt(text, selStart);
  const lastPos = selEnd > selStart && lineStartAt(text, selEnd) === selEnd ? selEnd - 1 : selEnd;
  const end = lineEndAt(text, Math.max(lastPos, start));
  return { start, end, lines: text.slice(start, end).split("\n") };
}

// Non-blank lines above `lineStart`, nearest first.
function linesAbove(text: string, lineStart: number): string[] {
  return text
    .slice(0, Math.max(0, lineStart - 1))
    .split("\n")
    .reverse()
    .filter((l) => l.trim() !== "");
}

export function inFencedCode(text: string, caret: number): boolean {
  let open = false;
  for (const line of text.slice(0, lineStartAt(text, caret)).split("\n")) {
    if (FENCE.test(line)) open = !open;
  }
  return open;
}

// Tab: indent to where the text of the list item above starts, so the line becomes its child
// in standard markdown (3 spaces under "1. ", 2 under "- "). Shift+Tab: back to the
// indentation of the nearest shallower list item above, or to the margin.
export function indentEdit(text: string, selStart: number, selEnd: number, outdent: boolean): TextEdit {
  const block = lineBlock(text, selStart, selEnd);
  const current = indentOf(block.lines[0]);
  const above = linesAbove(text, block.start);
  let target: number;
  if (outdent) {
    const parent = above.map((l) => ({ l, item: parseListItem(l) })).find((x) => x.item && x.item.indent < current);
    target = parent?.item?.indent ?? 0;
  } else {
    const prev = above[0] !== undefined ? parseListItem(above[0]) : null;
    const contentStart = prev ? above[0].length - prev.rest.length : -1;
    target = prev && contentStart > current ? contentStart : current + DEFAULT_INDENT;
  }
  const delta = target - current;

  let firstShift = 0;
  let total = 0;
  const lines = block.lines.map((line, i) => {
    const shift = Math.max(delta, -indentOf(line));
    if (i === 0) firstShift = shift;
    total += shift;
    return shift >= 0 ? " ".repeat(shift) + line : line.slice(-shift);
  });
  const insert = lines.join("\n");
  const newStart = Math.max(block.start, selStart + firstShift);
  return {
    start: block.start,
    end: block.end,
    insert,
    selStart: newStart,
    selEnd: Math.max(newStart, selEnd + total),
  };
}

function nextMarker(marker: string): string {
  const number = /^(\d+)([.)])$/.exec(marker);
  return number ? `${Number(number[1]) + 1}${number[2]}` : marker;
}

// Enter on a list line: continue the list on the next line, or end it on an empty item.
// null hands Enter back to the browser (plain line, IME composition, code block).
export function enterEdit(text: string, caret: number, composing: boolean): TextEdit | null {
  if (composing || inFencedCode(text, caret)) return null;
  const start = lineStartAt(text, caret);
  const end = lineEndAt(text, caret);
  const line = text.slice(start, end);
  const item = parseListItem(line);
  if (!item) return null;
  const task = CHECKBOX.test(item.rest);
  const content = task ? item.rest.replace(CHECKBOX, "") : item.rest;

  if (content.trim() === "") {
    if (item.indent > 0) return indentEdit(text, caret, caret, true);
    return { start, end, insert: "", selStart: start, selEnd: start };
  }
  if (caret - start < line.length - item.rest.length) return null;

  const prefix = `${" ".repeat(item.indent)}${nextMarker(item.marker)} ${task ? "[ ] " : ""}`;
  const insert = `\n${prefix}`;
  return { start: caret, end: caret, insert, selStart: caret + insert.length, selEnd: caret + insert.length };
}

interface LineShape {
  indent: string;
  kind: "heading" | "bullet" | "number" | "task" | "plain";
  content: string;
}

function shapeOf(line: string): LineShape {
  const indent = line.slice(0, indentOf(line));
  const body = line.slice(indent.length);
  const heading = HEADING.exec(body);
  if (heading) return { indent, kind: "heading", content: body.slice(heading[0].length) };
  const item = parseListItem(line);
  if (!item) return { indent, kind: "plain", content: body };
  if (CHECKBOX.test(item.rest)) return { indent, kind: "task", content: item.rest.replace(CHECKBOX, "") };
  return { indent, kind: /\d/.test(item.marker) ? "number" : "bullet", content: item.rest };
}

// Toolbar line buttons. The first selected line decides: if it already has this prefix the
// prefix comes off every line that has it; otherwise every line gets it (replacing another
// list prefix). Numbers count from 1 down the selection.
export function togglePrefixEdit(text: string, selStart: number, selEnd: number, prefix: LinePrefix): TextEdit {
  const block = lineBlock(text, selStart, selEnd);
  const shapes = block.lines.map(shapeOf);
  const remove = shapes[0].kind === prefix;
  const lines = shapes.map((s, i) => {
    if (remove) return s.kind === prefix ? s.indent + s.content : block.lines[i];
    const head = { heading: "## ", bullet: "- ", number: `${i + 1}. `, task: "- [ ] " }[prefix];
    return s.indent + head + s.content;
  });
  const insert = lines.join("\n");
  const caret = block.start + insert.length;
  return {
    start: block.start,
    end: block.end,
    insert,
    selStart: selStart === selEnd ? caret : block.start,
    selEnd: caret,
  };
}

export function toggleBoldEdit(text: string, selStart: number, selEnd: number): TextEdit {
  const selected = text.slice(selStart, selEnd);
  if (text.slice(selStart - 2, selStart) === "**" && text.slice(selEnd, selEnd + 2) === "**" && selStart >= 2) {
    return { start: selStart - 2, end: selEnd + 2, insert: selected, selStart: selStart - 2, selEnd: selEnd - 2 };
  }
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { start: selStart, end: selEnd, insert: inner, selStart, selEnd: selStart + inner.length };
  }
  return { start: selStart, end: selEnd, insert: `**${selected}**`, selStart: selStart + 2, selEnd: selEnd + 2 };
}
