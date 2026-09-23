import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getPlayerStats, parsePlayerStatsPeriod } from "./player-stats";

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
async function member(realName: string, extra: { mergedIntoId?: string } = {}) {
  seq += 1;
  return prisma.member.create({ data: { realName, discordUserId: `d-${seq}`, kakaoNickname: `k-${seq}`, ...extra } });
}

interface Seat {
  memberId: string;
  team?: "BLUE" | "RED";
  puuid?: string | null;
  position?: string;
  champion?: string;
  kills?: number;
  withStat?: boolean;
}

// Writes the rows directly: the MMR path is not what these tests are about.
async function game(
  seats: Seat[],
  opts: { winner?: "BLUE" | "RED"; mode?: "RIFT" | "ARAM"; cancelled?: boolean; createdAt?: Date } = {},
) {
  seq += 1;
  const withPuuid = seats.map((s) => ({ ...s, puuid: s.puuid === undefined ? `p-${seq}-${s.memberId}` : s.puuid }));
  return prisma.gameResult.create({
    data: {
      playedAt: new Date("2026-09-01T12:00:00Z"),
      winner: opts.winner ?? "BLUE",
      mode: opts.mode ?? "RIFT",
      createdAt: opts.createdAt,
      cancelledAt: opts.cancelled ? new Date() : null,
      participants: {
        create: withPuuid.map((s) => ({
          memberId: s.memberId,
          team: s.team ?? "BLUE",
          mmrBefore: 1000,
          mmrAfter: 1000,
          replayPuuid: s.puuid,
        })),
      },
      replayStats: {
        create: withPuuid
          .filter((s) => s.puuid !== null && s.withStat !== false)
          .map((s) => ({
            puuid: s.puuid!,
            gameName: "g",
            tagLine: "t",
            team: s.team ?? "BLUE",
            position: s.position ?? "TOP",
            champion: s.champion ?? "Aatrox",
            level: 18,
            kills: s.kills ?? 1,
            deaths: 1,
            assists: 1,
            cs: 0,
            spell1: 4,
            spell2: 14,
            keystone: 0,
            subStyle: 0,
            items: [],
            damageDealt: 1000,
            damageTaken: 500,
            controlWards: 0,
            wardsPlaced: 0,
            wardsKilled: 0,
            gold: 9000,
            baronKills: 0,
            dragonKills: 0,
            heraldKills: 0,
            hordeKills: 0,
            atakhanKills: 0,
            turretKills: 0,
            inhibitorKills: 0,
          })),
      },
    },
  });
}

describe("parsePlayerStatsPeriod", () => {
  it("defaults to season", () => {
    expect(parsePlayerStatsPeriod(undefined)).toBe("season");
    expect(parsePlayerStatsPeriod("bogus")).toBe("season");
    expect(parsePlayerStatsPeriod("all")).toBe("all");
  });
});

describe("getPlayerStats", () => {
  it("lists every active member by name, including those with no games", async () => {
    const b = await member("나나");
    const a = await member("가가");
    const survivor = await member("다다");
    await member("다다묘비", { mergedIntoId: survivor.id });
    await game([{ memberId: b.id }]);

    const rows = await getPlayerStats(prisma, "season");

    expect(rows.map((r) => r.name)).toEqual(["가가", "나나", "다다"]);
    expect(rows.find((r) => r.id === a.id)!.stats.total).toBeNull();
    expect(rows.find((r) => r.id === b.id)!.stats.total?.games).toBe(1);
  });

  it("decides the win from the participant's team", async () => {
    const blue = await member("블루");
    const red = await member("레드");
    await game([{ memberId: blue.id, team: "BLUE" }, { memberId: red.id, team: "RED" }], { winner: "RED" });

    const rows = await getPlayerStats(prisma, "all");

    expect(rows.find((r) => r.id === blue.id)!.stats.total?.wins).toBe(0);
    expect(rows.find((r) => r.id === red.id)!.stats.total?.wins).toBe(1);
  });

  it("skips aram, cancelled, hand-entered and stat-less participations", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }]);
    await game([{ memberId: m.id }], { mode: "ARAM" });
    await game([{ memberId: m.id }], { cancelled: true });
    await game([{ memberId: m.id, puuid: null }]);
    await game([{ memberId: m.id, withStat: false }]);

    const [row] = await getPlayerStats(prisma, "all");

    expect(row.stats.total?.games).toBe(1);
  });

  it("uses the stat row matching the participant's puuid", async () => {
    const m = await member("가가");
    const other = await member("나나");
    await game([
      { memberId: m.id, kills: 7, position: "MIDDLE" },
      { memberId: other.id, kills: 2, position: "TOP" },
    ]);

    const rows = await getPlayerStats(prisma, "all");
    const mine = rows.find((r) => r.id === m.id)!.stats;

    expect(mine.lanes.MID?.kills).toBe(7);
    expect(mine.lanes.TOP).toBeNull();
  });

  it("counts only games entered after the latest reset for season, all of them for all", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }], { createdAt: new Date("2026-06-01T00:00:00Z") });
    await prisma.ratingReset.create({
      data: { kind: "SOFT", resetAt: new Date("2026-07-01T00:00:00Z"), memberCount: 1 },
    });
    await game([{ memberId: m.id }], { createdAt: new Date("2026-08-01T00:00:00Z") });

    expect((await getPlayerStats(prisma, "season"))[0].stats.total?.games).toBe(1);
    expect((await getPlayerStats(prisma, "all"))[0].stats.total?.games).toBe(2);
  });
});
