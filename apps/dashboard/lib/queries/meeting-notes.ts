import type { PrismaClient } from "@lolpamin/db";

export const MEETING_NOTES_PAGE_SIZE = 20;
// Author ids are not FKs: a deleted admin's notes stay and show this instead.
export const DELETED_ADMIN_LABEL = "삭제된 관리자";

export function parseMeetingNotesPage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export async function adminNames(
  prisma: Pick<PrismaClient, "admin">,
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const admins = await prisma.admin.findMany({ where: { id: { in: wanted } }, select: { id: true, username: true } });
  return new Map(admins.map((a) => [a.id, a.username]));
}

export function adminLabel(names: Map<string, string>, id: string | null): string {
  return (id && names.get(id)) || DELETED_ADMIN_LABEL;
}

export interface MeetingNoteListRow {
  id: string;
  title: string;
  meetingDate: Date;
  createdAt: Date;
  createdByName: string;
  updatedAt: Date;
  updatedByName: string;
  // False until the first save after creation — the list shows "-" for 최종 수정.
  edited: boolean;
}

export interface MeetingNoteList {
  rows: MeetingNoteListRow[];
  page: number;
  pageCount: number;
  total: number;
}

// Never reads body or images: a list of notes would drag every body through the query.
export async function listMeetingNotes(prisma: PrismaClient, requestedPage: number): Promise<MeetingNoteList> {
  const total = await prisma.meetingNote.count();
  const pageCount = Math.max(1, Math.ceil(total / MEETING_NOTES_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const notes = await prisma.meetingNote.findMany({
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * MEETING_NOTES_PAGE_SIZE,
    take: MEETING_NOTES_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      meetingDate: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      createdById: true,
      updatedById: true,
    },
  });
  const names = await adminNames(prisma, notes.flatMap((n) => [n.createdById, n.updatedById]));
  return {
    rows: notes.map((n) => ({
      id: n.id,
      title: n.title,
      meetingDate: n.meetingDate,
      createdAt: n.createdAt,
      createdByName: adminLabel(names, n.createdById),
      updatedAt: n.updatedAt,
      updatedByName: adminLabel(names, n.updatedById),
      edited: n.version > 0,
    })),
    page,
    pageCount,
    total,
  };
}

export interface MeetingNoteDetail {
  id: string;
  title: string;
  meetingDate: Date;
  body: string;
  createdAt: Date;
  createdByName: string;
  updatedAt: Date;
  updatedByName: string;
  version: number;
  edited: boolean;
  imageIds: string[];
}

export async function getMeetingNote(prisma: PrismaClient, id: string): Promise<MeetingNoteDetail | null> {
  const note = await prisma.meetingNote.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      meetingDate: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      createdById: true,
      updatedById: true,
      images: { select: { id: true } },
    },
  });
  if (!note) return null;
  const names = await adminNames(prisma, [note.createdById, note.updatedById]);
  return {
    id: note.id,
    title: note.title,
    meetingDate: note.meetingDate,
    body: note.body,
    createdAt: note.createdAt,
    createdByName: adminLabel(names, note.createdById),
    updatedAt: note.updatedAt,
    updatedByName: adminLabel(names, note.updatedById),
    version: note.version,
    edited: note.version > 0,
    imageIds: note.images.map((i) => i.id),
  };
}

export async function getMeetingNoteImage(
  prisma: PrismaClient,
  id: string,
): Promise<{ bytes: Buffer; type: string } | null> {
  const image = await prisma.meetingNoteImage.findUnique({ where: { id }, select: { bytes: true, type: true } });
  return image ? { bytes: Buffer.from(image.bytes), type: image.type } : null;
}
