import { describe, expect, it } from "vitest";
import { calculateTeamEloChange, ELO_K } from "./elo";

describe("calculateTeamEloChange", () => {
  it("has a K-factor of 32", () => {
    expect(ELO_K).toBe(32);
  });

  it("splits the K-factor evenly when both teams have equal average rating", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1500, 1500],
      redRatings: [1500, 1500],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.5, 5);
    expect(result.blueDelta).toBe(16);
    expect(result.redDelta).toBe(-16);
  });

  it("gives the underdog a bigger gain when the favorite (higher avg) wins as favorite penalty is smaller", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.7597, 3);
    expect(result.blueDelta).toBe(8);
    expect(result.redDelta).toBe(-8);
  });

  it("rewards the underdog heavily when they upset the favorite", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "RED",
    });
    expect(result.blueDelta).toBe(-24);
    expect(result.redDelta).toBe(24);
  });

  it("throws if a team has no players", () => {
    expect(() =>
      calculateTeamEloChange({ blueRatings: [], redRatings: [1500], winner: "BLUE" })
    ).toThrow("Both teams must have at least one player");
  });
});
