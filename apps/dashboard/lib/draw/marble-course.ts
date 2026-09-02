import { Bodies, Body, Composite, Engine } from "matter-js";

// The 07 course is authored in fixed units and scaled to the canvas at draw time,
// so the physics behaves identically at any window size. Keeping it out of the
// component is what makes the race testable head-less: a vitest run can play a
// few hundred races and prove that one always finishes.
export const WIDTH_UNITS = 400;
// The course is far taller than the canvas — the view scrolls with the leader.
// A long fall is what gives the race its tension: lead changes, near-misses at
// the gates, and a bottleneck right before the goal.
export const COURSE_HEIGHT = 1900;
export const VIEW_HEIGHT = 520;
export const MARBLE_RADIUS = 9;
export const GOAL_Y = COURSE_HEIGHT - 40;
export const STEP_MS = 1000 / 60;
export const MAX_RACE_MS = 90_000;

// Gravity is deliberately low and the marbles carry air drag, so they drift down
// at a readable pace instead of dropping like stones.
const GRAVITY_Y = 1;
const MARBLE_AIR_FRICTION = 0.004;

export interface Mover {
  body: Body;
  // Spinners rotate at a fixed rate; sliders sweep left and right.
  kind: "spin" | "slide";
  speed: number;
  origin: { x: number; y: number };
  amplitude: number;
  phase: number;
}

export interface RaceMarble {
  id: string;
  label: string;
  body: Body;
}

export function createRaceEngine(): Engine {
  const engine = Engine.create();
  engine.gravity.y = GRAVITY_Y;
  return engine;
}

