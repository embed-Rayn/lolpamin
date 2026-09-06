import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getGameCount } from "./get-game-count";

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

async function playedIn(memberId: string, cancelled: boolean) {
  const game = await prisma.gameResult.create({
    data: {
      playedAt: new Date("2026-09-01T12:00:00Z"),
      winner: "BLUE",
      cancelledAt: cancelled ? new Date() : null,
    },
  });
  await prisma.gameParticipant.create({
    data: { gameResultId: game.id, memberId, team: "BLUE", mmrBefore: 1000, mmrAfter: 1017 },
  });
}

describe("getGameCount", () => {
  it("returns 0 for a member who has never played", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });

    expect(await getGameCount(prisma, member.id)).toBe(0);
  });

  it("counts each live game the member played in", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    await playedIn(member.id, false);
    await playedIn(member.id, false);

    expect(await getGameCount(prisma, member.id)).toBe(2);
  });

  // 되돌린 경기는 없던 일이다. 대시보드의 「내전 N회」와 같은 규칙이어야 두 화면이
  // 같은 숫자를 말한다.
  it("leaves a cancelled game out of the count", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    await playedIn(member.id, false);
    await playedIn(member.id, true);

    expect(await getGameCount(prisma, member.id)).toBe(1);
  });

  it("does not count another member's games", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const other = await prisma.member.create({ data: { discordUserId: "d-2" } });
    await playedIn(other.id, false);

    expect(await getGameCount(prisma, member.id)).toBe(0);
  });

  // 대시보드의 전적 집계와 같은 기준선을 봐야 두 화면이 같은 숫자를 말한다.
  it("leaves a game entered before the last reset out of the count", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    await playedIn(member.id, false);

    await prisma.ratingReset.create({ data: { kind: "SOFT", memberCount: 1 } });

    expect(await getGameCount(prisma, member.id)).toBe(0);
  });

  it("counts a game entered after the last reset", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    await playedIn(member.id, false);

    await prisma.ratingReset.create({ data: { kind: "HARD", memberCount: 1 } });
    await playedIn(member.id, false);

    expect(await getGameCount(prisma, member.id)).toBe(1);
  });

  it("reads the newest reset when there is more than one", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1" } });
    await prisma.ratingReset.create({
      data: { kind: "SOFT", memberCount: 1, resetAt: new Date("2026-01-01T00:00:00Z") },
    });
    await playedIn(member.id, false);
    await prisma.ratingReset.create({ data: { kind: "HARD", memberCount: 1 } });

    expect(await getGameCount(prisma, member.id)).toBe(0);
  });
});
