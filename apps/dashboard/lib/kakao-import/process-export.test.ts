import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { processKakaoExport } from "./process-export";

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

const FIRST_UPLOAD = [
  "게임구인방 님과 카카오톡 대화",
  "저장한 날짜 : 2026-08-29 22:58:30",
  "--------------- 2026년 8월 29일 토요일 ---------------",
  "[김민준/94/늑 대#1003] [오전 9:00] @이서준/96/뚜비뚜밥#뚜비얌",
  "[김민준/94/늑 대#1003] [오전 9:05] @박지현/95/사육사#1003",
].join("\n");

describe("processKakaoExport", () => {
  it("creates half-record Members for unseen nicknames and logs their activity", async () => {
    const result = await processKakaoExport(prisma, FIRST_UPLOAD);

    expect(result).toEqual({ newMembers: 2, activityUpdates: 0, skippedAsAlreadyProcessed: 0 });

    const members = await prisma.member.findMany({ orderBy: { kakaoNickname: "asc" } });
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.kakaoNickname).sort()).toEqual([
      "박지현/95/사육사#1003",
      "이서준/96/뚜비뚜밥#뚜비얌",
    ]);
    expect(members.every((m) => m.discordUserId === null)).toBe(true);

    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(2);
  });

  it("updates lastActiveAt for an existing member matched by exact kakaoNickname, without touching other fields", async () => {
    const existing = await prisma.member.create({
      data: {
        kakaoNickname: "이서준/96/뚜비뚜밥#뚜비얌",
        realName: "이서준",
        elo: 1200,
        lastActiveAt: new Date("2026-08-01T00:00:00Z"),
      },
    });

    const result = await processKakaoExport(prisma, FIRST_UPLOAD);

    expect(result).toEqual({ newMembers: 1, activityUpdates: 1, skippedAsAlreadyProcessed: 0 });

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: existing.id } });
    expect(refreshed.elo).toBe(1200);
    expect(refreshed.realName).toBe("이서준");
    expect(refreshed.lastActiveAt).toEqual(new Date(2026, 7, 29, 9, 0));
  });

  it("skips mentions at or before the existing watermark on a second, overlapping upload", async () => {
    await processKakaoExport(prisma, FIRST_UPLOAD);

    const secondUpload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-08-29 23:00:00",
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:00] @이서준/96/뚜비뚜밥#뚜비얌",
      "[김민준/94/늑 대#1003] [오전 9:10] @박지현/95/사육사#1003",
    ].join("\n");

    const result = await processKakaoExport(prisma, secondUpload);

    expect(result).toEqual({ newMembers: 0, activityUpdates: 1, skippedAsAlreadyProcessed: 1 });

    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(3);

    const parkJihyun = await prisma.member.findFirstOrThrow({ where: { kakaoNickname: "박지현/95/사육사#1003" } });
    expect(parkJihyun.lastActiveAt).toEqual(new Date(2026, 7, 29, 9, 10));
  });
});
