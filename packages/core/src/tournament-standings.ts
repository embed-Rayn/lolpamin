export const TOURNAMENT_SLOTS = [1, 2, 3, 4] as const;
export const TOURNAMENT_WIN_POINTS = 3;
export const TOURNAMENT_LOSS_POINTS = -1;

export function defaultTournamentTeamName(slot: number): string {
  return `${slot}팀`;
}

export interface TournamentGame {
  blueTeamSlot: number;
  redTeamSlot: number;
  winner: "BLUE" | "RED";
  blueKills: number;
  redKills: number;
}

export interface TournamentStanding {
  slot: number;
  name: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  points: number;
  killDiff: number;
}

/**
 * Standings for the four tournament teams. Order: points, wins, head-to-head wins
 * inside the (points, wins) group, kill difference, slot (display only). Rank is
 * 1 + the number of teams strictly ahead, so fully tied teams share a rank.
 */
export function aggregateTournamentStandings(
  games: TournamentGame[],
  names: Record<number, string>,
): TournamentStanding[] {
  const rows = new Map<number, TournamentStanding>();
  for (const slot of TOURNAMENT_SLOTS) {
    rows.set(slot, {
      slot,
      name: names[slot] ?? defaultTournamentTeamName(slot),
      rank: 0,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      killDiff: 0,
    });
  }
  // h2h.get(a)?.get(b) = wins of a over b
  const h2h = new Map<number, Map<number, number>>();

  for (const game of games) {
    const blue = rows.get(game.blueTeamSlot);
    const red = rows.get(game.redTeamSlot);
    if (!blue || !red) continue;
    const [win, lose] = game.winner === "BLUE" ? [blue, red] : [red, blue];
    win.wins += 1;
    win.points += TOURNAMENT_WIN_POINTS;
    lose.losses += 1;
    lose.points += TOURNAMENT_LOSS_POINTS;
    blue.played += 1;
    red.played += 1;
    blue.killDiff += game.blueKills - game.redKills;
    red.killDiff += game.redKills - game.blueKills;
    const m = h2h.get(win.slot) ?? new Map<number, number>();
    m.set(lose.slot, (m.get(lose.slot) ?? 0) + 1);
    h2h.set(win.slot, m);
  }

  const all = [...rows.values()];
  const headToHead = new Map<number, number>();
  for (const t of all) {
    let sum = 0;
    for (const o of all) {
      if (o.slot !== t.slot && o.points === t.points && o.wins === t.wins) {
        sum += h2h.get(t.slot)?.get(o.slot) ?? 0;
      }
    }
    headToHead.set(t.slot, sum);
  }

  const key = (t: TournamentStanding) => [t.points, t.wins, headToHead.get(t.slot)!, t.killDiff];
  // Negative when a is ahead of b.
  const compare = (a: TournamentStanding, b: TournamentStanding) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };

  for (const t of all) t.rank = 1 + all.filter((o) => compare(o, t) < 0).length;
  return all.sort((a, b) => compare(a, b) || a.slot - b.slot);
}
