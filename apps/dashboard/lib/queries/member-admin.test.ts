import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberAdminRows, parseMemberAdminDirection, parseMemberAdminSort } from "./member-admin";

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

const NOW = new Date(2026, 8, 23, 12, 0, 0);

describe("parse helpers", () => {
  it("defaults to name ascending", () => {
    expect(parseMemberAdminSort(undefined)).toBe("realName");
    expect(parseMemberAdminSort("bogus")).toBe("realName");
    expect(parseMemberAdminSort("lastActive")).toBe("lastActive");
    expect(parseMemberAdminDirection(undefined)).toBe("asc");
    expect(parseMemberAdminDirection("desc")).toBe("desc");
  });
});

describe("getMemberAdminRows", () => {
  it("returns every editable field for an active member", async () => {
    await prisma.member.create({
      data: {
        realName: "가",
        kakaoNickname: "가/94/닉#KR1",
        age: 95,
        peakTier: "DIAMOND_1",
        tier: "EMERALD_2",
        mainLane: "MID",
        subLane: "SUP",
        note: "메모",
        lastActiveAt: new Date(2026, 8, 13, 20, 0, 0),
      },
    });

    const [row] = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(row).toMatchObject({
      realName: "가",
      age: 95,
      birthYear: 1995,
      peakTier: "DIAMOND_1",
      tier: "EMERALD_2",
      mainLane: "MID",
      subLane: "SUP",
      note: "메모",
      lastActiveDate: "2026-09-13",
      daysSinceActive: 9,
      riotAccounts: [],
      masteries: [],
    });
  });

  it("falls back to the nickname's birth year and to createdAt", async () => {
    await prisma.member.create({
      data: { realName: "가", kakaoNickname: "가/01/닉#KR1", createdAt: new Date(2026, 8, 20, 9, 0, 0) },
    });

    const [row] = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(row.age).toBeNull();
    expect(row.birthYear).toBe(2001);
    expect(row.lastActiveDate).toBe("2026-09-20");
    expect(row.daysSinceActive).toBe(3);
  });

  it("leaves tombstones out and sums the survivor's moved accounts", async () => {
    const survivor = await prisma.member.create({ data: { realName: "생존", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "생존/94/닉#KR1", mergedIntoId: survivor.id } });
    const a1 = await prisma.riotAccount.create({
      data: { puuid: "p-1", memberId: survivor.id, gameName: "본", tagLine: "KR1", lastSeenAt: new Date() },
    });
    const a2 = await prisma.riotAccount.create({
      data: { puuid: "p-2", memberId: survivor.id, gameName: "부", tagLine: "KR1", lastSeenAt: new Date() },
    });
    await prisma.championMastery.createMany({
      data: [
        { riotAccountId: a1.id, championId: 10, level: 7, points: 50 },
        { riotAccountId: a2.id, championId: 10, level: 7, points: 60 },
        { riotAccountId: a2.id, championId: 20, level: 7, points: 100 },
      ],
    });

    const rows = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].riotAccounts).toHaveLength(2);
    expect(rows[0].birthYear).toBe(1994);
    expect(rows[0].masteries.map((e) => [e.championId, e.points])).toEqual([
      [10, 110],
      [20, 100],
    ]);
  });

  it("sorts by peak tier score, ties by id", async () => {
    await prisma.member.create({ data: { realName: "가", peakTier: "SILVER_1" } });
    await prisma.member.create({ data: { realName: "나", peakTier: "MASTER_0_200" } });
    await prisma.member.create({ data: { realName: "다", peakTier: "GOLD_4" } });

    const rows = await getMemberAdminRows(prisma, "peakTier", "desc", NOW);

    expect(rows.map((r) => r.realName)).toEqual(["나", "다", "가"]);
  });

  it("sorts by last active date, oldest first ascending", async () => {
    await prisma.member.create({ data: { realName: "가", lastActiveAt: new Date(2026, 8, 20) } });
    await prisma.member.create({ data: { realName: "나", lastActiveAt: new Date(2026, 7, 1) } });

    const rows = await getMemberAdminRows(prisma, "lastActive", "asc", NOW);

    expect(rows.map((r) => r.realName)).toEqual(["나", "가"]);
  });

  it("keeps members without a birth year last in both directions", async () => {
    await prisma.member.create({ data: { realName: "가", age: 94 } });
    await prisma.member.create({ data: { realName: "나" } });
    await prisma.member.create({ data: { realName: "다", age: 1 } });

    const asc = await getMemberAdminRows(prisma, "age", "asc", NOW);
    const desc = await getMemberAdminRows(prisma, "age", "desc", NOW);

    expect(asc.map((r) => r.realName)).toEqual(["가", "다", "나"]);
    expect(desc.map((r) => r.realName)).toEqual(["다", "가", "나"]);
  });
});
