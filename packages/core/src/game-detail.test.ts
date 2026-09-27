import { describe, expect, it } from "vitest";
import { compareLane, kdaRatio, killParticipation, summarizeReplayTeams } from "./game-detail";
import type { ReplayPlayerStats } from "./parse-rofl";

function stats(overrides: Partial<ReplayPlayerStats>): ReplayPlayerStats {
  return {
    puuid: "p",
    gameName: "g",
    tagLine: "KR1",
    team: "BLUE",
    position: "TOP",
    champion: "Yone",
    level: 15,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    spell1: 4,
    spell2: 14,
    keystone: 8010,
    subStyle: 8300,
    items: [0, 0, 0, 0, 0, 0, 0],
    damageDealt: 0,
    damageTaken: 0,
    controlWards: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    gold: 0,
    baronKills: 0,
    dragonKills: 0,
    heraldKills: 0,
    hordeKills: 0,
    atakhanKills: 0,
    turretKills: 0,
    inhibitorKills: 0,
    ...overrides,
  };
}

describe("summarizeReplayTeams", () => {
  it("adds each player's kills, gold and objectives into their own team", () => {
    const summary = summarizeReplayTeams([
      stats({ team: "BLUE", kills: 3, gold: 1000, turretKills: 1, dragonKills: 1 }),
      stats({ team: "BLUE", kills: 2, gold: 500, turretKills: 2 }),
      stats({ team: "RED", kills: 7, gold: 3000, baronKills: 1, hordeKills: 3, inhibitorKills: 1, heraldKills: 1, atakhanKills: 1 }),
    ]);

    expect(summary.BLUE).toEqual({
      kills: 5, gold: 1500, baron: 0, dragon: 1, herald: 0, horde: 0, atakhan: 0, turret: 3, inhibitor: 0,
    });
    expect(summary.RED).toEqual({
      kills: 7, gold: 3000, baron: 1, dragon: 0, herald: 1, horde: 3, atakhan: 1, turret: 0, inhibitor: 1,
    });
  });

  it("gives an all-zero summary to a team with no players", () => {
    expect(summarizeReplayTeams([stats({ team: "BLUE", kills: 1 })]).RED.kills).toBe(0);
  });
});

describe("killParticipation", () => {
  it("is (kills + assists) / team kills as a rounded percentage", () => {
    expect(killParticipation(3, 1, 16)).toBe(25);
    expect(killParticipation(15, 4, 35)).toBe(54);
  });

  it("is 0 when the team scored no kills rather than NaN", () => {
    expect(killParticipation(0, 0, 0)).toBe(0);
  });
});

describe("kdaRatio", () => {
  it("is (kills + assists) / deaths to two decimals", () => {
    expect(kdaRatio(3, 5, 1)).toBe("0.80");
    expect(kdaRatio(15, 2, 4)).toBe("9.50");
  });

  it("is Perfect with no deaths", () => {
    expect(kdaRatio(4, 0, 7)).toBe("Perfect");
    expect(kdaRatio(0, 0, 0)).toBe("Perfect");
  });
});

describe("compareLane", () => {
  it("orders top, jungle, mid, bottom, support and puts unknown lanes last by name", () => {
    const players = [
      { position: "UTILITY", gameName: "e" },
      { position: "", gameName: "b" },
      { position: "TOP", gameName: "d" },
      { position: "", gameName: "a" },
      { position: "MIDDLE", gameName: "c" },
    ];

    expect([...players].sort(compareLane).map((p) => p.gameName)).toEqual(["d", "c", "e", "a", "b"]);
  });
});
