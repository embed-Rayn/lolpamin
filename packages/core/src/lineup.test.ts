import { describe, expect, it } from "vitest";
import { emptyLineup, lineupReducer, lineupSideStats, type LineupAction, type LineupSlots } from "./lineup";

const run = (actions: LineupAction[], from: LineupSlots = emptyLineup()) => actions.reduce(lineupReducer, from);

describe("lineupReducer", () => {
  it("seats a benched participant on an empty slot", () => {
    const slots = run([{ type: "place", key: "a", to: { side: "blue", lane: "TOP" } }]);
    expect(slots.blue.TOP).toBe("a");
  });

  it("sends the occupant back to the bench when a benched participant takes the slot", () => {
    const slots = run([
      { type: "place", key: "a", to: { side: "blue", lane: "TOP" } },
      { type: "place", key: "b", to: { side: "blue", lane: "TOP" } },
    ]);
    expect(slots.blue.TOP).toBe("b");
    expect(Object.values(slots.blue).concat(Object.values(slots.red))).not.toContain("a");
  });

  it("swaps two seated participants, across teams too", () => {
    const slots = run([
      { type: "place", key: "a", to: { side: "blue", lane: "TOP" } },
      { type: "place", key: "b", to: { side: "red", lane: "MID" } },
      { type: "place", key: "a", to: { side: "red", lane: "MID" } },
    ]);
    expect(slots.red.MID).toBe("a");
    expect(slots.blue.TOP).toBe("b");
  });

  it("moves a seated participant to an empty slot and frees the old one", () => {
    const slots = run([
      { type: "place", key: "a", to: { side: "blue", lane: "TOP" } },
      { type: "place", key: "a", to: { side: "red", lane: "SUP" } },
    ]);
    expect(slots.red.SUP).toBe("a");
    expect(slots.blue.TOP).toBeNull();
  });

  it("leaves the lineup alone when dropped on its own slot", () => {
    const before = run([{ type: "place", key: "a", to: { side: "blue", lane: "TOP" } }]);
    expect(lineupReducer(before, { type: "place", key: "a", to: { side: "blue", lane: "TOP" } })).toBe(before);
  });

  it("unseats a participant, and ignores one who is not seated", () => {
    const seated = run([{ type: "place", key: "a", to: { side: "blue", lane: "JUG" } }]);
    expect(lineupReducer(seated, { type: "unseat", key: "a" }).blue.JUG).toBeNull();
    expect(lineupReducer(seated, { type: "unseat", key: "zzz" })).toBe(seated);
  });

  it("empties every slot on reset", () => {
    const slots = run([
      { type: "place", key: "a", to: { side: "blue", lane: "TOP" } },
      { type: "place", key: "b", to: { side: "red", lane: "AD" } },
      { type: "reset" },
    ]);
    expect(slots).toEqual(emptyLineup());
  });
});

describe("lineupSideStats", () => {
  it("sums tier scores and averages MMR over the seated players", () => {
    expect(
      lineupSideStats([
        { mmr: 1000, tier: "DIAMOND_1" },
        { mmr: 1051, tier: "GOLD_4" },
      ]),
    ).toEqual({ count: 2, tierTotal: 33, mmrAverage: 1026 });
  });

  it("has no average for an empty side", () => {
    expect(lineupSideStats([])).toEqual({ count: 0, tierTotal: 0, mmrAverage: null });
  });
});
