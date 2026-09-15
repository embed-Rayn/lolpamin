import { describe, expect, it } from "vitest";
import { ratingField } from "./rating-field";

describe("ratingField", () => {
  it("returns aramMmr for ARAM", () => {
    expect(ratingField("ARAM")).toBe("aramMmr");
  });

  it("returns mmr for RIFT", () => {
    expect(ratingField("RIFT")).toBe("mmr");
  });
});
