import { Bodies, Body, Composite, Engine } from "matter-js";

// The 07 course is authored in fixed units and scaled to the canvas at draw time,
// so the physics behaves identically at any window size. Keeping it out of the
// component is what makes the race testable head-less: a vitest run can play a
// few hundred races and prove that one always finishes.
export const WIDTH_UNITS = 400;
// The course is far taller than the canvas — the view scrolls with the leader.
// A long fall is what gives the race its tension: lead changes, near-misses at
// the gates, and a bottleneck right before the goal.
export const COURSE_HEIGHT = 2740;
export const VIEW_HEIGHT = 520;
export const MARBLE_RADIUS = 9;
export const GOAL_Y = COURSE_HEIGHT - 40;
export const STEP_MS = 1000 / 60;
export const MAX_RACE_MS = 90_000;

// Gravity is deliberately low and the marbles carry air drag, so they drift down
// at a readable pace instead of dropping like stones. Cutting it to 0.5 puts the
// fall at roughly 70% of the speed it ran at before.
const GRAVITY_Y = 0.4;
const MARBLE_AIR_FRICTION = 0.004;
// The gates funnel onto this column and the bumper cluster sits under it.
const BUMPER_CENTRE_X = 200;

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

  // 4. Narrow gates — one staggered gap each, and the last one aims straight at
  // the bumpers below. Each half is a wavy chain rather than a flat plank: the
  // ripples make the bounce direction unpredictable while the overall slope
  // still carries a marble down to the hole instead of parking it on a ledge.
  for (const [i, y] of [1000, 1110, 1220].entries()) {
    const gapCentre = [WIDTH_UNITS * 0.3, WIDTH_UNITS * 0.72, BUMPER_CENTRE_X][i];
    const gapWidth = 78;
    parts.push(
      ...wavyBarrier(0, gapCentre - gapWidth / 2, y, 1, staticOptions),
      ...wavyBarrier(gapCentre + gapWidth / 2, WIDTH_UNITS, y, -1, staticOptions)
    );
  }

  // 5. Bumper cluster — high restitution, so a marble can be flung back uphill.
  // The gate above drops the pack right onto the middle bumper.
  for (const [x, y] of [
    [BUMPER_CENTRE_X - 110, 1360],
    [BUMPER_CENTRE_X, 1410],
    [BUMPER_CENTRE_X + 110, 1360],
    [BUMPER_CENTRE_X - 55, 1480],
    [BUMPER_CENTRE_X + 55, 1480],
  ] as const) {
    parts.push(Bodies.circle(x, y, 16, { ...staticOptions, restitution: 1.2 }));
  }

  // 6. Second peg field — a long, quiet stretch that lets the order settle
  // before the moving obstacles scramble it again.
  for (const [row, y] of [1580, 1625, 1670, 1715].entries()) {
    const offset = row % 2 === 0 ? 22 : 0;
    for (let x = 28 + offset; x < WIDTH_UNITS - 16; x += 44) {
      parts.push(Bodies.circle(x, y, 5, { ...staticOptions, restitution: 0.5 }));
    }
  }

  // 7. Sliding bars — a moving floor that opens and closes the way through. The
  // sweep stops well short of the walls so nothing gets crushed against them.
  for (const [i, y] of [1830, 1930].entries()) {
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

  // 8. One more spinning cross plus a single gate — the stretch that turns a
  // runaway lead back into a pack.
  {
    const y = 2060;
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
      speed: 0.026,
      origin: { x: WIDTH_UNITS / 2, y },
      amplitude: 0,
      phase: 0,
    });
    parts.push(spinner);

    const gapCentre = WIDTH_UNITS * 0.5;
    const halfWidth = gapCentre - 45;
    parts.push(
      Bodies.rectangle(halfWidth / 2, 2260 - halfWidth * 0.21, halfWidth, 12, {
        ...staticOptions,
        angle: 0.42,
      }),
      Bodies.rectangle(WIDTH_UNITS - halfWidth / 2, 2260 - halfWidth * 0.21, halfWidth, 12, {
        ...staticOptions,
        angle: -0.42,
      })
    );
  }

  // 9. Paddle wheels — the last big shuffle. A marble drops between two blades,
  // gets carried around and is tipped back out a beat later, so a comfortable
  // lead can evaporate right before the goal. The blades are thin and
  // frictionless, so nothing can be held for more than part of a turn.
  for (const [i, x] of [118, WIDTH_UNITS - 118].entries()) {
    const y = 2440;
    const blades = Array.from({ length: 6 }, (_, blade) =>
      Bodies.rectangle(x, y, 158, 9, {
        ...staticOptions,
        angle: (Math.PI / 6) * blade,
      })
    );
    const wheel = Body.create({ parts: blades, isStatic: true });
    movers.push({
      body: wheel,
      kind: "spin",
      speed: i === 0 ? 0.011 : -0.011,
      origin: { x, y },
      amplitude: 0,
      phase: 0,
    });
    parts.push(wheel);
  }
  // A shallow ridge under each wheel so a marble has to ride it rather than roll
  // straight past the side.
  parts.push(
    Bodies.rectangle(40, 2525, 120, 10, { ...staticOptions, angle: -0.3 }),
    Bodies.rectangle(WIDTH_UNITS - 40, 2525, 120, 10, { ...staticOptions, angle: 0.3 })
  );

  // 10. Final funnel: everyone squeezes through one last opening above the goal.
  parts.push(
    Bodies.rectangle(78, 2615, 200, 12, { ...staticOptions, angle: 0.55 }),
    Bodies.rectangle(WIDTH_UNITS - 78, 2615, 200, 12, { ...staticOptions, angle: -0.55 })
  );

  Composite.add(engine.world, parts);
  return movers;
}

// A gate half built from short overlapping segments that ripple around a steady
// downhill slope. `direction` is +1 for a barrier that drains to the right and
// -1 for one that drains to the left.
function wavyBarrier(
  fromX: number,
  toX: number,
  baseY: number,
  direction: 1 | -1,
  options: object
): Body[] {
  const span = toX - fromX;
  if (span < 24) return [];
  const segments = Math.max(2, Math.round(span / 42));
  const segmentWidth = (span / segments) * 1.25;
  const slope = 0.42;
  const bodies: Body[] = [];

  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const x = fromX + span * t;
    // Height falls steadily toward the gap; the ripple only tilts each segment,
    // so every part of the chain still drains downhill.
    const drop = direction === 1 ? (t - 0.5) * span * slope : (0.5 - t) * span * slope;
    const ripple = Math.sin(t * Math.PI * 2.5) * 7;
    bodies.push(
      Bodies.rectangle(x, baseY + drop + ripple, segmentWidth, 11, {
        ...options,
        angle: direction * slope + Math.cos(t * Math.PI * 2.5) * 0.22,
      })
    );
  }
  return bodies;
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
