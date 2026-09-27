import { describe, expect, it } from "vitest";
import { topMasteries } from "./mastery";

describe("topMasteries", () => {
  it("sums points across accounts and keeps the highest level", () => {
    const result = topMasteries([
      { championId: 1, level: 7, points: 100 },
      { championId: 1, level: 12, points: 50 },
      { championId: 2, level: 30, points: 120 },
    ]);
    expect(result).toEqual([
      { championId: 1, level: 12, points: 150 },
      { championId: 2, level: 30, points: 120 },
    ]);
  });

  it("finds a champion that is fourth on each account but first combined", () => {
    const main = [
      { championId: 10, level: 5, points: 90 },
      { championId: 11, level: 5, points: 80 },
      { championId: 12, level: 5, points: 70 },
      { championId: 99, level: 5, points: 60 },
    ];
    const smurf = [
      { championId: 20, level: 5, points: 90 },
      { championId: 21, level: 5, points: 80 },
      { championId: 22, level: 5, points: 70 },
      { championId: 99, level: 5, points: 60 },
    ];
    expect(topMasteries([...main, ...smurf])[0]).toEqual({ championId: 99, level: 5, points: 120 });
  });

  it("returns at most n, breaking ties by champion id", () => {
    const result = topMasteries(
      [
        { championId: 3, level: 1, points: 10 },
        { championId: 1, level: 1, points: 10 },
        { championId: 2, level: 1, points: 10 },
        { championId: 4, level: 1, points: 10 },
      ],
      3,
    );
    expect(result.map((m) => m.championId)).toEqual([1, 2, 3]);
  });

  it("returns fewer than n, or none, when there is not enough data", () => {
    expect(topMasteries([])).toEqual([]);
    expect(topMasteries([{ championId: 1, level: 2, points: 3 }])).toHaveLength(1);
  });
});
