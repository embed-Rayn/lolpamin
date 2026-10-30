import { extractMeetingNoteTasks, normalizeAssignee, seoulTodayInput, type MeetingNoteTask } from "@lolpamin/core";
import type { PrismaClient } from "@lolpamin/db";

// A due date this many Seoul days ahead (or less) is flagged as close.
export const DUE_SOON_DAYS = 3;
export const UNASSIGNED_LABEL = "미지정";

export interface MeetingNoteTaskRow extends MeetingNoteTask {
  noteId: string;
  noteTitle: string;
  meetingDate: Date;
  dueLevel: "overdue" | "soon" | null;
}

export interface MeetingNoteTaskGroup {
  key: string; // normalized assignee, "" for unassigned
  label: string; // first spelling seen, or 미지정
  open: number;
  rows: MeetingNoteTaskRow[];
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareRows(a: MeetingNoteTaskRow, b: MeetingNoteTaskRow): number {
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return b.meetingDate.getTime() - a.meetingDate.getTime() || a.line - b.line;
}

// The /meeting-notes/tasks board. Tasks live only in note bodies, so every body is read and
// parsed here — a few dozen notes, cheaper than a table four write paths would have to sync.
export async function listMeetingNoteTaskGroups(
  prisma: PrismaClient,
  opts: { includeDone: boolean; now: Date },
): Promise<MeetingNoteTaskGroup[]> {
  // Oldest first, so a group's label is the earliest spelling of the name.
  const notes = await prisma.meetingNote.findMany({
    orderBy: [{ meetingDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, meetingDate: true, body: true },
  });
  const today = seoulTodayInput(opts.now);
  const soonUntil = addDays(today, DUE_SOON_DAYS);
  const groups = new Map<string, MeetingNoteTaskGroup>();

  for (const note of notes) {
    for (const task of extractMeetingNoteTasks(note.body, note.meetingDate)) {
      if (task.checked && !opts.includeDone) continue;
      const dueLevel =
        task.due === null || task.checked ? null : task.due < today ? "overdue" : task.due <= soonUntil ? "soon" : null;
      const row: MeetingNoteTaskRow = { ...task, noteId: note.id, noteTitle: note.title, meetingDate: note.meetingDate, dueLevel };
      const owners = task.assignees.length > 0 ? task.assignees : [null];
      for (const owner of owners) {
        const key = owner === null ? "" : normalizeAssignee(owner);
        const group = groups.get(key) ?? { key, label: owner ?? UNASSIGNED_LABEL, open: 0, rows: [] };
        group.rows.push(row);
        if (!task.checked) group.open += 1;
        groups.set(key, group);
      }
    }
  }

  for (const group of groups.values()) group.rows.sort(compareRows);
  return [...groups.values()].sort((a, b) => {
    if ((a.key === "") !== (b.key === "")) return a.key === "" ? 1 : -1;
    return b.open - a.open || a.label.localeCompare(b.label, "ko");
  });
}
