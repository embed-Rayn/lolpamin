import { describe, expect, it } from "vitest";
import {
  createDrawState,
  drawById,
  drawNext,
  drawnCandidates,
  remainingCandidates,
  resetDraw,
  undoDraw,
  type DrawCandidate,
} from "./draw";

const people: DrawCandidate[] = [
  { id: "a", label: "박병준" },
  { id: "b", label: "김철수" },
  { id: "c", label: "이영희" },
];

const alwaysFirst = () => 0;
const alwaysLast = (n: number) => n - 1;

describe("createDrawState", () => {
  it("starts with every candidate remaining and nothing drawn", () => {
    const state = createDrawState(people);
    expect(remainingCandidates(state)).toEqual(people);
    expect(drawnCandidates(state)).toEqual([]);
  });
});

describe("drawNext", () => {
  it("never draws the same candidate twice", () => {
    let state = createDrawState(people);
    const picked: string[] = [];
    for (let i = 0; i < people.length; i++) {
      const result = drawNext(state, alwaysFirst)!;
      state = result.state;
      picked.push(result.picked.id);
    }
    expect(new Set(picked).size).toBe(people.length);
  });

  it("removes the picked candidate from the remaining pool", () => {
    const { state, picked } = drawNext(createDrawState(people), alwaysFirst)!;
    expect(picked.id).toBe("a");
    expect(remainingCandidates(state).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("records draw order", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysLast)!.state;
    state = drawNext(state, alwaysLast)!.state;
    expect(drawnCandidates(state).map((c) => c.id)).toEqual(["c", "b"]);
  });

  it("passes the remaining count to nextIndex", () => {
    const seen: number[] = [];
    const spy = (n: number) => {
      seen.push(n);
      return 0;
    };
    let state = createDrawState(people);
    state = drawNext(state, spy)!.state;
    state = drawNext(state, spy)!.state;
    expect(seen).toEqual([3, 2]);
  });

  it("returns null when the pool is empty", () => {
    let state = createDrawState(people);
    for (let i = 0; i < people.length; i++) state = drawNext(state, alwaysFirst)!.state;
    expect(drawNext(state, alwaysFirst)).toBeNull();
  });

  it("returns null for a state built from no candidates", () => {
    expect(drawNext(createDrawState([]), alwaysFirst)).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = createDrawState(people);
    drawNext(state, alwaysFirst);
    expect(state.drawnIds).toEqual([]);
  });
});

describe("undoDraw", () => {
  it("restores only the most recent pick", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = drawNext(state, alwaysFirst)!.state;
    const undone = undoDraw(state);
    expect(drawnCandidates(undone).map((c) => c.id)).toEqual(["a"]);
    expect(remainingCandidates(undone).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("restores the candidate to its original position, not the end", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    expect(remainingCandidates(undoDraw(state)).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when nothing has been drawn", () => {
    const state = createDrawState(people);
    expect(undoDraw(state)).toEqual(state);
  });

  it("makes an undone candidate drawable again", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = undoDraw(state);
    expect(drawNext(state, alwaysFirst)!.picked.id).toBe("a");
  });
});

describe("resetDraw", () => {
  it("restores every candidate", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = drawNext(state, alwaysFirst)!.state;
    const reset = resetDraw(state);
    expect(remainingCandidates(reset)).toEqual(people);
    expect(drawnCandidates(reset)).toEqual([]);
  });
});

describe("drawById", () => {
  it("draws the named candidate", () => {
    const result = drawById(createDrawState(people), "b")!;
    expect(result.picked.id).toBe("b");
    expect(remainingCandidates(result.state).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("appends to the same draw order stack as drawNext", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = drawById(state, "c")!.state;
    expect(drawnCandidates(state).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("returns null for an unknown id", () => {
    expect(drawById(createDrawState(people), "zzz")).toBeNull();
  });

  it("returns null for a candidate that is already drawn", () => {
    const state = drawById(createDrawState(people), "a")!.state;
    expect(drawById(state, "a")).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = createDrawState(people);
    drawById(state, "a");
    expect(state.drawnIds).toEqual([]);
  });
});
