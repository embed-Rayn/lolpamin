import { describe, expect, it } from "vitest";
import {
  applyHardReset,
  applySoftReset,
  calculateTeamMmrChange,
  LOSS_POINT,
  MMR_K,
  SOFT_RESET_BASE,
  SOFT_RESET_RATIO,
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

describe("applyHardReset", () => {
  it("drops every rating to the base, however far it was", () => {
    expect(applyHardReset()).toBe(SOFT_RESET_BASE);
  });

  it("erases the ordering a soft reset would have kept", () => {
    const before = [1400, 1210, 940];
    expect(before.map(applyHardReset)).toEqual([1000, 1000, 1000]);
    expect(before.map(applySoftReset)).not.toEqual([1000, 1000, 1000]);
  });
});
