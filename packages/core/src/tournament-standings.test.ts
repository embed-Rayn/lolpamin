import { describe, expect, it } from "vitest";
import {
  aggregateTournamentStandings,
  defaultTournamentTeamName,
  type TournamentGame,
} from "./tournament-standings";

const g = (
  blueTeamSlot: number,
  redTeamSlot: number,
  winner: "BLUE" | "RED",
  blueKills: number,
  redKills: number,
): TournamentGame => ({ blueTeamSlot, redTeamSlot, winner, blueKills, redKills });

describe("aggregateTournamentStandings", () => {
  it("returns four zero rows sharing rank 1 when there are no games", () => {
    const rows = aggregateTournamentStandings([], {});
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1, 1]);
    for (const r of rows) {
      expect([r.played, r.wins, r.losses, r.points, r.killDiff]).toEqual([0, 0, 0, 0, 0]);
    }
    expect(rows[0].name).toBe(defaultTournamentTeamName(1));
  });

  it("scores one game", () => {
    const rows = aggregateTournamentStandings([g(1, 3, "BLUE", 20, 12)], {});
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 4, 3]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(rows[0]).toMatchObject({ wins: 1, losses: 0, points: 3, killDiff: 8 });
    expect(rows[3]).toMatchObject({ wins: 0, losses: 1, points: -1, killDiff: -8 });
  });

  it("sums kill difference across sides", () => {
    const rows = aggregateTournamentStandings(
      [g(1, 3, "BLUE", 20, 12), g(2, 1, "BLUE", 9, 5)],
      {},
    );
    expect(rows.find((r) => r.slot === 1)!.killDiff).toBe(4);
  });

  it("breaks a two-team tie by head-to-head before kill difference", () => {
    const rows = aggregateTournamentStandings(
      [g(1, 2, "RED", 10, 11), g(1, 3, "BLUE", 40, 0), g(2, 4, "RED", 5, 6), g(3, 4, "RED", 1, 2)],
      {},
    );
    // 1 and 2 are both 1W1L - 2 beat 1 though 1 has the larger killDiff
    const one = rows.find((r) => r.slot === 1)!;
    const two = rows.find((r) => r.slot === 2)!;
    expect(one.points).toBe(two.points);
    expect(one.wins).toBe(two.wins);
    expect(one.killDiff).toBeGreaterThan(two.killDiff);
    expect(rows.map((r) => r.slot).indexOf(2)).toBeLessThan(rows.map((r) => r.slot).indexOf(1));
    expect(two.rank).toBeLessThan(one.rank);
  });

  it("breaks a three-way tie by kill difference, equal shares rank", () => {
    const even = aggregateTournamentStandings(
      [g(1, 2, "BLUE", 10, 5), g(2, 3, "BLUE", 10, 5), g(3, 1, "BLUE", 10, 5)],
      {},
    );
    expect(even.map((r) => r.slot)).toEqual([1, 2, 3, 4]);
    expect(even.map((r) => r.rank)).toEqual([1, 1, 1, 4]);

    const uneven = aggregateTournamentStandings(
      [g(1, 2, "BLUE", 20, 5), g(2, 3, "BLUE", 10, 5), g(3, 1, "BLUE", 10, 5)],
      {},
    );
    // killDiff: 1 = 15-5 = 10, 2 = -15+5 = -10, 3 = -5+5 = 0
    expect(uneven.map((r) => r.slot)).toEqual([1, 3, 2, 4]);
    expect(uneven.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("applies team name overrides", () => {
    const rows = aggregateTournamentStandings([], { 2: "불꽃" });
    expect(rows.map((r) => r.name)).toEqual(["1팀", "불꽃", "3팀", "4팀"]);
  });
});
