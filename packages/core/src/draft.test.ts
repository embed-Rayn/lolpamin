import { describe, expect, it } from "vitest";
import {
  autoLane,
  currentTurn,
  draftPickCount,
  draftReducer,
  emptyDraft,
  isDraftComplete,
  seatOf,
  SNAKE_ORDER,
  type DraftAction,
  type DraftState,
  type LanePrefs,
} from "./draft";

const none: LanePrefs = { mainLane: null, subLane: null };
const run = (actions: DraftAction[], from: DraftState = emptyDraft()) => actions.reduce(draftReducer, from);

// Blue captain on TOP, red captain on TOP.
const withCaptains = (): DraftState =>
  run([
    { type: "setCaptain", side: "blue", key: "bc", prefs: { mainLane: "TOP", subLane: null } },
    { type: "setCaptain", side: "red", key: "rc", prefs: { mainLane: "TOP", subLane: null } },
  ]);

// Eight picks in snake order, each by auto-lane with no preference.
const completed = (): DraftState =>
  run(
    ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((key) => ({ type: "pick", key, prefs: none }) as DraftAction),
    withCaptains(),
  );

describe("autoLane", () => {
  const row = { TOP: "x", JUG: null, MID: null, AD: null, SUP: null };
  it("prefers the main lane, then the sub lane, then the first free lane", () => {
    expect(autoLane(row, { mainLane: "MID", subLane: "AD" })).toBe("MID");
    expect(autoLane(row, { mainLane: "TOP", subLane: "AD" })).toBe("AD");
    expect(autoLane(row, { mainLane: "TOP", subLane: "TOP" })).toBe("JUG");
    expect(autoLane(row, none)).toBe("JUG");
  });
  it("returns null on a full team", () => {
    expect(autoLane({ TOP: "a", JUG: "b", MID: "c", AD: "d", SUP: "e" }, none)).toBeNull();
  });
});

describe("captains", () => {
  it("does not start the draft until both captains are set", () => {
    const blueOnly = run([{ type: "setCaptain", side: "blue", key: "bc", prefs: none }]);
    expect(currentTurn(blueOnly)).toBeNull();
    expect(draftReducer(blueOnly, { type: "pick", key: "p1", prefs: none })).toBe(blueOnly);
    expect(currentTurn(withCaptains())).toBe("blue");
  });

  it("seats a captain on their main lane", () => {
    const state = run([{ type: "setCaptain", side: "blue", key: "bc", prefs: { mainLane: "MID", subLane: null } }]);
    expect(seatOf(state, "bc")).toEqual({ side: "blue", lane: "MID" });
  });

  it("replaces a side's captain before any pick", () => {
    const state = run([{ type: "setCaptain", side: "blue", key: "other", prefs: none }], withCaptains());
    expect(state.captains.blue).toBe("other");
    expect(seatOf(state, "bc")).toBeNull();
  });

  it("refuses to make the other side's captain a captain again, and refuses once picking started", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "setCaptain", side: "blue", key: "rc", prefs: none })).toBe(state);
    const picked = draftReducer(state, { type: "pick", key: "p1", prefs: none });
    expect(draftReducer(picked, { type: "setCaptain", side: "blue", key: "z", prefs: none })).toBe(picked);
  });
});

describe("snake order", () => {
  it("is B R R B B R R B", () => {
    expect(SNAKE_ORDER).toEqual(["blue", "red", "red", "blue", "blue", "red", "red", "blue"]);
  });

  it("walks the turn through the snake as picks land", () => {
    let state = withCaptains();
    const turns: string[] = [];
    for (let i = 1; i <= 8; i++) {
      turns.push(currentTurn(state)!);
      state = draftReducer(state, { type: "pick", key: `p${i}`, prefs: none });
    }
    expect(turns).toEqual([...SNAKE_ORDER]);
    expect(currentTurn(state)).toBeNull();
    expect(isDraftComplete(state)).toBe(true);
    expect(draftPickCount(state)).toBe(8);
  });

  it("puts a pick on the current team's preferred free lane", () => {
    const state = run([{ type: "pick", key: "p1", prefs: { mainLane: "TOP", subLane: "SUP" } }], withCaptains());
    expect(seatOf(state, "p1")).toEqual({ side: "blue", lane: "SUP" });
  });

  it("ignores a pick of someone already seated", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "pick", key: "bc", prefs: none })).toBe(state);
  });
});

