import { describe, expect, it } from "vitest";
import { aggregateChampionStats, type MemberChampionLine } from "./champion-stats";

function line(over: Partial<MemberChampionLine> = {}): MemberChampionLine {
  return {
    memberId: "a",
    champion: "Ahri",
    games: 1,
    wins: 1,
    kills: 1,
    deaths: 1,
    assists: 1,
    lanes: {},
    ...over,
  };
}

const all = (...ids: string[]) => new Set(ids);

describe("aggregateChampionStats", () => {
  it("sums selected members into one row per champion with per-game averages", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "a", games: 2, wins: 1, kills: 10, deaths: 4, assists: 6 }),
        line({ memberId: "b", games: 2, wins: 2, kills: 2, deaths: 0, assists: 2 }),
      ],
      all("a", "b"),
      "games",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      champion: "Ahri",
      games: 4,
      wins: 3,
      losses: 1,
      winRate: 0.75,
      kills: 3,
      deaths: 1,
      assists: 2,
      kda: 5, // (12 + 8) / 4
    });
    expect(rows[0].members.map((m) => m.memberId)).toEqual(["b", "a"]); // b: 2 games 2 wins beats a: 2 games 1 win
  });

  it("leaves out unselected members and champions only they played", () => {
    const rows = aggregateChampionStats(
      [line({ memberId: "a", champion: "Ahri" }), line({ memberId: "b", champion: "Zed" })],
      all("a"),
      "games",
    );

    expect(rows.map((r) => r.champion)).toEqual(["Ahri"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(aggregateChampionStats([line()], all(), "games")).toEqual([]);
  });

  it("sorts by games, then wins, then champion id", () => {
    const rows = aggregateChampionStats(
      [
        line({ champion: "Zed", games: 3, wins: 1 }),
        line({ champion: "Ahri", games: 3, wins: 2 }),
        line({ champion: "Lux", games: 5, wins: 0 }),
        line({ champion: "Annie", games: 3, wins: 2 }),
      ],
      all("a"),
      "games",
    );

    expect(rows.map((r) => r.champion)).toEqual(["Lux", "Ahri", "Annie", "Zed"]);
  });

  it("puts Perfect first for high KDA and last for low KDA, ties by games", () => {
    const lines = [
      line({ champion: "Low", kills: 1, deaths: 2, assists: 1 }), // 1
      line({ champion: "Perfect", kills: 3, deaths: 0, assists: 0 }), // null
      line({ champion: "HighFew", kills: 2, deaths: 1, assists: 2 }), // 4, 1 game
      line({ champion: "HighMany", games: 3, kills: 2, deaths: 1, assists: 2 }), // 4, 3 games
    ];

    expect(aggregateChampionStats(lines, all("a"), "kdaDesc").map((r) => r.champion)).toEqual([
      "Perfect",
      "HighMany",
      "HighFew",
      "Low",
    ]);
    expect(aggregateChampionStats(lines, all("a"), "kdaAsc").map((r) => r.champion)).toEqual([
      "Low",
      "HighMany",
      "HighFew",
      "Perfect",
    ]);
  });

  it("keeps member rows in games order whatever the champion sort", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "few", games: 1, kills: 9, deaths: 1 }),
        line({ memberId: "many", games: 4, kills: 0, deaths: 4 }),
      ],
      all("few", "many"),
      "kdaDesc",
    );

    expect(rows[0].members.map((m) => m.memberId)).toEqual(["many", "few"]);
  });

  it("picks the most played lane as main lane, ties by lane order, null without lanes", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "a", lanes: { MID: 2, TOP: 1 } }),
        line({ memberId: "b", lanes: { SUP: 1, JUG: 1 } }),
        line({ memberId: "c", lanes: {} }),
      ],
      all("a", "b", "c"),
      "games",
    );
    const lane = (id: string) => rows[0].members.find((m) => m.memberId === id)!.mainLane;

    expect(lane("a")).toBe("MID");
    expect(lane("b")).toBe("JUG");
    expect(lane("c")).toBeNull();
  });

  it("merges duplicate (member, champion) lines instead of listing the member twice", () => {
    const rows = aggregateChampionStats(
      [line({ memberId: "a", games: 1, lanes: { TOP: 1 } }), line({ memberId: "a", games: 2, lanes: { MID: 2 } })],
      all("a"),
      "games",
    );

    expect(rows[0].members).toHaveLength(1);
    expect(rows[0].members[0]).toMatchObject({ games: 3, mainLane: "MID" });
  });
});
