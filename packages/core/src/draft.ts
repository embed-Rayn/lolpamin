// `type` is load-bearing — a value import would boot the Prisma client (see lane.ts).
import type { Lane } from "@lolpamin/db";

export type DraftSide = "blue" | "red";
export const DRAFT_SIDES: readonly DraftSide[] = ["blue", "red"];
export const DRAFT_LANES: readonly Lane[] = ["TOP", "JUG", "MID", "AD", "SUP"];

export type DraftSlots = Record<DraftSide, Record<Lane, string | null>>;

export interface DraftState {
  captains: Record<DraftSide, string | null>;
  slots: DraftSlots;
  // Non-captain seats in the order they were taken. Only undo reads it — the turn is derived
  // from seat counts so that removing a participant hands the turn back without bookkeeping.
  picks: string[];
}

export interface LanePrefs {
  mainLane: Lane | null;
  subLane: Lane | null;
}

export interface SlotRef {
  side: DraftSide;
  lane: Lane;
}

export type DraftAction =
  | { type: "setCaptain"; side: DraftSide; key: string; prefs: LanePrefs }
  | { type: "pick"; key: string; prefs: LanePrefs }
  | { type: "dropFromBench"; key: string; to: SlotRef }
  | { type: "move"; from: SlotRef; to: SlotRef }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "removeParticipant"; key: string };

// Captains are seated first; these are the eight picks after them. Blue has first pick.
export const SNAKE_ORDER: readonly DraftSide[] = ["blue", "red", "red", "blue", "blue", "red", "red", "blue"];
export const DRAFT_PICK_COUNT = SNAKE_ORDER.length;

const SNAKE_INDEXES: Record<DraftSide, number[]> = {
  blue: SNAKE_ORDER.flatMap((side, i) => (side === "blue" ? [i] : [])),
  red: SNAKE_ORDER.flatMap((side, i) => (side === "red" ? [i] : [])),
};

function emptyRow(): Record<Lane, string | null> {
  return { TOP: null, JUG: null, MID: null, AD: null, SUP: null };
}

export function emptyDraft(): DraftState {
  return { captains: { blue: null, red: null }, slots: { blue: emptyRow(), red: emptyRow() }, picks: [] };
}

export function autoLane(row: Record<Lane, string | null>, prefs: LanePrefs): Lane | null {
  if (prefs.mainLane !== null && row[prefs.mainLane] === null) return prefs.mainLane;
  if (prefs.subLane !== null && row[prefs.subLane] === null) return prefs.subLane;
  return DRAFT_LANES.find((lane) => row[lane] === null) ?? null;
}

export function seatOf(state: DraftState, key: string): SlotRef | null {
  for (const side of DRAFT_SIDES) {
    for (const lane of DRAFT_LANES) {
      if (state.slots[side][lane] === key) return { side, lane };
    }
  }
  return null;
}

export function isCaptain(state: DraftState, key: string): boolean {
  return state.captains.blue === key || state.captains.red === key;
}

function seatedCount(state: DraftState, side: DraftSide): number {
  return DRAFT_LANES.filter((lane) => state.slots[side][lane] !== null).length;
}

// One seat per side belongs to its captain. Seat counts stay put under same-side moves and
// cross-side swaps, which is why the turn is derived from them rather than from `picks`.
function sidePickCount(state: DraftState, side: DraftSide): number {
  return Math.max(0, seatedCount(state, side) - (state.captains[side] === null ? 0 : 1));
}

export function draftPickCount(state: DraftState): number {
  return sidePickCount(state, "blue") + sidePickCount(state, "red");
}

export function currentTurn(state: DraftState): DraftSide | null {
  if (state.captains.blue === null || state.captains.red === null) return null;
  const next = (side: DraftSide) => SNAKE_INDEXES[side][sidePickCount(state, side)] ?? Infinity;
  const blue = next("blue");
  const red = next("red");
  if (blue === Infinity && red === Infinity) return null;
  return blue < red ? "blue" : "red";
}

export function isDraftComplete(state: DraftState): boolean {
  return state.captains.blue !== null && state.captains.red !== null && currentTurn(state) === null;
}

function withSeat(slots: DraftSlots, ref: SlotRef, key: string | null): DraftSlots {
  return { ...slots, [ref.side]: { ...slots[ref.side], [ref.lane]: key } };
}

function withoutKey(state: DraftState, key: string): DraftSlots {
  const ref = seatOf(state, key);
  return ref === null ? state.slots : withSeat(state.slots, ref, null);
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "setCaptain": {
      const { side, key, prefs } = action;
      if (state.picks.length > 0) return state;
      if (isCaptain(state, key)) return state;
      const previous = state.captains[side];
      const cleared = previous === null ? state : { ...state, slots: withoutKey(state, previous) };
      // Before any pick a side holds at most its captain, so a lane is always free.
      const lane = autoLane(cleared.slots[side], prefs)!;
      return {
        ...cleared,
        captains: { ...state.captains, [side]: key },
        slots: withSeat(cleared.slots, { side, lane }, key),
      };
    }

    case "pick": {
      const turn = currentTurn(state);
      if (turn === null || seatOf(state, action.key) !== null) return state;
      const lane = autoLane(state.slots[turn], action.prefs);
      if (lane === null) return state;
      return {
        ...state,
        slots: withSeat(state.slots, { side: turn, lane }, action.key),
        picks: [...state.picks, action.key],
      };
    }

    case "dropFromBench": {
      const { key, to } = action;
      if (seatOf(state, key) !== null) return state;
      const occupant = state.slots[to.side][to.lane];
      if (isDraftComplete(state)) {
        // After the draft a bench drop is a substitution — the occupant goes back to the bench.
        if (occupant === null) return state;
        return {
          captains: {
            blue: state.captains.blue === occupant ? key : state.captains.blue,
            red: state.captains.red === occupant ? key : state.captains.red,
          },
          slots: withSeat(state.slots, to, key),
          picks: state.picks.map((k) => (k === occupant ? key : k)),
        };
      }
      if (currentTurn(state) !== to.side || occupant !== null) return state;
      return { ...state, slots: withSeat(state.slots, to, key), picks: [...state.picks, key] };
    }

    case "move": {
      const { from, to } = action;
      if (from.side === to.side && from.lane === to.lane) return state;
      const moving = state.slots[from.side][from.lane];
      if (moving === null) return state;
      // Crossing teams mid-draft would change seat counts and with them whose turn it is.
      if (from.side !== to.side && !isDraftComplete(state)) return state;
      const target = state.slots[to.side][to.lane];
      return { ...state, slots: withSeat(withSeat(state.slots, to, moving), from, target) };
    }

    case "undo": {
      if (state.picks.length > 0) {
        const last = state.picks[state.picks.length - 1];
        return { ...state, slots: withoutKey(state, last), picks: state.picks.slice(0, -1) };
      }
      for (const side of ["red", "blue"] as const) {
        const captain = state.captains[side];
        if (captain !== null) {
          return { ...state, captains: { ...state.captains, [side]: null }, slots: withoutKey(state, captain) };
        }
      }
      return state;
    }

    case "reset":
      return emptyDraft();

    case "removeParticipant": {
      if (isCaptain(state, action.key)) return emptyDraft();
      if (seatOf(state, action.key) === null) return state;
      return {
        ...state,
        slots: withoutKey(state, action.key),
        picks: state.picks.filter((k) => k !== action.key),
      };
    }
  }
}
