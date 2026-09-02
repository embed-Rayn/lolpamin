import { describe, expect, it } from "vitest";
import {
  MAX_RACE_MS,
  STEP_MS,
  advance,
  buildCourse,
  clearMarbles,
  createRaceEngine,
  findWinner,
  leader,
  spawnMarbles,
} from "./marble-course";

// The physics itself decides who wins in 07, so these tests are the guarantee
// that a race always ends: no wedged marble, no run past the time cap.
function race(count: number): { winnerId: string; elapsed: number } {
  const engine = createRaceEngine();
  const movers = buildCourse(engine);
  const marbles = spawnMarbles(
    engine,
    Array.from({ length: count }, (_, i) => ({ id: `c${i}`, label: `후보${i}` }))
  );

  let elapsed = 0;
  for (;;) {
    advance(engine, movers, STEP_MS, elapsed);
    elapsed += STEP_MS;
    const winner = findWinner(marbles, elapsed);
    if (winner) return { winnerId: winner.id, elapsed };
  }
}

describe("marble race", () => {
  it("always produces a winner well inside the time cap", () => {
    for (let i = 0; i < 10; i++) {
      const { elapsed } = race(8);
      expect(elapsed).toBeLessThan(MAX_RACE_MS);
    }
  });

  it("takes long enough to build tension but is not a slog", () => {
    // The old single-screen course was over in about two seconds, which is what
    // made it feel like nothing was at stake.
    const runs = Array.from({ length: 6 }, () => race(8).elapsed);
    const average = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(average).toBeGreaterThan(8_000);
    expect(average).toBeLessThan(45_000);
  });

  it("changes leader at least once on the way down", () => {
    const engine = createRaceEngine();
    const movers = buildCourse(engine);
    const marbles = spawnMarbles(
      engine,
      Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `후보${i}` }))
    );
    const leaders = new Set<string>();
    let elapsed = 0;
    for (;;) {
      advance(engine, movers, STEP_MS, elapsed);
      elapsed += STEP_MS;
      const front = leader(marbles);
      if (front) leaders.add(front.id);
      if (findWinner(marbles, elapsed)) break;
    }
    expect(leaders.size).toBeGreaterThan(1);
  });

  it("finishes with a single marble", () => {
    const { winnerId } = race(1);
    expect(winnerId).toBe("c0");
  });

  it("handles a crowded field", () => {
    const { winnerId, elapsed } = race(20);
    expect(winnerId).toMatch(/^c\d+$/);
    expect(elapsed).toBeLessThan(MAX_RACE_MS);
  });

  it("does not always hand it to the same marble", () => {
    const winners = new Set<string>();
    for (let i = 0; i < 15; i++) winners.add(race(8).winnerId);
    expect(winners.size).toBeGreaterThan(2);
  });

  it("findWinner reports nobody before anyone reaches the goal", () => {
    const engine = createRaceEngine();
    buildCourse(engine);
    const marbles = spawnMarbles(engine, [{ id: "a", label: "a" }]);
    expect(findWinner(marbles, 0)).toBeNull();
  });

  it("clearMarbles empties the field between races", () => {
    const engine = createRaceEngine();
    buildCourse(engine);
    spawnMarbles(engine, [{ id: "a", label: "a" }]);
    clearMarbles(engine);
    expect(findWinner([], 0)).toBeNull();
  });
});