describe("dropFromBench", () => {
  it("seats onto an empty lane of the team whose turn it is", () => {
    const state = run([{ type: "dropFromBench", key: "p1", to: { side: "blue", lane: "SUP" } }], withCaptains());
    expect(seatOf(state, "p1")).toEqual({ side: "blue", lane: "SUP" });
    expect(currentTurn(state)).toBe("red");
  });

  it("refuses the team that is not on the clock, and an occupied lane during the draft", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "dropFromBench", key: "p1", to: { side: "red", lane: "SUP" } })).toBe(state);
    expect(draftReducer(state, { type: "dropFromBench", key: "p1", to: { side: "blue", lane: "TOP" } })).toBe(state);
  });

  it("replaces the occupant after the draft is complete, passing on captaincy", () => {
    const done = completed();
    const replaced = draftReducer(done, { type: "dropFromBench", key: "bench", to: { side: "blue", lane: "TOP" } });
    expect(seatOf(replaced, "bench")).toEqual({ side: "blue", lane: "TOP" });
    expect(seatOf(replaced, "bc")).toBeNull();
    expect(replaced.captains.blue).toBe("bench");
    expect(isDraftComplete(replaced)).toBe(true);
  });
});

describe("move", () => {
  it("swaps two lanes within a team at any time", () => {
    const state = run([{ type: "pick", key: "p1", prefs: { mainLane: "SUP", subLane: null } }], withCaptains());
    const moved = draftReducer(state, { type: "move", from: { side: "blue", lane: "SUP" }, to: { side: "blue", lane: "TOP" } });
    expect(seatOf(moved, "p1")).toEqual({ side: "blue", lane: "TOP" });
    expect(seatOf(moved, "bc")).toEqual({ side: "blue", lane: "SUP" });
  });

  it("refuses to cross teams while the draft is in progress", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "move", from: { side: "blue", lane: "TOP" }, to: { side: "red", lane: "SUP" } })).toBe(state);
  });

  it("swaps across teams once the draft is complete", () => {
    const done = completed();
    const a = done.slots.blue.JUG!;
    const b = done.slots.red.JUG!;
    const swapped = draftReducer(done, { type: "move", from: { side: "blue", lane: "JUG" }, to: { side: "red", lane: "JUG" } });
    expect(swapped.slots.blue.JUG).toBe(b);
    expect(swapped.slots.red.JUG).toBe(a);
    expect(isDraftComplete(swapped)).toBe(true);
  });
});

describe("undo", () => {
  it("takes back the last pick and hands the turn back", () => {
    const state = run([{ type: "pick", key: "p1", prefs: none }, { type: "undo" }], withCaptains());
    expect(seatOf(state, "p1")).toBeNull();
    expect(currentTurn(state)).toBe("blue");
  });

  it("clears captains, red first, when there is no pick left", () => {
    const once = draftReducer(withCaptains(), { type: "undo" });
    expect(once.captains).toEqual({ blue: "bc", red: null });
    const twice = draftReducer(once, { type: "undo" });
    expect(twice).toEqual(emptyDraft());
  });
});

describe("removeParticipant", () => {
  it("frees the seat and gives the turn back to the team that lost a player", () => {
    // After p1(blue) p2(red) p3(red), it is blue's turn. Removing p2 makes it red's turn again.
    const state = run(
      [
        { type: "pick", key: "p1", prefs: none },
        { type: "pick", key: "p2", prefs: none },
        { type: "pick", key: "p3", prefs: none },
        { type: "removeParticipant", key: "p2" },
      ],
      withCaptains(),
    );
    expect(seatOf(state, "p2")).toBeNull();
    expect(state.picks).toEqual(["p1", "p3"]);
    expect(currentTurn(state)).toBe("red");
  });

  it("resets the whole draft when a captain leaves", () => {
    const state = run([{ type: "pick", key: "p1", prefs: none }, { type: "removeParticipant", key: "rc" }], withCaptains());
    expect(state).toEqual(emptyDraft());
  });

  it("is a no-op for someone on the bench", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "removeParticipant", key: "nobody" })).toBe(state);
  });
});

it("reset empties everything", () => {
  expect(draftReducer(completed(), { type: "reset" })).toEqual(emptyDraft());
});
