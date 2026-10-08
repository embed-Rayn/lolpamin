// `type` keeps the Prisma client from booting — same reason as lane.ts.
import type { Lane } from "@lolpamin/db";
import { PLAYER_STAT_LANES } from "./player-stats";

// One member's games on one champion in one mode and period. Sums, not averages:
// the browser adds several members together, which averages cannot survive.
export interface MemberChampionLine {
  memberId: string;
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  // Games per lane; empty for ARAM.
  lanes: Partial<Record<Lane, number>>;
}

export type ChampionSort = "games" | "kdaDesc" | "kdaAsc";

// Per-game averages; winRate is a 0–1 fraction. kda null means no deaths ("Perfect").
export interface ChampionAverages {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
}

export interface ChampionMemberRow extends ChampionAverages {
  memberId: string;
  mainLane: Lane | null;
}

export interface ChampionRow extends ChampionAverages {
  champion: string;
  members: ChampionMemberRow[];
}

interface Totals {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

interface MemberTotals extends Totals {
  lanes: Partial<Record<Lane, number>>;
}

function averages(t: Totals): ChampionAverages {
  return {
    games: t.games,
    wins: t.wins,
    losses: t.games - t.wins,
    winRate: t.wins / t.games,
    kills: t.kills / t.games,
    deaths: t.deaths / t.games,
    assists: t.assists / t.games,
    kda: t.deaths === 0 ? null : (t.kills + t.assists) / t.deaths,
  };
}

function addTotals(into: Totals, from: Totals): void {
  into.games += from.games;
  into.wins += from.wins;
  into.kills += from.kills;
  into.deaths += from.deaths;
  into.assists += from.assists;
}

// Ties go to the earlier lane in PLAYER_STAT_LANES (탑 → 서폿).
function mainLane(lanes: Partial<Record<Lane, number>>): Lane | null {
  let best: Lane | null = null;
  let bestGames = 0;
  for (const lane of PLAYER_STAT_LANES) {
    const games = lanes[lane] ?? 0;
    if (games > bestGames) {
      best = lane;
      bestGames = games;
    }
  }
  return best;
}

// Ascending KDA with Perfect (null) as the largest value.
function compareKdaAsc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function byGames(a: ChampionAverages, b: ChampionAverages): number {
  return b.games - a.games || b.wins - a.wins;
}

function compareChampions(sort: ChampionSort): (a: ChampionRow, b: ChampionRow) => number {
  const byId = (a: ChampionRow, b: ChampionRow) => a.champion.localeCompare(b.champion);
  if (sort === "kdaDesc") return (a, b) => compareKdaAsc(b.kda, a.kda) || b.games - a.games || byId(a, b);
  if (sort === "kdaAsc") return (a, b) => compareKdaAsc(a.kda, b.kda) || b.games - a.games || byId(a, b);
  return (a, b) => byGames(a, b) || byId(a, b);
}

export function aggregateChampionStats(
  lines: MemberChampionLine[],
  selectedIds: ReadonlySet<string>,
  sort: ChampionSort,
): ChampionRow[] {
  const byChampion = new Map<string, Map<string, MemberTotals>>();
  for (const l of lines) {
    if (!selectedIds.has(l.memberId)) continue;
    const members = byChampion.get(l.champion) ?? new Map<string, MemberTotals>();
    const m = members.get(l.memberId) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, lanes: {} };
    addTotals(m, l);
    for (const lane of PLAYER_STAT_LANES) {
      const games = l.lanes[lane];
      if (games) m.lanes[lane] = (m.lanes[lane] ?? 0) + games;
    }
    members.set(l.memberId, m);
    byChampion.set(l.champion, members);
  }

  const rows: ChampionRow[] = [];
  for (const [champion, members] of byChampion) {
    const total: Totals = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    const memberRows: ChampionMemberRow[] = [];
    for (const [memberId, m] of members) {
      addTotals(total, m);
      memberRows.push({ memberId, mainLane: mainLane(m.lanes), ...averages(m) });
    }
    memberRows.sort((a, b) => byGames(a, b) || a.memberId.localeCompare(b.memberId));
    rows.push({ champion, members: memberRows, ...averages(total) });
  }
  return rows.sort(compareChampions(sort));
}
