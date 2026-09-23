// `type` keeps the Prisma client from booting — same reason as lane.ts.
import type { Lane } from "@lolpamin/db";

// One member's participation in one replay-backed rift game.
export interface PlayerGameRow {
  position: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  gold: number;
}

// Per-game averages; winRate is a 0–1 fraction. kda null means no deaths ("Perfect").
export interface StatLine {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  damageDealt: number;
  damageTaken: number;
  gold: number;
}

export interface ChampionLine {
  champion: string;
  games: number;
  wins: number;
  winRate: number;
}

export type StatColumn = "winRate" | "kda" | "damageDealt" | "damageTaken" | "gold";

export interface PlayerStats {
  total: StatLine | null;
  lanes: Record<Lane, StatLine | null>;
  champions: ChampionLine[];
  // Lanes holding the column's highest value; empty unless 2+ lanes were played.
  best: Record<StatColumn, Lane[]>;
}

export const PLAYER_STAT_LANES: readonly Lane[] = ["TOP", "JUG", "MID", "AD", "SUP"];

const TOP_CHAMPIONS = 5;
const STAT_COLUMNS: readonly StatColumn[] = ["winRate", "kda", "damageDealt", "damageTaken", "gold"];

const POSITION_TO_LANE: Record<string, Lane> = {
  TOP: "TOP",
  JUNGLE: "JUG",
  MIDDLE: "MID",
  BOTTOM: "AD",
  UTILITY: "SUP",
};

export function replayPositionToLane(position: string): Lane | null {
  return Object.hasOwn(POSITION_TO_LANE, position) ? POSITION_TO_LANE[position] : null;
}

function statLine(rows: PlayerGameRow[]): StatLine | null {
  if (rows.length === 0) return null;
  const games = rows.length;
  const sum = (pick: (r: PlayerGameRow) => number) => rows.reduce((acc, r) => acc + pick(r), 0);
  const wins = rows.filter((r) => r.win).length;
  const kills = sum((r) => r.kills);
  const deaths = sum((r) => r.deaths);
  const assists = sum((r) => r.assists);
  return {
    games,
    wins,
    losses: games - wins,
    winRate: wins / games,
    kills: kills / games,
    deaths: deaths / games,
    assists: assists / games,
    kda: deaths === 0 ? null : (kills + assists) / deaths,
    damageDealt: sum((r) => r.damageDealt) / games,
    damageTaken: sum((r) => r.damageTaken) / games,
    gold: sum((r) => r.gold) / games,
  };
}

function columnValue(line: StatLine, column: StatColumn): number {
  if (column === "kda") return line.kda ?? Number.POSITIVE_INFINITY;
  return line[column];
}

export function aggregatePlayerStats(rows: PlayerGameRow[]): PlayerStats {
  const lanes = {} as Record<Lane, StatLine | null>;
  for (const lane of PLAYER_STAT_LANES) {
    lanes[lane] = statLine(rows.filter((r) => replayPositionToLane(r.position) === lane));
  }

  const byChampion = new Map<string, { games: number; wins: number }>();
  for (const r of rows) {
    const c = byChampion.get(r.champion) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (r.win) c.wins += 1;
    byChampion.set(r.champion, c);
  }
  const champions = [...byChampion.entries()]
    .map(([champion, c]) => ({ champion, games: c.games, wins: c.wins, winRate: c.wins / c.games }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.champion.localeCompare(b.champion))
    .slice(0, TOP_CHAMPIONS);

  const played = PLAYER_STAT_LANES.filter((lane) => lanes[lane] !== null);
  const best = {} as Record<StatColumn, Lane[]>;
  for (const column of STAT_COLUMNS) {
    if (played.length < 2) {
      best[column] = [];
      continue;
    }
    const max = Math.max(...played.map((lane) => columnValue(lanes[lane]!, column)));
    best[column] = played.filter((lane) => columnValue(lanes[lane]!, column) === max);
  }

  return { total: statLine(rows), lanes, champions, best };
}
