import { describe, expect, it } from "vitest";
import { aggregatePlayerStats, replayPositionToLane, type PlayerGameRow } from "./player-stats";

function row(over: Partial<PlayerGameRow> = {}): PlayerGameRow {
  return {
    position: "TOP",
    champion: "Aatrox",
    win: true,
    kills: 0,
    deaths: 1,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    gold: 0,
    ...over,
  };
}

describe("replayPositionToLane", () => {
  it("maps the five replay positions onto lanes", () => {
    expect(replayPositionToLane("TOP")).toBe("TOP");
    expect(replayPositionToLane("JUNGLE")).toBe("JUG");
    expect(replayPositionToLane("MIDDLE")).toBe("MID");
    expect(replayPositionToLane("BOTTOM")).toBe("AD");
    expect(replayPositionToLane("UTILITY")).toBe("SUP");
  });

  it("returns null for an empty or unknown position", () => {
    expect(replayPositionToLane("")).toBeNull();
    expect(replayPositionToLane("NONE")).toBeNull();
  });
});

describe("aggregatePlayerStats", () => {
  it("returns empty stats for no games", () => {
    const s = aggregatePlayerStats([]);
    expect(s.total).toBeNull();
    expect(s.lanes).toEqual({ TOP: null, JUG: null, MID: null, AD: null, SUP: null });
    expect(s.champions).toEqual([]);
    expect(s.best).toEqual({ winRate: [], kda: [], damageDealt: [], damageTaken: [], gold: [] });
  });

  it("averages per game and computes kda from sums", () => {
    const s = aggregatePlayerStats([
      row({ win: true, kills: 10, deaths: 4, assists: 6, damageDealt: 30000, damageTaken: 20000, gold: 14000 }),
      row({ win: false, kills: 4, deaths: 7, assists: 8, damageDealt: 20000, damageTaken: 10000, gold: 10000 }),
    ]);
    expect(s.lanes.TOP).toEqual({
      games: 2,
      wins: 1,
      losses: 1,
      winRate: 0.5,
      kills: 7,
      deaths: 5.5,
      assists: 7,
      kda: 28 / 11,
      damageDealt: 25000,
      damageTaken: 15000,
      gold: 12000,
    });
    expect(s.total).toEqual(s.lanes.TOP);
  });

  it("reports kda as null (perfect) when there are no deaths", () => {
    const s = aggregatePlayerStats([row({ kills: 3, deaths: 0, assists: 2 })]);
    expect(s.lanes.TOP?.kda).toBeNull();
  });

  it("counts an unknown position in the total and champions but no lane", () => {
    const s = aggregatePlayerStats([row({ position: "TOP" }), row({ position: "" })]);
    expect(s.lanes.TOP?.games).toBe(1);
    expect(s.total?.games).toBe(2);
    expect(s.champions).toEqual([{ champion: "Aatrox", games: 2, wins: 2, winRate: 1 }]);
  });

  it("ranks champions by games, then wins, then id, and keeps five", () => {
    const s = aggregatePlayerStats([
      row({ champion: "Ahri", win: false }),
      row({ champion: "Ahri", win: false }),
      row({ champion: "Zed", win: true }),
      row({ champion: "Zed", win: false }),
      row({ champion: "Lux" }),
      row({ champion: "Annie" }),
      row({ champion: "Brand" }),
      row({ champion: "Sona" }),
    ]);
    expect(s.champions.map((c) => c.champion)).toEqual(["Zed", "Ahri", "Annie", "Brand", "Lux"]);
    expect(s.champions[1]).toEqual({ champion: "Ahri", games: 2, wins: 0, winRate: 0 });
  });

  it("marks no best values when only one lane was played", () => {
    const s = aggregatePlayerStats([row(), row()]);
    expect(s.best).toEqual({ winRate: [], kda: [], damageDealt: [], damageTaken: [], gold: [] });
  });

  it("marks the best lane per column, keeping ties and treating perfect kda as highest", () => {
    const s = aggregatePlayerStats([
      row({ position: "TOP", win: true, kills: 5, deaths: 1, damageDealt: 100, damageTaken: 50, gold: 10 }),
      row({ position: "MIDDLE", win: true, kills: 1, deaths: 0, damageDealt: 200, damageTaken: 50, gold: 5 }),
      row({ position: "UTILITY", win: false, kills: 0, deaths: 3, damageDealt: 10, damageTaken: 90, gold: 1 }),
    ]);
    expect(s.best).toEqual({
      winRate: ["TOP", "MID"],
      kda: ["MID"],
      damageDealt: ["MID"],
      damageTaken: ["SUP"],
      gold: ["TOP"],
    });
  });
});
