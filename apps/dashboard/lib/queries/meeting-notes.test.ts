import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  DELETED_ADMIN_LABEL,
  getMeetingNote,
  getMeetingNoteImage,
  listMeetingNotes,
  MEETING_NOTES_PAGE_SIZE,
  parseMeetingNotesPage,
} from "./meeting-notes";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe("parseMeetingNotesPage", () => {
  it("accepts positive integers only", () => {
    expect(parseMeetingNotesPage("3")).toBe(3);
    expect(parseMeetingNotesPage(undefined)).toBe(1);
    expect(parseMeetingNotesPage("0")).toBe(1);
    expect(parseMeetingNotesPage("x")).toBe(1);
  });
});

describe("listMeetingNotes", () => {
  it("orders by meeting date then creation, newest first, with author names", async () => {
    const admin = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    await prisma.meetingNote.create({ data: { title: "old", meetingDate: day("2026-09-01"), createdById: admin.id, updatedById: admin.id } });
    // Explicit createdAt: rows created in one millisecond would otherwise tie.
    await prisma.meetingNote.create({
      data: { title: "new-a", meetingDate: day("2026-10-01"), createdAt: new Date("2026-10-01T10:00:00Z"), createdById: "gone", updatedById: "gone" },
    });
    await prisma.meetingNote.create({
      data: { title: "new-b", meetingDate: day("2026-10-01"), createdAt: new Date("2026-10-01T11:00:00Z"), version: 2, updatedById: admin.id },
    });

    const list = await listMeetingNotes(prisma, 1);
    expect(list.rows.map((r) => r.title)).toEqual(["new-b", "new-a", "old"]);
    expect(list.rows[1].createdByName).toBe(DELETED_ADMIN_LABEL);
    expect(list.rows[2].createdByName).toBe("op");
    expect(list.rows[0].edited).toBe(true);
    expect(list.rows[2].edited).toBe(false);
    expect(list.total).toBe(3);
    expect(list.pageCount).toBe(1);
  });

  it("clamps an out-of-range page to the last page", async () => {
    await prisma.meetingNote.createMany({
      data: Array.from({ length: MEETING_NOTES_PAGE_SIZE + 1 }, (_, i) => ({ title: `n${i}`, meetingDate: day("2026-10-01") })),
    });
    const list = await listMeetingNotes(prisma, 99);
    expect(list.page).toBe(2);
    expect(list.pageCount).toBe(2);
    expect(list.rows).toHaveLength(1);
  });

  it("returns page 1 of 1 when empty", async () => {
    expect(await listMeetingNotes(prisma, 5)).toEqual({ rows: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("getMeetingNote / getMeetingNoteImage", () => {
  it("returns the body, version and attached image ids", async () => {
    const note = await prisma.meetingNote.create({ data: { title: "t", meetingDate: day("2026-10-02"), body: "b", version: 3 } });
    const image = await prisma.meetingNoteImage.create({
      data: { noteId: note.id, bytes: Buffer.from([1, 2]), type: "image/png" },
    });
    const detail = await getMeetingNote(prisma, note.id);
    expect(detail).toMatchObject({ title: "t", body: "b", version: 3, imageIds: [image.id], createdByName: DELETED_ADMIN_LABEL });
    expect(await getMeetingNote(prisma, "nope")).toBeNull();

    const bytes = await getMeetingNoteImage(prisma, image.id);
    expect(bytes?.type).toBe("image/png");
    expect(Buffer.from(bytes!.bytes)).toEqual(Buffer.from([1, 2]));
    expect(await getMeetingNoteImage(prisma, "nope")).toBeNull();
  });
});
