import { describe, expect, it } from "vitest";
import { emptyLineup, lineupReducer } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { guestKey, memberKey } from "@/lib/draft/candidates";
import {
  buildLineupCandidates,
  loadLineup,
  saveLineup,
  sideStats,
  TEAM_BUILDER_STORAGE_KEY,
  type StoredLineup,
} from "./lineup";

const member = (id: string, name: string, mmr: number, tier: DraftPoolMember["tier"]): DraftPoolMember => ({
  id, name, mmr, tier, peakTier: "MASTER_0_200", wins: 0, losses: 0, mainLane: null, subLane: null,
  riotId: null, extraAccounts: 0, masteries: [],
});

const pool = [member("a", "가", 1100, "DIAMOND_1"), member("b", "나", 1000, "GOLD_1")];

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

function sample(): StoredLineup {
  let slots = lineupReducer(emptyLineup(), { type: "place", key: memberKey("a"), to: { side: "blue", lane: "TOP" } });
  slots = lineupReducer(slots, { type: "place", key: memberKey("b"), to: { side: "red", lane: "MID" } });
  slots = lineupReducer(slots, { type: "place", key: guestKey("손님"), to: { side: "red", lane: "SUP" } });
  return {
    participantIds: ["a", "b"],
    guests: [{ name: "손님", mmr: 1200, tier: "SILVER_2", mainLane: "SUP", subLane: null }],
    slots,
  };
}

describe("buildLineupCandidates", () => {
  it("carries each member's tier and each guest's hand-picked tier", () => {
    const rows = buildLineupCandidates(pool, ["a", "b"], sample().guests);
    const tiers = Object.fromEntries(rows.map((r) => [r.key, r.tier]));
    expect(tiers).toEqual({ [memberKey("a")]: "DIAMOND_1", [memberKey("b")]: "GOLD_1", [guestKey("손님")]: "SILVER_2" });
    const peaks = Object.fromEntries(rows.map((r) => [r.key, r.peakTier]));
    expect(peaks).toEqual({ [memberKey("a")]: "MASTER_0_200", [memberKey("b")]: "MASTER_0_200", [guestKey("손님")]: null });
    const ids = Object.fromEntries(rows.map((r) => [r.key, r.memberId]));
    expect(ids).toEqual({ [memberKey("a")]: "a", [memberKey("b")]: "b", [guestKey("손님")]: null });
  });
});

describe("sideStats", () => {
  it("counts only the players seated on that side", () => {
    const { slots, guests } = sample();
    const byKey = new Map(buildLineupCandidates(pool, ["a", "b"], guests).map((c) => [c.key, c]));
    expect(sideStats(slots, "blue", byKey)).toEqual({ count: 1, tierTotal: 24, mmrAverage: 1100 });
    expect(sideStats(slots, "red", byKey)).toEqual({ count: 2, tierTotal: 19, mmrAverage: 1100 });
  });
});

describe("lineup storage", () => {
  it("round-trips a saved lineup under its own key, apart from the captain draft", () => {
    const storage = memoryStorage();
    saveLineup(storage, sample());
    expect(Object.keys(storage.data)).toEqual([TEAM_BUILDER_STORAGE_KEY]);
    expect(loadLineup(storage, new Set(["a", "b"]))).toEqual(sample());
  });

  it("drops members that left the pool, and their seats", () => {
    const storage = memoryStorage();
    saveLineup(storage, sample());
    const loaded = loadLineup(storage, new Set(["a"]))!;
    expect(loaded.participantIds).toEqual(["a"]);
    expect(loaded.slots.red.MID).toBeNull();
    expect(loaded.slots.red.SUP).toBe(guestKey("손님"));
  });

  it("rejects a guest with an unknown tier", () => {
    const bad = { ...sample(), guests: [{ name: "손님", mmr: 1000, tier: "WOOD", mainLane: null, subLane: null }] };
    const storage = memoryStorage({ [TEAM_BUILDER_STORAGE_KEY]: JSON.stringify(bad) });
    expect(loadLineup(storage, new Set(["a", "b"]))).toBeNull();
  });

  it("returns null for garbage or no storage", () => {
    expect(loadLineup(memoryStorage({ [TEAM_BUILDER_STORAGE_KEY]: "{" }), new Set())).toBeNull();
    expect(loadLineup(null, new Set())).toBeNull();
  });
});
