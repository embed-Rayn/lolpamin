import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { deleteMember } from "./delete-member";

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

describe("deleteMember", () => {
  it("deletes a member that has no mention logs or game participations", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "올빼미" } });

    const result = await deleteMember(prisma, member.id);

    expect(result).toEqual({ mentionLogs: 0, gameParticipants: 0 });
    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeNull();
  });

  it("deletes the member's mention logs along with the member", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "올빼미" } });
    await prisma.mentionLog.createMany({
      data: [
        { memberId: member.id, mentionedAt: new Date(2026, 7, 29, 9, 0), rawMessage: "@올빼미" },
        { memberId: member.id, mentionedAt: new Date(2026, 7, 29, 9, 5), rawMessage: "@올빼미" },
      ],
    });

    const result = await deleteMember(prisma, member.id);

    expect(result.mentionLogs).toBe(2);
    expect(await prisma.mentionLog.count()).toBe(0);
    expect(await prisma.member.count()).toBe(0);
  });

  it("deletes the member's game participations, leaving the games themselves in place", async () => {
    const leaving = await prisma.member.create({ data: { discordUserId: "d-1", kakaoUserId: "k-1" } });
    const staying = await prisma.member.create({ data: { discordUserId: "d-2", kakaoUserId: "k-2" } });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date(2026, 7, 29), winner: "BLUE" } });
    await prisma.gameParticipant.createMany({
      data: [
        { gameResultId: game.id, memberId: leaving.id, team: "BLUE", eloBefore: 1000, eloAfter: 1016 },
        { gameResultId: game.id, memberId: staying.id, team: "RED", eloBefore: 1000, eloAfter: 984 },
      ],
    });

    const result = await deleteMember(prisma, leaving.id);

    expect(result.gameParticipants).toBe(1);
    expect(await prisma.gameResult.count()).toBe(1);
    const remaining = await prisma.gameParticipant.findMany();
    expect(remaining.map((p) => p.memberId)).toEqual([staying.id]);
  });

  it("throws when the member does not exist", async () => {
    await expect(deleteMember(prisma, "5f1a1a2e-0000-4000-8000-000000000000")).rejects.toThrow();
  });

  it("leaves everything untouched when the member does not exist", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "올빼미" } });
    await prisma.mentionLog.create({ data: { memberId: member.id, mentionedAt: new Date(2026, 7, 29, 9, 0) } });

    await expect(deleteMember(prisma, "5f1a1a2e-0000-4000-8000-000000000000")).rejects.toThrow();

    expect(await prisma.member.count()).toBe(1);
    expect(await prisma.mentionLog.count()).toBe(1);
  });

  it("deletes the tombstones the member absorbed, and their records", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });
    await prisma.mentionLog.create({
      data: { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@옛닉" },
    });

    const result = await deleteMember(prisma, survivor.id);

    expect(result.mentionLogs).toBe(1);
    expect(await prisma.member.findUnique({ where: { id: tombstone.id } })).toBeNull();
    expect(await prisma.member.findUnique({ where: { id: survivor.id } })).toBeNull();
  });
});
