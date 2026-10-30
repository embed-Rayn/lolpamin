import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  addMeetingNoteImage,
  createMeetingNote,
  deleteMeetingNote,
  MEETING_NOTE_BODY_MAX,
  MEETING_NOTE_IMAGE_MAX_BYTES,
  MeetingNoteConflictError,
  MeetingNoteTaskChangedError,
  MeetingNoteValidationError,
  toggleMeetingNoteTask,
  UNATTACHED_IMAGE_TTL_MS,
  updateMeetingNote,
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

const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };
const input = (body = "", title = "10월 운영 회의") => ({ title, meetingDate: "2026-10-02", body });

async function imageNoteId(id: string) {
  return (await prisma.meetingNoteImage.findUnique({ where: { id }, select: { noteId: true } }))?.noteId;
}

describe("createMeetingNote", () => {
  it("trims and stores the note with its author and meeting date", async () => {
    const admin = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, { title: "  회의 ", meetingDate: "2026-10-02", body: " 본문 " }, admin.id);
    const row = await prisma.meetingNote.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe("회의");
    expect(row.body).toBe("본문");
    expect(row.meetingDate.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(row.createdById).toBe(admin.id);
    expect(row.updatedById).toBe(admin.id);
    expect(row.version).toBe(0);
  });

  it("attaches unattached images the body references, and only those", async () => {
    const used = await addMeetingNoteImage(prisma, png, null);
    const unused = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`앞\n![](${used.id})\n뒤`), null);
    expect(await imageNoteId(used.id)).toBe(id);
    expect(await imageNoteId(unused.id)).toBeNull();
  });

  it("does not attach an image owned by another note", async () => {
    const image = await addMeetingNoteImage(prisma, png, null);
    const first = await createMeetingNote(prisma, input(`![](${image.id})`), null);
    await createMeetingNote(prisma, input(`![](${image.id})`, "다른 회의"), null);
    expect(await imageNoteId(image.id)).toBe(first.id);
  });

  it("rejects a blank title, a long title, a long body and a bad date", async () => {
    await expect(createMeetingNote(prisma, input("", "   "), null)).rejects.toThrow("제목을 입력해 주세요.");
    await expect(createMeetingNote(prisma, input("", "가".repeat(101)), null)).rejects.toThrow(MeetingNoteValidationError);
    await expect(createMeetingNote(prisma, input("가".repeat(MEETING_NOTE_BODY_MAX + 1)), null)).rejects.toThrow(
      MeetingNoteValidationError,
    );
    for (const meetingDate of ["", "2026-02-30", "nope"]) {
      await expect(createMeetingNote(prisma, { title: "t", meetingDate, body: "" }, null)).rejects.toThrow(
        "회의 날짜가 올바르지 않습니다.",
      );
    }
  });
});

describe("updateMeetingNote", () => {
  it("saves with the current version and bumps it", async () => {
    const admin = await prisma.admin.create({ data: { username: "editor", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("처음"), null);
    await updateMeetingNote(prisma, id, input("고침"), 0, admin.id);
    const row = await prisma.meetingNote.findUniqueOrThrow({ where: { id } });
    expect(row.body).toBe("고침");
    expect(row.version).toBe(1);
    expect(row.updatedById).toBe(admin.id);
  });

  it("rejects a second save with the same version and names who saved first", async () => {
    const admin = await prisma.admin.create({ data: { username: "빠른운영진", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("처음"), null);
    await updateMeetingNote(prisma, id, input("A"), 0, admin.id);
    const attempt = updateMeetingNote(prisma, id, input("B"), 0, null);
    await expect(attempt).rejects.toThrow(MeetingNoteConflictError);
    await expect(updateMeetingNote(prisma, id, input("B"), 0, null)).rejects.toThrow("빠른운영진");
    expect((await prisma.meetingNote.findUniqueOrThrow({ where: { id } })).body).toBe("A");
  });

  it("rejects a missing note and a malformed version", async () => {
    await expect(updateMeetingNote(prisma, "nope", input(), 0, null)).rejects.toThrow("회의록을 찾을 수 없습니다.");
    const { id } = await createMeetingNote(prisma, input(), null);
    await expect(updateMeetingNote(prisma, id, input(), Number.NaN, null)).rejects.toThrow(MeetingNoteValidationError);
  });

  it("attaches newly referenced images and deletes ones the body dropped", async () => {
    const kept = await addMeetingNoteImage(prisma, png, null);
    const dropped = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`![](${kept.id})\n![](${dropped.id})`), null);
    const added = await addMeetingNoteImage(prisma, png, null);
    await updateMeetingNote(prisma, id, input(`![](${kept.id})\n![](${added.id})`), 0, null);
    expect(await imageNoteId(kept.id)).toBe(id);
    expect(await imageNoteId(added.id)).toBe(id);
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: dropped.id } })).toBeNull();
  });

  it("deletes every image when the body drops them all", async () => {
    const image = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`![](${image.id})`), null);
    await updateMeetingNote(prisma, id, input(""), 0, null);
    expect(await prisma.meetingNoteImage.count({ where: { noteId: id } })).toBe(0);
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: image.id } })).toBeNull();
  });
});

