import { describe, expect, it } from "vitest";
import { displayedRating } from "./displayed-rating";

describe("displayedRating", () => {
  it("shows 0 for a member with no counted game", () => {
    expect(displayedRating(1000, 0)).toBe(0);
    expect(displayedRating(1500, 0)).toBe(0);
  });

  it("shows the stored rating once a game has been counted", () => {
    expect(displayedRating(1023, 1)).toBe(1023);
    expect(displayedRating(977, 12)).toBe(977);
  });
});
