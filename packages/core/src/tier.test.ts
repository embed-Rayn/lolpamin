import type { MemberTier } from "@lolpamin/db";
import { describe, expect, it } from "vitest";
import { TIER_OPTIONS, TIER_SCORES, tierLabel, tierScore } from "./tier";

// 다1(24)부터 브4(1)까지 24칸이 1점 간격이어야 한다. 표를 옮겨 적다 한 칸을 빠뜨리거나
// 두 칸에 같은 점수를 주면 여기서 잡힌다.
const LADDER: MemberTier[] = [
  "DIAMOND_1", "DIAMOND_2", "DIAMOND_3", "DIAMOND_4",
  "EMERALD_1", "EMERALD_2", "EMERALD_3", "EMERALD_4",
  "PLATINUM_1", "PLATINUM_2", "PLATINUM_3", "PLATINUM_4",
  "GOLD_1", "GOLD_2", "GOLD_3", "GOLD_4",
  "SILVER_1", "SILVER_2", "SILVER_3", "SILVER_4",
  "BRONZE_1", "BRONZE_2", "BRONZE_3", "BRONZE_4",
];

describe("tierScore", () => {
  it("runs from diamond 1 down to bronze 4 one point at a time", () => {
    expect(LADDER.map(tierScore)).toEqual([
      24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13,
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it("stacks the master LP bands above diamond 1", () => {
    expect(tierScore("MASTER_0_200")).toBe(25);
    expect(tierScore("MASTER_200_400")).toBe(26);
    expect(tierScore("MASTER_400_600")).toBe(27);
    expect(tierScore("MASTER_600_800")).toBe(28);
    expect(tierScore("MASTER_800_1000")).toBe(29);
    expect(tierScore("MASTER_1000_PLUS")).toBe(30);
  });

  it("scores iron and unranked at zero", () => {
    expect(tierScore("IRON")).toBe(0);
    expect(tierScore("UNRANKED")).toBe(0);
  });
});

describe("tierLabel", () => {
  it("names the divisions the way the group writes them", () => {
    expect(tierLabel("DIAMOND_1")).toBe("다1");
    expect(tierLabel("EMERALD_2")).toBe("에2");
    expect(tierLabel("GOLD_4")).toBe("골4");
    expect(tierLabel("MASTER_400_600")).toBe("마스터 400~600");
    expect(tierLabel("MASTER_1000_PLUS")).toBe("마스터 1000+");
    expect(tierLabel("UNRANKED")).toBe("언랭");
  });
});

describe("TIER_OPTIONS", () => {
  it("carries every tier exactly once", () => {
    expect(TIER_OPTIONS).toHaveLength(32);
    expect([...TIER_OPTIONS.map((o) => o.value)].sort()).toEqual(
      (Object.keys(TIER_SCORES) as MemberTier[]).sort(),
    );
  });

  it("runs from the highest score to the lowest", () => {
    const scores = TIER_OPTIONS.map((o) => o.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(30);
    expect(scores[scores.length - 1]).toBe(0);
  });

  it("labels every tier", () => {
    for (const option of TIER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.score).toBe(tierScore(option.value));
    }
  });
});
