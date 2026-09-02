import { Bodies, Body, Composite, Engine } from "matter-js";

// The 07 course is authored in fixed units and scaled to the canvas at draw time,
// so the physics behaves identically at any window size. Keeping it out of the
// component is what makes the race testable head-less: a vitest run can play a
// few hundred races and prove that one always finishes.
export const WIDTH_UNITS = 400;
export const COURSE_HEIGHT = 460;
export const MARBLE_RADIUS = 9;
export const GOAL_Y = COURSE_HEIGHT - 26;
export const STEP_MS = 1000 / 60;
export const MAX_RACE_MS = 25_000;

export interface Spinner {
  body: Body;
  speed: number;
}

export interface RaceMarble {
  id: string;
  label: string;
  body: Body;
}

export function createRaceEngine(): Engine {
  const engine = Engine.create();
  engine.gravity.y = 1;
  return engine;
}

export function buildCourse(engine: Engine): Spinner[] {
  const wallOptions = { isStatic: true, restitution: 0.2 };
  const walls = [
    Bodies.rectangle(-10, COURSE_HEIGHT / 2, 20, COURSE_HEIGHT * 2, wallOptions),
    Bodies.rectangle(WIDTH_UNITS + 10, COURSE_HEIGHT / 2, 20, COURSE_HEIGHT * 2, wallOptions),
    // Floor below the goal so marbles pile up instead of falling forever.
    Bodies.rectangle(WIDTH_UNITS / 2, COURSE_HEIGHT + 10, WIDTH_UNITS + 40, 20, wallOptions),
  ];

  const pegs: Body[] = [];
  for (const [row, y] of [90, 130, 170, 250, 290, 330].entries()) {
    const offset = row % 2 === 0 ? 0 : 22;
    for (let x = 30 + offset; x < WIDTH_UNITS - 20; x += 44) {
      pegs.push(Bodies.circle(x, y, 5, { isStatic: true, restitution: 0.6 }));
    }
  }

  // Angled deflectors gather the pack back toward the middle between peg fields.
  const ramps = [
    Bodies.rectangle(60, 215, 150, 8, { isStatic: true, angle: 0.35, restitution: 0.3 }),
    Bodies.rectangle(WIDTH_UNITS - 60, 215, 150, 8, {
      isStatic: true,
      angle: -0.35,
      restitution: 0.3,
    }),
  ];

  const spinners: Spinner[] = [
    { body: Bodies.rectangle(WIDTH_UNITS / 2, 210, 130, 9, { isStatic: true }), speed: 0.03 },
    { body: Bodies.rectangle(WIDTH_UNITS / 2, 380, 160, 9, { isStatic: true }), speed: -0.045 },
  ];

  Composite.add(engine.world, [...walls, ...pegs, ...ramps, ...spinners.map((s) => s.body)]);
  return spinners;
}

export function clearMarbles(engine: Engine): void {
  for (const body of Composite.allBodies(engine.world)) {
    if (body.label === "marble") Composite.remove(engine.world, body);
  }
}

export function spawnMarbles(
  engine: Engine,
  candidates: { id: string; label: string }[]
): RaceMarble[] {
  clearMarbles(engine);
  return candidates.map((candidate, i) => {
    const body = Bodies.circle(
      WIDTH_UNITS / 2 + (i % 5) * 14 - 28,
      -30 - Math.floor(i / 5) * 26,
      MARBLE_RADIUS,
      { label: "marble", restitution: 0.45, friction: 0.02, frictionAir: 0 }
    );
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 0 });
    Composite.add(engine.world, body);
    return { id: candidate.id, label: candidate.label, body };
  });
}

export function advance(engine: Engine, spinners: Spinner[], deltaMs: number): void {
  for (const spinner of spinners) {
    Body.setAngle(spinner.body, spinner.body.angle + spinner.speed);
    Body.setAngularVelocity(spinner.body, spinner.speed);
  }
  Engine.update(engine, deltaMs);
}

// The winner is whoever crossed the goal line first. Several marbles can cross
// inside one step, so the lowest of them got there first. Past the time cap the
// leader wins outright — a marble wedged in a corner must never hang the button.
export function findWinner(marbles: RaceMarble[], elapsedMs: number): RaceMarble | null {
  if (marbles.length === 0) return null;
  const crossed = marbles.filter((m) => m.body.position.y >= GOAL_Y);
  if (crossed.length > 0) return lowest(crossed);
  if (elapsedMs >= MAX_RACE_MS) return lowest(marbles);
  return null;
}

function lowest(marbles: RaceMarble[]): RaceMarble {
  return marbles.reduce((a, b) => (a.body.position.y >= b.body.position.y ? a : b));
}
