"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import {
  addMeetingNoteImage,
  createMeetingNote,
  deleteMeetingNote,
  MeetingNoteConflictError,
  MeetingNoteTaskChangedError,
  MeetingNoteValidationError,
  toggleMeetingNoteTask,
  updateMeetingNote,
  type MeetingNoteSnapshot,
} from "@/lib/mutations/meeting-notes";

interface MeetingNoteActionResult {
  error: string | null;
}

// MeetingNoteSnapshot with the date as a string: server-action results cross to the client.
export type MeetingNoteSnapshotDto = Omit<MeetingNoteSnapshot, "updatedAt"> & { updatedAt: string };

// Validation and conflict messages are written for the operator; anything else (a Prisma
// error in English) is replaced by a short Korean fallback.
function toMessage(error: unknown, fallback: string): string {
  return error instanceof MeetingNoteValidationError ||
    error instanceof MeetingNoteConflictError ||
    error instanceof MeetingNoteTaskChangedError
    ? error.message
    : fallback;
}

function revalidateNote(id: string) {
  revalidatePath("/meeting-notes");
  revalidatePath("/meeting-notes/tasks");
  revalidatePath(`/meeting-notes/${id}`);
  revalidatePath(`/meeting-notes/${id}/edit`);
}

function readInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    meetingDate: String(formData.get("meetingDate") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
}

// Returns the new id instead of calling redirect(): a redirecting action resolves the
// client's promise with undefined, which the editor would then read as a result.
export async function createMeetingNoteAction(
  formData: FormData,
): Promise<MeetingNoteActionResult & { id?: string }> {
  const acting = await requireAdmin();
  let id: string;
  try {
    id = (await createMeetingNote(prisma, readInput(formData), acting.id)).id;
  } catch (error) {
    return { error: toMessage(error, "회의록을 저장하지 못했습니다.") };
  }
  revalidatePath("/meeting-notes");
  return { error: null, id };
}

export async function updateMeetingNoteAction(
  id: string,
  formData: FormData,
): Promise<MeetingNoteActionResult & { conflict?: MeetingNoteSnapshotDto }> {
  const acting = await requireAdmin();
  // Number("") is 0, which would pass as a real version; an empty field must fail validation.
  const rawVersion = String(formData.get("version") ?? "");
  const version = rawVersion === "" ? Number.NaN : Number(rawVersion);
  try {
    await updateMeetingNote(prisma, id, readInput(formData), version, acting.id);
  } catch (error) {
    if (error instanceof MeetingNoteConflictError) {
      return { error: error.message, conflict: { ...error.current, updatedAt: error.current.updatedAt.toISOString() } };
    }
    return { error: toMessage(error, "회의록을 저장하지 못했습니다.") };
  }
  revalidateNote(id);
  return { error: null };
}

export async function toggleMeetingNoteTaskAction(
  noteId: string,
  line: number,
  expectedText: string,
  checked: boolean,
): Promise<MeetingNoteActionResult> {
  const acting = await requireAdmin();
  try {
    await toggleMeetingNoteTask(prisma, noteId, line, expectedText, checked, acting.id);
  } catch (error) {
    return { error: toMessage(error, "할 일을 저장하지 못했습니다.") };
  }
  revalidateNote(noteId);
  return { error: null };
}

export async function deleteMeetingNoteAction(id: string): Promise<MeetingNoteActionResult> {
  await requireAdmin();
  try {
    await deleteMeetingNote(prisma, id);
  } catch (error) {
    return { error: toMessage(error, "회의록을 삭제하지 못했습니다.") };
  }
  revalidateNote(id);
  return { error: null };
}

// One file per call: each stays under the 20mb server-action body limit.
export async function addMeetingNoteImageAction(
  formData: FormData,
): Promise<MeetingNoteActionResult & { id?: string }> {
  const acting = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라 주세요." };
  try {
    const { id } = await addMeetingNoteImage(
      prisma,
      { bytes: Buffer.from(await file.arrayBuffer()), type: file.type },
      acting.id,
    );
    return { error: null, id };
  } catch (error) {
    return { error: toMessage(error, "이미지를 올리지 못했습니다.") };
  }
}
