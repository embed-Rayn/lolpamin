import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// getLinkedMembers는 앱 싱글턴 prisma를 쓴다. linked-members.test.ts와 같은 방식으로 바꿔치기한다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getDraftPool } = await import("./draft-pool");

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function accountWith(memberId: string, puuid: string, gameName: string, rows: Array<[number, number, number]>) {
  const acc = await prisma.riotAccount.create({
    data: { puuid, memberId, gameName, tagLine: "KR1", lastSeenAt: new Date() },
  });
  await prisma.championMastery.createMany({
    data: rows.map(([championId, level, points]) => ({ riotAccountId: acc.id, championId, level, points })),
  });
  return acc;
}

describe("getDraftPool", () => {
  it("combines masteries over every account and shows the heaviest account as the riot id", async () => {
    const m = await prisma.member.create({ data: { realName: "가", mainLane: "MID", subLane: "TOP" } });
    await accountWith(m.id, "p-1", "본캐", [[1, 10, 500], [2, 9, 400]]);
    await accountWith(m.id, "p-2", "부캐", [[2, 12, 300], [3, 5, 50]]);

    const [row] = await getDraftPool(prisma);

    expect(row).toMatchObject({
      id: m.id,
      mainLane: "MID",
      subLane: "TOP",
      riotId: "본캐#KR1",
      extraAccounts: 1,
      masteries: [
        { championId: 2, level: 12, points: 700 },
        { championId: 1, level: 10, points: 500 },
        { championId: 3, level: 5, points: 50 },
      ],
    });
  });

  it("falls back to the hand-written riot id and no masteries for a member without an account", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", kakaoNickname: "가/94/닉", riotId: "손으로#적음" },
    });

    const [row] = await getDraftPool(prisma);

    expect(row).toMatchObject({ riotId: "손으로#적음", extraAccounts: 0, masteries: [] });
  });

  it("keeps getLinkedMembers' MMR order", async () => {
    const low = await prisma.member.create({ data: { realName: "낮음", mmr: 900 } });
    const high = await prisma.member.create({ data: { realName: "높음", mmr: 1100 } });
    await accountWith(low.id, "p-low", "low", []);
    await accountWith(high.id, "p-high", "high", []);

    expect((await getDraftPool(prisma)).map((r) => r.id)).toEqual([high.id, low.id]);
  });
});