export function buildCourse(engine: Engine): Mover[] {
  // Frictionless obstacles: a marble that stalls on a ledge kills the race. The
  // pace comes from the length of the drop and the number of deflections, not
  // from drag. Every section is spaced so no two obstacles form a wedge narrower
  // than a marble — that is what jammed the first long-course attempt.
  const staticOptions = { isStatic: true, restitution: 0.3, friction: 0, frictionStatic: 0 };
  const parts: Body[] = [
    Bodies.rectangle(-12, COURSE_HEIGHT / 2, 24, COURSE_HEIGHT * 2, staticOptions),
    Bodies.rectangle(WIDTH_UNITS + 12, COURSE_HEIGHT / 2, 24, COURSE_HEIGHT * 2, staticOptions),
    // Floor below the goal so marbles pile up instead of falling forever.
    Bodies.rectangle(WIDTH_UNITS / 2, COURSE_HEIGHT + 40, WIDTH_UNITS + 48, 24, staticOptions),
  ];
  const movers: Mover[] = [];

  // 1. Opening peg field — spreads the pack out immediately.
  for (const [row, y] of [120, 165, 210, 255, 300].entries()) {
    const offset = row % 2 === 0 ? 0 : 22;
    for (let x = 28 + offset; x < WIDTH_UNITS - 16; x += 44) {
      parts.push(Bodies.circle(x, y, 5, { ...staticOptions, restitution: 0.5 }));
    }
  }

  // 2. Wall deflectors — both sides push the pack into the middle, leaving a wide
  // opening so nothing can be pinched against them.
  parts.push(
    Bodies.rectangle(60, 400, 150, 12, { ...staticOptions, angle: 0.5 }),
    Bodies.rectangle(WIDTH_UNITS - 60, 400, 150, 12, { ...staticOptions, angle: -0.5 })
  );

  // 3. Two spinning crosses, far enough apart that a marble is never caught
  // between them. This is where the lead usually changes hands.
  for (const [i, y] of [560, 800].entries()) {
    const spinner = Body.create({
      parts: [
        Bodies.rectangle(WIDTH_UNITS / 2, y, 180, 11, staticOptions),
        Bodies.rectangle(WIDTH_UNITS / 2, y, 11, 180, staticOptions),
      ],
      isStatic: true,
    });
    movers.push({
      body: spinner,
      kind: "spin",
      speed: i % 2 === 0 ? 0.02 : -0.028,
      origin: { x: WIDTH_UNITS / 2, y },
      amplitude: 0,
      phase: 0,
    });
    parts.push(spinner);
  }

  // 4. Narrow gates — one staggered gap each, both halves sloping into it so a
  // marble always rolls to the hole instead of parking on a ledge.
  for (const [i, y] of [1000, 1110, 1220].entries()) {
    const gapCentre = i === 1 ? WIDTH_UNITS * 0.72 : WIDTH_UNITS * 0.28;
    const gapWidth = 78;
    const leftWidth = gapCentre - gapWidth / 2;
    const rightWidth = WIDTH_UNITS - gapCentre - gapWidth / 2;
    parts.push(
      Bodies.rectangle(leftWidth / 2, y - leftWidth * 0.21, leftWidth, 12, {
        ...staticOptions,
        angle: 0.42,
      }),
      Bodies.rectangle(WIDTH_UNITS - rightWidth / 2, y - rightWidth * 0.21, rightWidth, 12, {
        ...staticOptions,
        angle: -0.42,
      })
    );
  }

  // 5. Bumper cluster — high restitution, so a marble can be flung back uphill.
  for (const [x, y] of [
    [90, 1360],
    [200, 1410],
    [310, 1360],
    [145, 1480],
    [255, 1480],
  ] as const) {
    parts.push(Bodies.circle(x, y, 16, { ...staticOptions, restitution: 1.2 }));
  }

  // 6. Sliding bars — a moving floor that opens and closes the way through. The
  // sweep stops well short of the walls so nothing gets crushed against them.
  for (const [i, y] of [1600, 1700].entries()) {
    const bar = Bodies.rectangle(WIDTH_UNITS / 2, y, 130, 12, staticOptions);
    movers.push({
      body: bar,
      kind: "slide",
      speed: 0.0018,
      origin: { x: WIDTH_UNITS / 2, y },
      amplitude: 80,
      phase: i * Math.PI,
    });
    parts.push(bar);
  }

  // 7. Final funnel: everyone squeezes through one last opening above the goal.
  parts.push(
    Bodies.rectangle(78, 1810, 200, 12, { ...staticOptions, angle: 0.55 }),
    Bodies.rectangle(WIDTH_UNITS - 78, 1810, 200, 12, { ...staticOptions, angle: -0.55 })
  );

  Composite.add(engine.world, parts);
  return movers;
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
      WIDTH_UNITS / 2 + (i % 5) * 16 - 32,
      -30 - Math.floor(i / 5) * 26,
      MARBLE_RADIUS,
      {
        label: "marble",
        restitution: 0.5,
        friction: 0,
        frictionStatic: 0,
        frictionAir: MARBLE_AIR_FRICTION,
      }
    );
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 0 });
    Composite.add(engine.world, body);
    return { id: candidate.id, label: candidate.label, body };
  });
}

export function advance(engine: Engine, movers: Mover[], deltaMs: number, elapsedMs: number): void {
  for (const mover of movers) {
    if (mover.kind === "spin") {
      Body.setAngle(mover.body, mover.body.angle + mover.speed);
      Body.setAngularVelocity(mover.body, mover.speed);
    } else {
      const x = mover.origin.x + Math.sin(elapsedMs * mover.speed + mover.phase) * mover.amplitude;
      // Setting velocity as well as position lets a resting marble get carried
      // along instead of being scraped off the bar.
      Body.setVelocity(mover.body, { x: (x - mover.body.position.x) / (deltaMs / 16.67), y: 0 });
      Body.setPosition(mover.body, { x, y: mover.origin.y });
    }
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

export function leader(marbles: RaceMarble[]): RaceMarble | null {
  return marbles.length === 0 ? null : lowest(marbles);
}

function lowest(marbles: RaceMarble[]): RaceMarble {
  return marbles.reduce((a, b) => (a.body.position.y >= b.body.position.y ? a : b));
}
