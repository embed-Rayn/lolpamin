import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getChampionStats, parseChampionStatsMode } from "./champion-stats";

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
  memberId?: string; // absent = an outsider: a stat row with no participant
  team?: "BLUE" | "RED";
  position?: string;
  champion?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  withStat?: boolean;
}

// Writes the rows directly: the MMR path is not what these tests are about.
async function game(
  seats: Seat[],
  opts: { winner?: "BLUE" | "RED"; mode?: "RIFT" | "ARAM"; cancelled?: boolean; createdAt?: Date; playedAt?: Date } = {},
) {
  seq += 1;
  const withPuuid = seats.map((s, i) => ({ ...s, puuid: `p-${seq}-${i}` }));
  return prisma.gameResult.create({
    data: {
      playedAt: opts.playedAt ?? new Date("2026-09-01T12:00:00Z"),
      winner: opts.winner ?? "BLUE",
      mode: opts.mode ?? "RIFT",
      createdAt: opts.createdAt,
      cancelledAt: opts.cancelled ? new Date() : null,
      participants: {
        create: withPuuid
          .filter((s) => s.memberId !== undefined)
          .map((s) => ({
            memberId: s.memberId!,
            team: s.team ?? "BLUE",
            mmrBefore: 1000,
            mmrAfter: 1000,
            replayPuuid: s.puuid,
          })),
      },
      replayStats: {
        create: withPuuid
          .filter((s) => s.withStat !== false)
          .map((s) => ({
            puuid: s.puuid,
            gameName: "g",
            tagLine: "t",
            team: s.team ?? "BLUE",
            position: s.position ?? "TOP",
            champion: s.champion ?? "Aatrox",
            level: 18,
            kills: s.kills ?? 1,
            deaths: s.deaths ?? 1,
            assists: s.assists ?? 1,
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

describe("parseChampionStatsMode", () => {
  it("defaults to rift", () => {
    expect(parseChampionStatsMode(undefined)).toBe("RIFT");
    expect(parseChampionStatsMode("aram")).toBe("RIFT");
    expect(parseChampionStatsMode("bogus")).toBe("RIFT");
    expect(parseChampionStatsMode("ARAM")).toBe("ARAM");
  });
});

describe("getChampionStats", () => {
  it("sums each member's games per champion, not averages", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, champion: "Ahri", kills: 4, deaths: 2, assists: 6 }], { winner: "BLUE" });
    await game([{ memberId: m.id, champion: "Ahri", kills: 2, deaths: 0, assists: 1, team: "RED" }], { winner: "BLUE" });

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines).toEqual([
      { memberId: m.id, champion: "Ahri", games: 2, wins: 1, kills: 6, deaths: 2, assists: 7, lanes: { TOP: 2 } },
    ]);
  });

  it("leaves outsiders out and lists only members who played this mode", async () => {
    const rift = await member("협곡");
    const aram = await member("칼바람");
    await member("안함");
    await game([{ memberId: rift.id, champion: "Ahri" }, { champion: "Zed" }]);
    await game([{ memberId: aram.id, champion: "Lux" }], { mode: "ARAM" });

    const riftStats = await getChampionStats(prisma, "all", "RIFT");
    const aramStats = await getChampionStats(prisma, "all", "ARAM");

    expect(riftStats.members).toEqual([{ id: rift.id, name: "협곡", games: 1 }]);
    expect(riftStats.lines.map((l) => l.champion)).toEqual(["Ahri"]);
    expect(aramStats.members).toEqual([{ id: aram.id, name: "칼바람", games: 1 }]);
    expect(aramStats.lines.map((l) => l.champion)).toEqual(["Lux"]);
  });

  it("records no lanes in aram", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, position: "MIDDLE" }], { mode: "ARAM" });

    const { lines } = await getChampionStats(prisma, "all", "ARAM");

    expect(lines[0].lanes).toEqual({});
  });

  it("counts a game with an unknown position without giving it a lane", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, position: "" }]);

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines[0]).toMatchObject({ games: 1, lanes: {} });
  });

  it("folds differently cased champion ids into the Data Dragon id", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, champion: "FiddleSticks" }]);
    await game([{ memberId: m.id, champion: "Fiddlesticks" }]);

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ champion: "Fiddlesticks", games: 2 });
  });

  it("skips cancelled games and participations without a stat row", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }]);
    await game([{ memberId: m.id }], { cancelled: true });
    await game([{ memberId: m.id, withStat: false }]);

    const { lines, members } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines[0].games).toBe(1);
    expect(members[0].games).toBe(1);
  });

  it("never lists a tombstone", async () => {
    const survivor = await member("생존");
    const tomb = await member("묘비", { mergedIntoId: survivor.id });
    await game([{ memberId: tomb.id }]);

    const { lines, members } = await getChampionStats(prisma, "all", "RIFT");

    expect(members).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("applies the same periods as /player-stats", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }], { playedAt: new Date("2025-12-31T14:00:00Z"), createdAt: new Date("2025-12-31T14:00:00Z") }); // 2025-12-31 23:00 KST
    await game([{ memberId: m.id }], { playedAt: new Date("2026-03-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    await prisma.ratingReset.create({ data: { kind: "SOFT", resetAt: new Date("2026-06-01T00:00:00Z"), memberCount: 1 } });
    await game([{ memberId: m.id }], { playedAt: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z") });

    const now = new Date("2026-10-01T03:00:00Z");
    const games = async (period: "year" | "season" | "all") =>
      (await getChampionStats(prisma, period, "RIFT", now)).lines[0].games;

    expect(await games("year")).toBe(2);
    expect(await games("season")).toBe(1);
    expect(await games("all")).toBe(3);
  });
});
