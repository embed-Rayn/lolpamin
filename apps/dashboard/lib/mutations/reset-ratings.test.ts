import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { resetAllRatings } from "./reset-ratings";

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

const SOFT = { kind: "SOFT", adminId: null } as const;
const HARD = { kind: "HARD", adminId: null } as const;

describe("resetAllRatings (SOFT)", () => {
  it("pulls every active member halfway back to the base rating", async () => {
    const high = await prisma.member.create({ data: { discordUserId: "d-high", mmr: 1300 } });
    const low = await prisma.member.create({ data: { discordUserId: "d-low", mmr: 800 } });

    const result = await resetAllRatings(prisma, SOFT);

    expect(result.count).toBe(2);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: high.id } })).mmr).toBe(1150);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: low.id } })).mmr).toBe(900);
  });

  it("skips tombstones — their mmr is not a live rating", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1200 } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mmr: 1400, mergedIntoId: survivor.id },
    });

    const result = await resetAllRatings(prisma, SOFT);

    expect(result.count).toBe(1);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: tombstone.id } })).mmr).toBe(1400);
  });

  it("leaves recorded game history untouched", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1200 } });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date("2026-08-23T12:00:00Z"), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: member.id, team: "BLUE", mmrBefore: 1177, mmrAfter: 1200 },
    });

    await resetAllRatings(prisma, SOFT);

    const participant = await prisma.gameParticipant.findFirstOrThrow({ where: { memberId: member.id } });
    expect(participant.mmrBefore).toBe(1177);
    expect(participant.mmrAfter).toBe(1200);
    expect(await prisma.gameResult.count()).toBe(1);
  });

  it("is safe to run when nothing changes", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1000 } });

    const result = await resetAllRatings(prisma, SOFT);

    expect(result.count).toBe(1);
    expect((await prisma.member.findFirstOrThrow()).mmr).toBe(1000);
  });

  it("reports zero when there are no members", async () => {
    const result = await resetAllRatings(prisma, SOFT);
    expect(result.count).toBe(0);
  });
});

describe("resetAllRatings (HARD)", () => {
  it("puts every active member on the base rating", async () => {
    const high = await prisma.member.create({ data: { discordUserId: "d-high", mmr: 1300 } });
    const low = await prisma.member.create({ data: { discordUserId: "d-low", mmr: 800 } });

    const result = await resetAllRatings(prisma, HARD);

    expect(result.count).toBe(2);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: high.id } })).mmr).toBe(1000);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: low.id } })).mmr).toBe(1000);
  });

  it("skips tombstones too", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1200 } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mmr: 1400, mergedIntoId: survivor.id },
    });

    await resetAllRatings(prisma, HARD);

    expect((await prisma.member.findUniqueOrThrow({ where: { id: tombstone.id } })).mmr).toBe(1400);
  });
});

describe("resetAllRatings baseline", () => {
  it("records the reset with its kind, member count and the admin who ran it", async () => {
    const admin = await prisma.admin.create({ data: { username: "root", passwordHash: "x" } });
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1200 } });

    await resetAllRatings(prisma, { kind: "HARD", adminId: admin.id });

    const reset = await prisma.ratingReset.findFirstOrThrow();
    expect(reset.kind).toBe("HARD");
    expect(reset.memberCount).toBe(1);
    expect(reset.createdById).toBe(admin.id);
  });

  it("returns the baseline it just wrote", async () => {
    const result = await resetAllRatings(prisma, SOFT);
    const reset = await prisma.ratingReset.findFirstOrThrow();
    expect(result.resetAt).toEqual(reset.resetAt);
  });

  it("stacks — the newest reset is the one that counts", async () => {
    await resetAllRatings(prisma, SOFT);
    const second = await resetAllRatings(prisma, HARD);

    const resets = await prisma.ratingReset.findMany({ orderBy: { resetAt: "desc" } });
    expect(resets).toHaveLength(2);
    expect(resets[0].resetAt).toEqual(second.resetAt);
  });
});
