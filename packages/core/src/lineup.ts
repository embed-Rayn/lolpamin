// `type` is load-bearing — a value import would boot the Prisma client (see lane.ts).
import type { MemberTier } from "@lolpamin/db";
import { DRAFT_LANES, DRAFT_SIDES, type DraftSlots, type SlotRef } from "./draft";
import { tierScore } from "./tier";

// The manual team builder's seats. Same shape as the captain draft's, but with none of its
// rules: no captains, no turn, any participant may go to any seat at any time.
export type LineupSlots = DraftSlots;

export type LineupAction =
  | { type: "place"; key: string; to: SlotRef }
  | { type: "unseat"; key: string }
  | { type: "reset" };

export function emptyLineup(): LineupSlots {
  return {
    blue: { TOP: null, JUG: null, MID: null, AD: null, SUP: null },
    red: { TOP: null, JUG: null, MID: null, AD: null, SUP: null },
  };
}

function withSeat(slots: LineupSlots, at: SlotRef, key: string | null): LineupSlots {
  return { ...slots, [at.side]: { ...slots[at.side], [at.lane]: key } };
}

function seatOfKey(slots: LineupSlots, key: string): SlotRef | null {
  for (const side of DRAFT_SIDES) {
    for (const lane of DRAFT_LANES) {
      if (slots[side][lane] === key) return { side, lane };
    }
  }
  return null;
}

export function lineupReducer(slots: LineupSlots, action: LineupAction): LineupSlots {
  switch (action.type) {
    case "place": {
      const from = seatOfKey(slots, action.key);
      if (from !== null && from.side === action.to.side && from.lane === action.to.lane) return slots;
      const occupant = slots[action.to.side][action.to.lane];
      const placed = withSeat(slots, action.to, action.key);
      // From a seat the two trade places; from the bench the occupant goes back to the bench.
      return from === null ? placed : withSeat(placed, from, occupant);
    }
    case "unseat": {
      const at = seatOfKey(slots, action.key);
      return at === null ? slots : withSeat(slots, at, null);
    }
    case "reset":
      return emptyLineup();
  }
}

export interface LineupSideStats {
  count: number;
  tierTotal: number;
  mmrAverage: number | null;
}

// Tier is a sum (the reference table was built to be added up across a team); MMR is an
// average, the number the captain draft and the MMR simulator already show.
export function lineupSideStats(players: ReadonlyArray<{ mmr: number; tier: MemberTier }>): LineupSideStats {
  const tierTotal = players.reduce((sum, p) => sum + tierScore(p.tier), 0);
  const mmrAverage =
    players.length === 0 ? null : Math.round(players.reduce((sum, p) => sum + p.mmr, 0) / players.length);
  return { count: players.length, tierTotal, mmrAverage };
}