describe("updateMeetingNote conflict", () => {
  it("carries the current note on the error", async () => {
    const op = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("A"), null);
    await updateMeetingNote(prisma, id, input("B", "바뀐 제목"), 0, op.id);
    const error = await updateMeetingNote(prisma, id, input("C"), 0, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeetingNoteConflictError);
    expect((error as MeetingNoteConflictError).current).toMatchObject({
      title: "바뀐 제목",
      meetingDate: "2026-10-02",
      body: "B",
      version: 1,
      updatedByName: "op",
    });
    expect((error as MeetingNoteConflictError).current.updatedAt).toBeInstanceOf(Date);
  });
});

describe("toggleMeetingNoteTask", () => {
  it("flips only that line, bumps version and records the admin", async () => {
    const op = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("- [ ] a\n- [ ] a"), null);
    await toggleMeetingNoteTask(prisma, id, 1, "a", true, op.id);
    const note = await prisma.meetingNote.findUniqueOrThrow({ where: { id } });
    expect(note.body).toBe("- [ ] a\n- [x] a");
    expect(note.version).toBe(1);
    expect(note.updatedById).toBe(op.id);
  });

  it("refuses when the line no longer holds that task", async () => {
    const { id } = await createMeetingNote(prisma, input("- [ ] a"), null);
    await expect(toggleMeetingNoteTask(prisma, id, 0, "b", true, null)).rejects.toThrow(MeetingNoteTaskChangedError);
    expect((await prisma.meetingNote.findUniqueOrThrow({ where: { id } })).body).toBe("- [ ] a");
  });

  it("rejects a missing note", async () => {
    await expect(toggleMeetingNoteTask(prisma, "nope", 0, "a", true, null)).rejects.toThrow("회의록을 찾을 수 없습니다.");
  });
});

describe("deleteMeetingNote", () => {
  it("removes the note and its images, and is harmless twice", async () => {
    const image = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`![](${image.id})`), null);
    await deleteMeetingNote(prisma, id);
    await deleteMeetingNote(prisma, id);
    expect(await prisma.meetingNote.count()).toBe(0);
    expect(await prisma.meetingNoteImage.count()).toBe(0);
  });
});

describe("addMeetingNoteImage", () => {
  it("rejects a wrong type and an oversized file", async () => {
    await expect(addMeetingNoteImage(prisma, { bytes: Buffer.from("x"), type: "image/svg+xml" }, null)).rejects.toThrow(
      MeetingNoteValidationError,
    );
    await expect(
      addMeetingNoteImage(prisma, { bytes: Buffer.alloc(MEETING_NOTE_IMAGE_MAX_BYTES + 1), type: "image/png" }, null),
    ).rejects.toThrow("5MB");
  });

  it("sweeps unattached images older than the TTL and keeps recent and attached ones", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const old = new Date(now.getTime() - UNATTACHED_IMAGE_TTL_MS - 1000);
    const stale = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: old } });
    const fresh = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: now } });
    const note = await prisma.meetingNote.create({ data: { title: "t", meetingDate: now } });
    const attached = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: old, noteId: note.id } });

    await addMeetingNoteImage(prisma, png, null, now);

    expect(await prisma.meetingNoteImage.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: attached.id } })).not.toBeNull();
  });
});
