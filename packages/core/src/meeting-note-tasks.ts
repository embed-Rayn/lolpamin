// Tasks in a meeting-note body are GFM checkbox list items. `@name` marks an assignee and
// `~M/D` (or `~YYYY/M/D`) a due date; a task without its own inherits each of them from the
// nearest ancestor list item that names one. Computed on read, never stored.

export interface MeetingNoteTask {
  line: number; // 0-based line index in the body
  checked: boolean;
  text: string; // without checkbox, @assignees and ~due; trimmed
  assignees: string[];
  due: string | null; // YYYY-MM-DD
  parentText: string | null; // display text of the nearest ancestor list item
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const CHECKBOX = /^\[([ xX])\]\s+(.*)$/;
const HEADING = /^#{1,6}(\s|$)/;
const FENCE = /^(`{3,}|~{3,})/;
const ASSIGNEE = /(^|\s)@(\S+)/g;
const DUE = /(^|\s)~(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?=\s|$)/g;

export function normalizeAssignee(name: string): string {
  return name.toLowerCase();
}

// A list item line split into its indentation and the text after the bullet.
export function parseListItem(line: string): { indent: number; marker: string; rest: string } | null {
  const match = LIST_ITEM.exec(line);
  return match ? { indent: match[1].length, marker: match[2], rest: match[3] } : null;
}

// The checkbox part of a list item line; `rest` is the raw text after the checkbox.
export function parseTaskLine(line: string): { checked: boolean; rest: string } | null {
  const item = parseListItem(line);
  const box = item && CHECKBOX.exec(item.rest);
  return box ? { checked: box[1] !== " ", rest: box[2] } : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// A month/day before the meeting's falls in the next year: a task set in December for January.
function resolveDue(year: string | undefined, month: string, day: string, meetingDate: Date): string | null {
  const m = Number(month);
  const d = Number(day);
  if (year) return validDate(Number(year), m, d);
  const meetingYear = meetingDate.getUTCFullYear();
  const meetingKey = (meetingDate.getUTCMonth() + 1) * 100 + meetingDate.getUTCDate();
  return validDate(m * 100 + d < meetingKey ? meetingYear + 1 : meetingYear, m, d);
}

interface ItemMeta {
  text: string;
  assignees: string[] | null;
  due: string | null;
}

function readItem(rest: string, meetingDate: Date): ItemMeta {
  const assignees: string[] = [];
  const seen = new Set<string>();
  let text = rest.replace(ASSIGNEE, (_, lead: string, name: string) => {
    if (!seen.has(normalizeAssignee(name))) {
      seen.add(normalizeAssignee(name));
      assignees.push(name);
    }
    return lead;
  });
  let due: string | null = null;
  text = text.replace(DUE, (whole: string, lead: string, year: string | undefined, month: string, day: string) => {
    if (due !== null) return whole;
    const resolved = resolveDue(year, month, day, meetingDate);
    if (resolved === null) return whole;
    due = resolved;
    return lead;
  });
  return { text: text.replace(/\s+/g, " ").trim(), assignees: assignees.length > 0 ? assignees : null, due };
}

export function extractMeetingNoteTasks(body: string, meetingDate: Date): MeetingNoteTask[] {
  const tasks: MeetingNoteTask[] = [];
  const stack: Array<ItemMeta & { indent: number }> = [];
  let fence: string | null = null;

  body.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    const fenceMatch = FENCE.exec(trimmed);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      return;
    }
    if (trimmed === "") return;

    const item = parseListItem(line);
    if (!item) {
      const indent = line.length - line.trimStart().length;
      if (HEADING.test(trimmed) || indent === 0) stack.length = 0;
      return;
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) stack.pop();
    const box = CHECKBOX.exec(item.rest);
    const meta = readItem(box ? box[2] : item.rest, meetingDate);

    if (box) {
      const named = (pick: (m: ItemMeta) => unknown) => [...stack].reverse().find((m) => pick(m) !== null);
      tasks.push({
        line: index,
        checked: box[1] !== " ",
        text: meta.text,
        assignees: meta.assignees ?? named((m) => m.assignees)?.assignees ?? [],
        due: meta.due ?? named((m) => m.due)?.due ?? null,
        parentText: stack.length > 0 ? stack[stack.length - 1].text : null,
      });
    }
    stack.push({ ...meta, indent: item.indent });
  });

  return tasks;
}

// Flips one task's checkbox. Refuses (null) unless line `line` is still a task whose text is
// expectedText — the body may have moved since the caller read it.
export function toggleMeetingNoteTaskLine(
  body: string,
  meetingDate: Date,
  line: number,
  expectedText: string,
  checked: boolean,
): string | null {
  const task = extractMeetingNoteTasks(body, meetingDate).find((t) => t.line === line);
  if (!task || task.text !== expectedText) return null;
  const parts = body.split(/(\r?\n)/);
  parts[line * 2] = parts[line * 2].replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
  return parts.join("");
}
