import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { listMeetingNoteTaskGroups } from "./meeting-note-tasks";

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

// Seoul 2026-10-30 12:00.
const now = new Date("2026-10-30T03:00:00Z");

function note(body: string, meetingDate = "2026-10-20", title = "회의") {
  return prisma.meetingNote.create({ data: { title, meetingDate: new Date(`${meetingDate}T00:00:00Z`), body } });
}

describe("listMeetingNoteTaskGroups", () => {
  it("groups by assignee case-insensitively, a shared task in each group, 미지정 last", async () => {
    await note("- [ ] @Rayn @소영 같이\n- [ ] @rayn 혼자\n- [ ] 아무도");
    const groups = await listMeetingNoteTaskGroups(prisma, { includeDone: false, now });
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.text)])).toEqual([
      ["Rayn", ["같이", "혼자"]],
      ["소영", ["같이"]],
      ["미지정", ["아무도"]],
    ]);
    expect(groups[2].key).toBe("");
  });

  it("orders groups by open count", async () => {
    await note("- [ ] @a 1\n- [ ] @b 1\n- [ ] @b 2");
    const groups = await listMeetingNoteTaskGroups(prisma, { includeDone: false, now });
    expect(groups.map((g) => [g.label, g.open])).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
  });

  it("orders rows by due first, then undated rows by newest meeting", async () => {
    await note("- [ ] @a 오래된 회의", "2026-10-01");
    await note("- [ ] @a 최근 회의\n- [ ] @a 늦은 기한 ~11/20\n- [ ] @a 이른 기한 ~11/5", "2026-10-20");
    const [group] = await listMeetingNoteTaskGroups(prisma, { includeDone: false, now });
    expect(group.rows.map((r) => r.text)).toEqual(["이른 기한", "늦은 기한", "최근 회의", "오래된 회의"]);
    expect(group.rows[0]).toMatchObject({ noteTitle: "회의", due: "2026-11-05" });
  });

  it("flags overdue and soon dues in Seoul days", async () => {
    await note("- [ ] @a 지남 ~10/29\n- [ ] @a 임박 ~11/2\n- [ ] @a 여유 ~11/3\n- [ ] @a 오늘 ~10/30");
    const [group] = await listMeetingNoteTaskGroups(prisma, { includeDone: false, now });
    expect(Object.fromEntries(group.rows.map((r) => [r.text, r.dueLevel]))).toEqual({
      지남: "overdue",
      오늘: "soon",
      임박: "soon",
      여유: null,
    });
  });

  it("drops done tasks and their emptied groups unless includeDone", async () => {
    await note("- [x] @a 끝\n- [ ] @b 남음");
    expect((await listMeetingNoteTaskGroups(prisma, { includeDone: false, now })).map((g) => g.label)).toEqual(["b"]);
    const all = await listMeetingNoteTaskGroups(prisma, { includeDone: true, now });
    expect(all.map((g) => [g.label, g.open, g.rows.length])).toEqual([
      ["b", 1, 1],
      ["a", 0, 1],
    ]);
  });
});
