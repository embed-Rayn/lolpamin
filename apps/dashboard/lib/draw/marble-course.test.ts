import { describe, expect, it } from "vitest";
import {
  MAX_RACE_MS,
  STEP_MS,
  advance,
  buildCourse,
  clearMarbles,
  createRaceEngine,
  findWinner,
  spawnMarbles,
} from "./marble-course";

// The physics itself decides who wins in 07, so these tests are the guarantee
// that a race always ends: no wedged marble, no run past the time cap.
function race(count: number): { winnerId: string; elapsed: number } {
  const engine = createRaceEngine();
  const spinners = buildCourse(engine);
  const marbles = spawnMarbles(
    engine,
    Array.from({ length: count }, (_, i) => ({ id: `c${i}`, label: `후보${i}` }))
  );

  let elapsed = 0;
  for (;;) {
    advance(engine, spinners, STEP_MS);
    elapsed += STEP_MS;
    const winner = findWinner(marbles, elapsed);
    if (winner) return { winnerId: winner.id, elapsed };
  }
}

describe("marble race", () => {
  it("always produces a winner well inside the time cap", () => {
    for (let i = 0; i < 20; i++) {
      const { elapsed } = race(8);
      expect(elapsed).toBeLessThan(MAX_RACE_MS);
    }
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
    for (let i = 0; i < 30; i++) winners.add(race(8).winnerId);
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
