import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName, replayPositionToLane, type MemberChampionLine } from "@lolpamin/core";
import { canonicalChampionId } from "@/lib/ddragon/assets";
import { playerStatsGameFilter, type PlayerStatsPeriod } from "./player-stats";

export type ChampionStatsMode = "RIFT" | "ARAM";

export function parseChampionStatsMode(value: string | undefined): ChampionStatsMode {
  return value === "ARAM" ? "ARAM" : "RIFT";
}

export interface ChampionStatsMember {
  id: string;
  name: string;
  // Replay games in this mode and period — shown on the picker chip.
  games: number;
}

export interface ChampionStatsData {
  members: ChampionStatsMember[];
  lines: MemberChampionLine[];
}

/**
 * Per-(member, champion) sums over replay-backed games of one mode and period. Starting
 * from GameParticipant leaves outsiders out (they have no participant row); absorbed
 * members need no handling because absorbMember moves participant rows onto the survivor.
 * The browser folds the selected members' lines with aggregateChampionStats.
 */
export async function getChampionStats(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
  mode: ChampionStatsMode,
  now: Date = new Date(),
): Promise<ChampionStatsData> {
  const gameFilter = await playerStatsGameFilter(prisma, period, now);
  const participations = await prisma.gameParticipant.findMany({
    where: { replayPuuid: { not: null }, gameResult: { mode, ...gameFilter } },
    select: {
      memberId: true,
      team: true,
      replayPuuid: true,
      member: { select: { realName: true, discordHandle: true, kakaoNickname: true, mergedIntoId: true } },
      gameResult: {
        select: {
          winner: true,
          replayStats: { select: { puuid: true, position: true, champion: true, kills: true, deaths: true, assists: true } },
        },
      },
    },
  });

  const lines = new Map<string, MemberChampionLine>();
  const members = new Map<string, ChampionStatsMember>();
  for (const p of participations) {
    if (p.member.mergedIntoId !== null) continue;
    const stat = p.gameResult.replayStats.find((s) => s.puuid === p.replayPuuid);
    // A replay game always stores all ten players; a missing row is inconsistent data, not a crash.
    if (!stat) continue;

    // Riot does not always case the id like Data Dragon ("FiddleSticks").
    const champion = canonicalChampionId(stat.champion);
    const key = `${p.memberId}\u0000${champion}`;
    const line = lines.get(key) ?? {
      memberId: p.memberId,
      champion,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      lanes: {},
    };
    line.games += 1;
    if (p.team === p.gameResult.winner) line.wins += 1;
    line.kills += stat.kills;
    line.deaths += stat.deaths;
    line.assists += stat.assists;
    // ARAM replays carry a position string too; it means nothing there.
    const lane = mode === "RIFT" ? replayPositionToLane(stat.position) : null;
    if (lane) line.lanes[lane] = (line.lanes[lane] ?? 0) + 1;
    lines.set(key, line);

    const m = members.get(p.memberId) ?? { id: p.memberId, name: getDisplayName(p.member), games: 0 };
    m.games += 1;
    members.set(p.memberId, m);
  }

  return {
    members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    lines: [...lines.values()],
  };
}
