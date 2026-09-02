import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "@/lib/mutations/absorb-member";
import { releaseMember } from "@/lib/mutations/release-member";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/inactive.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — members.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getInactiveReportData } = await import("./inactive");

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getInactiveReportData", () => {
  // getInactiveMembers는 kakaoUserId나 kakaoNickname이 있는 회원만 센다. 흡수한
  // 생존자가 그 조건을 만족하지 못하면 리포트가 통째로 비어 버린다.
  it("counts the survivor of an absorb as an inactivity candidate", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: daysAgo(40) },
    });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: daysAgo(40), rawMessage: "@유대혁" },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const data = await getInactiveReportData();
    expect(data.rows.map((r) => r.id)).toEqual([survivor.id]);
    expect(data.rows[0].kakaoNickname).toBe("유대혁/95/유대혁#KR1");
    expect(data.totalInactive).toBe(1);
    expect(data.longInactiveCount).toBe(1);
  });

  it("moves the candidacy back to the released member when the link is undone", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: daysAgo(40) },
    });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: daysAgo(40), rawMessage: "@유대혁" },
    });
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    const data = await getInactiveReportData();
    expect(data.rows.map((r) => r.id)).toEqual([loser.id]);
  });
});

describe("getInactiveReportData의 내전 횟수", () => {
  async function playAndCancel(cancel: boolean) {
    const { saveGameResult } = await import("@/lib/mutations/save-game-result");
    const { cancelGameResult } = await import("@/lib/mutations/cancel-game-result");
    const blue = await prisma.member.create({
      data: { discordUserId: "d-b", kakaoNickname: "블루/95/blue#KR1", lastActiveAt: daysAgo(40) },
    });
    const red = await prisma.member.create({
      data: { discordUserId: "d-r", kakaoNickname: "레드/95/red#KR1", lastActiveAt: daysAgo(40) },
    });
    const game = await saveGameResult(prisma, {
      playedAt: daysAgo(3),
      blueMemberIds: [blue.id],
      redMemberIds: [red.id],
      winner: "BLUE",
    });
    if (cancel) await cancelGameResult(prisma, game.gameResultId, null);
    return blue;
  }

  it("counts a live game", async () => {
    const blue = await playAndCancel(false);

    const data = await getInactiveReportData();

    expect(data.rows.find((r) => r.id === blue.id)?.gameCount).toBe(1);
  });

  // 취소한 경기는 없던 일이다. 빼지 않으면 되돌린 뒤에도 내전 횟수가 그대로 남는다.
  it("leaves a cancelled game out of the count", async () => {
    const blue = await playAndCancel(true);

    const data = await getInactiveReportData();

    expect(data.rows.find((r) => r.id === blue.id)?.gameCount).toBe(0);
  });
});

describe("미활동 리포트의 카톡 닉네임", () => {
  it("닉네임을 바꾼 회원은 최신 묘비의 이름으로 뜬다", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", realName: "유대혁", lastActiveAt: daysAgo(40) },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/옛날아이디#KR1",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/새아이디#KR3",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    });

    const data = await getInactiveReportData();

    expect(data.rows.find((r) => r.id === survivor.id)?.kakaoNickname).toBe("유대혁/95/새아이디#KR3");
  });
});
