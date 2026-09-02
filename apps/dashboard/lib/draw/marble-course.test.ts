import { describe, expect, it } from "vitest";
import {
  GOAL_Y,
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
// y at which the leader has cleared everything above the paddle wheels.
const WHEEL_ENTRY_Y = 2330;

function race(count: number): {
  winnerId: string;
  elapsed: number;
  leaderAtWheels: string | null;
} {
  const engine = createRaceEngine();
  const movers = buildCourse(engine);
  const marbles = spawnMarbles(
    engine,
    Array.from({ length: count }, (_, i) => ({ id: `c${i}`, label: `후보${i}` }))
  );

  let elapsed = 0;
  let leaderAtWheels: string | null = null;
  for (;;) {
    advance(engine, movers, STEP_MS, elapsed);
    elapsed += STEP_MS;
    const front = leader(marbles);
    if (leaderAtWheels === null && front && front.body.position.y > WHEEL_ENTRY_Y) {
      leaderAtWheels = front.id;
    }
    const winner = findWinner(marbles, elapsed);
    if (winner) return { winnerId: winner.id, elapsed, leaderAtWheels };
  }
}

describe("marble race", () => {
  it("always produces a winner well inside the time cap", () => {
    for (let i = 0; i < 10; i++) {
      const { elapsed } = race(8);
      expect(elapsed).toBeLessThan(MAX_RACE_MS);
    }
  });

  it("runs for about twenty seconds", () => {
    // The first single-screen course was over in two seconds, which is what made
    // it feel like nothing was at stake.
    const runs = Array.from({ length: 6 }, () => race(8).elapsed);
    const average = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(average).toBeGreaterThan(14_000);
    expect(average).toBeLessThan(28_000);
  });

  it("lets the paddle wheels steal the win from the marble that arrives first", () => {
    // Roughly two races in five turn over at the wheels; over twelve runs, never
    // seeing it would mean the last obstacle stopped mattering.
    const runs = Array.from({ length: 12 }, () => race(8));
    const flipped = runs.filter(
      (r) => r.leaderAtWheels !== null && r.leaderAtWheels !== r.winnerId
    );
    expect(flipped.length).toBeGreaterThan(0);
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

  it("lets every marble reach the goal given enough time", () => {
    // Nothing may be left behind on a ledge: a marble that can never finish is a
    // dead spot in the map, and frictionless surfaces make those easy to create.
    for (let run = 0; run < 3; run++) {
      const engine = createRaceEngine();
      const movers = buildCourse(engine);
      const marbles = spawnMarbles(
        engine,
        Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `후보${i}` }))
      );
      const finished = new Set<string>();
      let elapsed = 0;
      while (elapsed < 120_000 && finished.size < marbles.length) {
        advance(engine, movers, STEP_MS, elapsed);
        elapsed += STEP_MS;
        for (const marble of marbles) {
          if (marble.body.position.y >= GOAL_Y) finished.add(marble.id);
        }
      }
      expect([...finished].length).toBe(marbles.length);
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
