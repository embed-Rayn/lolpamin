import type { PrismaClient } from "@lolpamin/db";
import { aggregatePlayerStats, getDisplayName, type PlayerGameRow, type PlayerStats, seoulYearRange } from "@lolpamin/core";
import type { Prisma } from "@lolpamin/db";
import { getCountedGameFilter, type CountedGameFilter } from "./counted-games";

// year = games played this Seoul calendar year (by playedAt, across resets); season = since
// the latest rating reset (same baseline as /rift); all = every live game.
export type PlayerStatsPeriod = "year" | "season" | "all";

export function parsePlayerStatsPeriod(value: string | undefined): PlayerStatsPeriod {
  // This year is the default: right after a reset the season is empty.
  return value === "all" || value === "season" ? value : "year";
}

export interface PlayerStatsMember {
  id: string;
  name: string;
  stats: PlayerStats;
}

/**
 * Per-member rift stats built from replay rows only. A hand-entered game has no
 * position or KDA, so it is left out and the game count can be lower than /rift's.
 * Absorbed members need no handling: absorbMember moves GameParticipant.memberId
 * onto the survivor.
 */
export async function getPlayerStats(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
  now: Date = new Date(),
): Promise<PlayerStatsMember[]> {
  const gameFilter: CountedGameFilter | Prisma.GameResultWhereInput =
    period === "season"
      ? await getCountedGameFilter(prisma)
      : period === "year"
        ? (({ start, end }) => ({ cancelledAt: null, playedAt: { gte: start, lt: end } }))(seoulYearRange(now))
        : { cancelledAt: null };

  const [members, participations] = await Promise.all([
    prisma.member.findMany({
      where: { mergedIntoId: null },
      select: { id: true, realName: true, discordHandle: true, kakaoNickname: true },
    }),
    prisma.gameParticipant.findMany({
      where: { replayPuuid: { not: null }, gameResult: { mode: "RIFT", ...gameFilter } },
      select: {
        memberId: true,
        team: true,
        replayPuuid: true,
        gameResult: { select: { winner: true, replayStats: true } },
      },
    }),
  ]);

  const rowsByMember = new Map<string, PlayerGameRow[]>();
  for (const p of participations) {
    const stat = p.gameResult.replayStats.find((s) => s.puuid === p.replayPuuid);
    // A replay game always stores all ten players; a missing row is inconsistent data, not a crash.
    if (!stat) continue;
    const rows = rowsByMember.get(p.memberId) ?? [];
    rows.push({
      position: stat.position,
      champion: stat.champion,
      win: p.team === p.gameResult.winner,
      kills: stat.kills,
      deaths: stat.deaths,
      assists: stat.assists,
      damageDealt: stat.damageDealt,
      damageTaken: stat.damageTaken,
      gold: stat.gold,
    });
    rowsByMember.set(p.memberId, rows);
  }

  return members
    .map((m) => ({ id: m.id, name: getDisplayName(m), stats: aggregatePlayerStats(rowsByMember.get(m.id) ?? []) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
