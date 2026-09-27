import type { ReplayPlayerStats } from "./parse-rofl";

export interface TeamSummary {
  kills: number;
  gold: number;
  baron: number;
  dragon: number;
  herald: number;
  horde: number;
  atakhan: number;
  turret: number;
  inhibitor: number;
}

function emptySummary(): TeamSummary {
  return { kills: 0, gold: 0, baron: 0, dragon: 0, herald: 0, horde: 0, atakhan: 0, turret: 0, inhibitor: 0 };
}

/**
 * Team totals for the board's middle strip. The replay has no team-level objective
 * record — each player carries the objectives they last-hit — so the team's count is
 * the sum over its players.
 */
export function summarizeReplayTeams(players: ReplayPlayerStats[]): Record<"BLUE" | "RED", TeamSummary> {
  const summary = { BLUE: emptySummary(), RED: emptySummary() };
  for (const p of players) {
    const t = summary[p.team];
    t.kills += p.kills;
    t.gold += p.gold;
    t.baron += p.baronKills;
    t.dragon += p.dragonKills;
    t.herald += p.heraldKills;
    t.horde += p.hordeKills;
    t.atakhan += p.atakhanKills;
    t.turret += p.turretKills;
    t.inhibitor += p.inhibitorKills;
  }
  return summary;
}

/** Share of the team's kills this player took part in, as a whole percentage. */
export function killParticipation(kills: number, assists: number, teamKills: number): number {
  if (teamKills === 0) return 0;
  return Math.round(((kills + assists) / teamKills) * 100);
}

/** "(K+A)/D" to two decimals, or "Perfect" for a deathless game. */
export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** Sorts a team top → support. ARAM and odd games have no lane, so those fall back to name order. */
export function compareLane(
  a: { position: string; gameName: string },
  b: { position: string; gameName: string },
): number {
  const rank = (position: string) => {
    const i = LANE_ORDER.indexOf(position);
    return i === -1 ? LANE_ORDER.length : i;
  };
  return rank(a.position) - rank(b.position) || a.gameName.localeCompare(b.gameName);
}
