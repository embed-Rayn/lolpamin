import { describe, expect, it } from "vitest";
import { buildDdragonMap } from "./build-map";

const sources = {
  version: "16.18.1",
  champion: { data: { Trundle: { id: "Trundle", name: "트런들" } } },
  item: { data: { "3047": { name: "판금 장화" } } },
  summoner: {
    data: {
      SummonerFlash: { key: "4", name: "점멸", image: { full: "SummonerFlash.png" } },
      SummonerDot: { key: "14", name: "점화", image: { full: "SummonerDot.png" } },
    },
  },
  runes: [
    {
      id: 8000,
      name: "정밀",
      icon: "perk-images/Styles/7201_Precision.png",
      slots: [
        { runes: [{ id: 8008, name: "치명적 속도", icon: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png" }] },
        { runes: [{ id: 9111, name: "승전보", icon: "perk-images/Styles/Precision/Triumph.png" }] },
      ],
    },
  ],
};

describe("buildDdragonMap", () => {
  it("keys spells by their numeric key, the way the replay stores them", () => {
    expect(buildDdragonMap(sources).spells).toEqual({
      "4": { file: "SummonerFlash.png", name: "점멸" },
      "14": { file: "SummonerDot.png", name: "점화" },
    });
  });

  it("keeps rune styles and keystones only — the board never shows minor runes", () => {
    const { runes } = buildDdragonMap(sources);
    expect(Object.keys(runes).sort()).toEqual(["8000", "8008"]);
    expect(runes["8008"]).toEqual({ icon: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png", name: "치명적 속도" });
  });

  it("maps champion and item ids to their Korean names", () => {
    const map = buildDdragonMap(sources);
    expect(map.version).toBe("16.18.1");
    expect(map.champions).toEqual({ Trundle: "트런들" });
    expect(map.items).toEqual({ "3047": "판금 장화" });
  });
});
