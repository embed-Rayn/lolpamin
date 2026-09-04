import { describe, expect, it } from "vitest";
import {
  applySoftReset,
  calculateTeamMmrChange,
  DEFAULT_MMR_CONFIG,
  LOSS_POINT,
  MMR_K,
  SOFT_RESET_BASE,
  SOFT_RESET_RATIO,
  validateMmrConfig,
  WIN_POINT,
} from "./mmr";

describe("calculateTeamMmrChange", () => {
  it("has a K-factor of 40", () => {
    expect(MMR_K).toBe(40);
  });

  it("awards three points for a win and one for a loss", () => {
    expect(WIN_POINT).toBe(3);
    expect(LOSS_POINT).toBe(1);
  });

  it("splits the K-factor evenly when both teams have equal average rating", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500, 1500],
      redRatings: [1500, 1500],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.5, 5);
    expect(result.blueDelta).toBe(23);
    expect(result.redDelta).toBe(-19);
  });

  it("adds the win/loss points on top of the swing, so the pool still grows", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500],
      redRatings: [1500],
      winner: "BLUE",
    });
    expect(result.blueDelta + result.redDelta).toBe(WIN_POINT + LOSS_POINT);
  });

  it("gives the favorite a smaller gain when they win as expected", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.7597, 3);
    expect(result.blueDelta).toBe(13);
    expect(result.redDelta).toBe(-9);
  });

  it("rewards the underdog heavily when they upset the favorite", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "RED",
    });
    expect(result.blueDelta).toBe(-29);
    expect(result.redDelta).toBe(33);
  });

  it("throws if a team has no players", () => {
    expect(() =>
      calculateTeamMmrChange({ blueRatings: [], redRatings: [1500], winner: "BLUE" })
    ).toThrow("Both teams must have at least one player");
  });
});

describe("applySoftReset", () => {
  it("halves the distance from the base rating", () => {
    expect(applySoftReset(1300)).toBe(1150);
    expect(applySoftReset(800)).toBe(900);
  });

  it("leaves a rating already at the base untouched", () => {
    expect(applySoftReset(SOFT_RESET_BASE)).toBe(SOFT_RESET_BASE);
  });

  it("keeps the ordering of every rating", () => {
    const before = [1400, 1210, 1000, 940, 720];
    const after = before.map(applySoftReset);
    expect(after).toEqual([...after].sort((a, b) => b - a));
  });

  // Math.round breaks a .5 upward, so an odd distance lands on the higher whole
  // rating: 1001 stays 1001 and 999 climbs to the base rather than to 999.
  it("rounds a half point up to a whole rating", () => {
    expect(applySoftReset(1001)).toBe(1001);
    expect(applySoftReset(999)).toBe(1000);
    expect(applySoftReset(1333)).toBe(1167);
  });

  it("pulls halfway back", () => {
    expect(SOFT_RESET_RATIO).toBe(0.5);
    expect(SOFT_RESET_BASE).toBe(1000);
  });
});

describe("mmr config", () => {
  it("defaults to the built-in K and win/loss points", () => {
    expect(DEFAULT_MMR_CONFIG).toEqual({ k: MMR_K, winPoint: WIN_POINT, lossPoint: LOSS_POINT });
  });

  it("scales the swing with a custom K", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500],
      redRatings: [1500],
      winner: "BLUE",
      config: { k: 20, winPoint: 3, lossPoint: 1 },
    });
    expect(result.blueDelta).toBe(13);
    expect(result.redDelta).toBe(-9);
  });

  it("uses the configured win and loss points", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500],
      redRatings: [1500],
      winner: "BLUE",
      config: { k: 40, winPoint: 10, lossPoint: 0 },
    });
    expect(result.blueDelta).toBe(30);
    expect(result.redDelta).toBe(-20);
  });

  it("makes a K of zero leave nothing but the flat points", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1700],
      redRatings: [1300],
      winner: "RED",
      config: { k: 0, winPoint: 3, lossPoint: 1 },
    });
    expect(result.blueDelta).toBe(1);
    expect(result.redDelta).toBe(3);
  });
});

describe("validateMmrConfig", () => {
  it("accepts the default config", () => {
    expect(validateMmrConfig(DEFAULT_MMR_CONFIG)).toEqual([]);
  });

  it("rejects a K outside the allowed range", () => {
    expect(validateMmrConfig({ k: 0, winPoint: 3, lossPoint: 1 })).toEqual(["K값은 1 이상 200 이하여야 합니다"]);
    expect(validateMmrConfig({ k: 201, winPoint: 3, lossPoint: 1 })).toEqual(["K값은 1 이상 200 이하여야 합니다"]);
  });

  it("rejects points outside the allowed range", () => {
    expect(validateMmrConfig({ k: 40, winPoint: -1, lossPoint: 1 })).toEqual([
      "승리 점수는 0 이상 50 이하여야 합니다",
    ]);
    expect(validateMmrConfig({ k: 40, winPoint: 3, lossPoint: 51 })).toEqual([
      "패배 점수는 0 이상 50 이하여야 합니다",
    ]);
  });

  it("rejects non-integer values", () => {
    expect(validateMmrConfig({ k: 40.5, winPoint: 3, lossPoint: 1 })).toEqual(["K값은 정수여야 합니다"]);
  });

  it("reports every problem at once", () => {
    expect(validateMmrConfig({ k: 0, winPoint: 99, lossPoint: -2 })).toHaveLength(3);
  });

  // 패점이 승점보다 크면 지는 쪽이 더 벌어 승리 유인이 뒤집힌다. 값 자체는 범위 안이라
  // 각 항목 검사로는 걸리지 않으므로 조합으로 따로 막는다.
  it("rejects a loss point larger than the win point", () => {
    expect(validateMmrConfig({ k: 40, winPoint: 1, lossPoint: 5 })).toEqual([
      "패배 점수는 승리 점수보다 클 수 없습니다",
    ]);
  });
});
