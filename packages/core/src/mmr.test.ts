import { describe, expect, it } from "vitest";
import { calculateTeamMmrChange, MMR_K, PARTICIPATION_POINT } from "./mmr";

describe("calculateTeamMmrChange", () => {
  it("has a K-factor of 32", () => {
    expect(MMR_K).toBe(32);
  });

  it("awards one participation point to every player", () => {
    expect(PARTICIPATION_POINT).toBe(1);
  });

  it("splits the K-factor evenly when both teams have equal average rating", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500, 1500],
      redRatings: [1500, 1500],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.5, 5);
    expect(result.blueDelta).toBe(17);
    expect(result.redDelta).toBe(-15);
  });

  it("adds the participation point on top of the win/loss swing, so both teams gain one", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1500],
      redRatings: [1500],
      winner: "BLUE",
    });
    expect(result.blueDelta + result.redDelta).toBe(2 * PARTICIPATION_POINT);
  });

  it("gives the favorite a smaller gain when they win as expected", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.7597, 3);
    expect(result.blueDelta).toBe(9);
    expect(result.redDelta).toBe(-7);
  });

  it("rewards the underdog heavily when they upset the favorite", () => {
    const result = calculateTeamMmrChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "RED",
    });
    expect(result.blueDelta).toBe(-23);
    expect(result.redDelta).toBe(25);
  });

  it("throws if a team has no players", () => {
    expect(() =>
      calculateTeamMmrChange({ blueRatings: [], redRatings: [1500], winner: "BLUE" })
    ).toThrow("Both teams must have at least one player");
  });
});
