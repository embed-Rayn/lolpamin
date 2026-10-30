// Meeting-note drafts live in this browser's localStorage only — never on the server, never
// across devices. Every access swallows errors: private mode, a full quota or a corrupt value
// means "no draft", not a broken editor.

export interface MeetingNoteDraft {
  title: string;
  meetingDate: string;
  body: string;
  imageIds: string[];
  // The server values the draft was written against (null for a new note). On save they
  // decide whether only checkboxes moved underneath (rebaseMeetingNoteToggles) or a real
  // conflict needs the side-by-side panel.
  baseVersion: number | null;
  baseTitle: string | null;
  baseMeetingDate: string | null;
  baseBody: string | null;
  savedAt: string;
}

export const draftKey = (noteId?: string) => `lolpamin.meeting-note.draft.${noteId ?? "new"}`;
// My text set aside when I chose 「상대 것 불러오기」 on a conflict.
export const stashKey = (noteId: string) => `lolpamin.meeting-note.stash.${noteId}`;

const isStringOrNull = (v: unknown) => v === null || typeof v === "string";

function isDraft(value: unknown): value is MeetingNoteDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    typeof d.meetingDate === "string" &&
    typeof d.body === "string" &&
    Array.isArray(d.imageIds) &&
    d.imageIds.every((id) => typeof id === "string") &&
    (d.baseVersion === null || typeof d.baseVersion === "number") &&
    isStringOrNull(d.baseTitle) &&
    isStringOrNull(d.baseMeetingDate) &&
    isStringOrNull(d.baseBody) &&
    typeof d.savedAt === "string"
  );
}

export function readDraft(storage: Storage | null, key: string): MeetingNoteDraft | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDraft(storage: Storage | null, key: string, draft: MeetingNoteDraft): void {
  try {
    storage?.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or a blocked storage: the editor keeps working without a draft.
  }
}

export function clearDraft(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Same as above.
  }
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
