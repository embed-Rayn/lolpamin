import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "@/lib/mutations/save-game-result";
import { cancelGameResult } from "@/lib/mutations/cancel-game-result";
import { getMatchCalendar } from "./match-calendar";

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

let seq = 0;
async function member(realName: string) {
  seq += 1;
  return prisma.member.create({ data: { realName, discordUserId: `d-${seq}`, kakaoNickname: `k-${seq}` } });
}

async function play(blue: { id: string }[], red: { id: string }[], playedAt: string, mode: "RIFT" | "ARAM" = "RIFT") {
  return saveGameResult(prisma, {
    playedAt: new Date(playedAt),
    blueMemberIds: blue.map((m) => m.id),
    redMemberIds: red.map((m) => m.id),
    winner: "BLUE",
    createdById: null,
    mode,
  });
}

const OCT = { year: 2026, month: 10 };
const NOW = new Date("2026-10-21T03:00:00Z");

describe("getMatchCalendar", () => {
  it("counts the month's games per Seoul day and mode, and the members who played", async () => {
    const [a, b, c] = await Promise.all([member("가"), member("나"), member("다")]);
    await play([a], [b], "2026-10-03T15:30:00Z"); // the 4th in Seoul
    await play([a], [c], "2026-10-04T10:00:00Z", "ARAM");
    await play([a], [b], "2026-09-30T10:00:00Z"); // September

    const cal = await getMatchCalendar(prisma, OCT, NOW);

    const day4 = cal.weeks.flat().find((d) => d?.day === 4)!;
    expect(day4).toMatchObject({ rift: 1, aram: 1, total: 2 });
    expect(cal.summary).toEqual({ total: 2, rift: 1, aram: 1, activeDays: 1 });
    expect(cal.memberCount).toBe(3);
  });

  it("leaves cancelled games out", async () => {
    const [a, b] = await Promise.all([member("가"), member("나")]);
    const game = await play([a], [b], "2026-10-04T10:00:00Z");
    await cancelGameResult(prisma, game.gameResultId, null);

    const cal = await getMatchCalendar(prisma, OCT, NOW);

    expect(cal.summary.total).toBe(0);
    expect(cal.memberCount).toBe(0);
  });
});
