import { describe, expect, it } from "vitest";
import { isLane, LANE_OPTIONS, laneLabel } from "./lane";

describe("lane", () => {
  it("lists lanes top to support", () => {
    expect(LANE_OPTIONS.map((o) => o.value)).toEqual(["TOP", "JUG", "MID", "AD", "SUP"]);
  });

  it("labels each lane the way the group writes it", () => {
    expect(LANE_OPTIONS.map((o) => o.label)).toEqual(["탑", "정글", "미드", "원딜", "서폿"]);
  });

  it("shows a dash for an unknown lane", () => {
    expect(laneLabel(null)).toBe("-");
    expect(laneLabel("JUG")).toBe("정글");
  });

  it("accepts only lane values", () => {
    expect(isLane("MID")).toBe(true);
    expect(isLane("MIDDLE")).toBe(false);
    expect(isLane("toString")).toBe(false);
    expect(isLane(null)).toBe(false);
  });
});
