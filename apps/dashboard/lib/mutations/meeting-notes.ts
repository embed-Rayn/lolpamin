import { extractMeetingNoteImageIds, formatEventDateTime, parseMeetingDateInput } from "@lolpamin/core";
import type { Prisma, PrismaClient } from "@lolpamin/db";
import { adminLabel, adminNames } from "@/lib/queries/meeting-notes";

export const MEETING_NOTE_TITLE_MAX = 100;
export const MEETING_NOTE_BODY_MAX = 50_000;
export const MEETING_NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MEETING_NOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const UNATTACHED_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;

export class MeetingNoteValidationError extends Error {}

// The message is shown to the operator as is; their typed text stays in the editor.
export class MeetingNoteConflictError extends Error {
  constructor(updatedAt: Date, updatedByName: string) {
    super(
      `다른 운영진(${updatedByName})이 ${formatEventDateTime(updatedAt)}에 먼저 수정했습니다. ` +
        "내 내용은 화면에 남아 있으니 복사해 두고 새로 고침한 뒤 다시 반영해 주세요.",
    );
  }
}

export interface MeetingNoteInput {
  title: string;
  meetingDate: string;
  body: string;
}

export interface MeetingNoteImageUpload {
  bytes: Buffer;
  type: string;
}

const NOTE_NOT_FOUND = "회의록을 찾을 수 없습니다.";

function cleanInput(input: MeetingNoteInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new MeetingNoteValidationError("제목을 입력해 주세요.");
  if (title.length > MEETING_NOTE_TITLE_MAX) {
    throw new MeetingNoteValidationError(`제목은 ${MEETING_NOTE_TITLE_MAX}자를 넘을 수 없습니다.`);
  }
  if (body.length > MEETING_NOTE_BODY_MAX) {
    throw new MeetingNoteValidationError(`본문은 ${MEETING_NOTE_BODY_MAX.toLocaleString("ko-KR")}자를 넘을 수 없습니다.`);
  }
  const meetingDate = parseMeetingDateInput(input.meetingDate);
  if (!meetingDate) throw new MeetingNoteValidationError("회의 날짜가 올바르지 않습니다.");
  return { title, body, meetingDate };
}

// Only images nobody owns yet: an id copied from another note's body must not move that image.
async function attachReferencedImages(tx: Prisma.TransactionClient, noteId: string, imageIds: string[]) {
  if (imageIds.length === 0) return;
  await tx.meetingNoteImage.updateMany({ where: { id: { in: imageIds }, noteId: null }, data: { noteId } });
}

export async function createMeetingNote(
  prisma: PrismaClient,
  input: MeetingNoteInput,
  adminId: string | null,
): Promise<{ id: string }> {
  const data = cleanInput(input);
  return prisma.$transaction(async (tx) => {
    const note = await tx.meetingNote.create({
      data: { ...data, createdById: adminId, updatedById: adminId },
      select: { id: true },
    });
    await attachReferencedImages(tx, note.id, extractMeetingNoteImageIds(data.body));
    return note;
  });
}

// expectedVersion is the version the editor was opened at. Anything else means someone saved
// in between; the save is refused rather than silently overwriting their text.
export async function updateMeetingNote(
  prisma: PrismaClient,
  id: string,
  input: MeetingNoteInput,
  expectedVersion: number,
  adminId: string | null,
): Promise<void> {
  const data = cleanInput(input);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new MeetingNoteValidationError("저장 정보가 올바르지 않습니다. 새로 고침한 뒤 다시 시도해 주세요.");
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.meetingNote.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, updatedById: adminId, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await tx.meetingNote.findUnique({ where: { id }, select: { updatedAt: true, updatedById: true } });
      if (!current) throw new MeetingNoteValidationError(NOTE_NOT_FOUND);
      const names = await adminNames(tx, [current.updatedById]);
      throw new MeetingNoteConflictError(current.updatedAt, adminLabel(names, current.updatedById));
    }

    const imageIds = extractMeetingNoteImageIds(data.body);
    await attachReferencedImages(tx, id, imageIds);
    // An image the body no longer mentions is gone from the note for good.
    await tx.meetingNoteImage.deleteMany({ where: { noteId: id, id: { notIn: imageIds } } });
  });
}

// Images go with it (onDelete: Cascade). Deleting twice is harmless.
export async function deleteMeetingNote(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.meetingNote.deleteMany({ where: { id } });
}

// Uploaded before the note is saved, so it starts unowned; the save attaches it. Each upload
// also sweeps unowned images older than the TTL — the leftovers of abandoned drafts.
export async function addMeetingNoteImage(
  prisma: PrismaClient,
  upload: MeetingNoteImageUpload,
  adminId: string | null,
  now: Date = new Date(),
): Promise<{ id: string }> {
  if (!ALLOWED_MEETING_NOTE_IMAGE_TYPES.includes(upload.type)) {
    throw new MeetingNoteValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > MEETING_NOTE_IMAGE_MAX_BYTES) {
    throw new MeetingNoteValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.meetingNoteImage.deleteMany({
      where: { noteId: null, createdAt: { lt: new Date(now.getTime() - UNATTACHED_IMAGE_TTL_MS) } },
    });
    return tx.meetingNoteImage.create({
      data: { bytes: upload.bytes, type: upload.type, createdById: adminId },
      select: { id: true },
    });
  });
}
