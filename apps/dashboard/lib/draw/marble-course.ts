import { Bodies, Body, Composite, Engine, Events } from "matter-js";

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
const GRAVITY_Y = 0.45;
const MARBLE_AIR_FRICTION = 0.004;
// The gates funnel onto this column and the bumper cluster sits under it.
const BUMPER_CENTRE_X = 200;
// Matter's restitution saturates around 1 — a bumper set to 2 or 4 bounces no
// harder than one set to 1.2. A pinball kick has to be applied by hand, so every
// marble that touches a bumper leaves it at this speed, straight outward.
export const BUMPER_KICK = 6;

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
    for (let x = 44 + offset; x < WIDTH_UNITS - 44; x += 44) {
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

  // 5. Bumper field — restitution 2 gives back more than it takes, so a marble
  // can be kicked hard enough to climb back up through the cluster. The gate
  // above drops the pack right onto the middle column.
  for (const [row, y] of [1350, 1425, 1500].entries()) {
    const offset = row % 2 === 0 ? 0 : 50;
    for (let x = BUMPER_CENTRE_X - 150 + offset; x <= BUMPER_CENTRE_X + 150; x += 100) {
      parts.push(Bodies.circle(x, y, 16, { ...staticOptions, label: "bumper", restitution: 1 }));
    }
  }

  // 6. Second peg field — a long, quiet stretch that lets the order settle
  // before the moving obstacles scramble it again.
  for (const [row, y] of [1580, 1625, 1670, 1715].entries()) {
    const offset = row % 2 === 0 ? 22 : 0;
    for (let x = 44 + offset; x < WIDTH_UNITS - 44; x += 44) {
      parts.push(Bodies.circle(x, y, 5, { ...staticOptions, restitution: 0.5 }));
    }
  }

  // 7. Sliding bars — a moving floor that opens and closes the way through. The
  // sweep stops well short of the walls so nothing gets crushed against them.
  for (const [i, y] of [1830, 1930].entries()) {
    // Tilted, because a marble resting on a flat frictionless bar never rolls off.
    const bar = Bodies.rectangle(WIDTH_UNITS / 2, y, 130, 12, {
      ...staticOptions,
      angle: i % 2 === 0 ? 0.16 : -0.16,
    });
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
    Bodies.rectangle(40, 2525, 120, 10, { ...staticOptions, angle: 0.3 }),
    Bodies.rectangle(WIDTH_UNITS - 40, 2525, 120, 10, { ...staticOptions, angle: -0.3 })
  );

  // 10. Final funnel: everyone squeezes through one last opening above the goal,
  // with a single bumper sitting in the mouth of it. Arriving dead centre is the
  // one thing you do not want on the last obstacle.
  parts.push(
    // The mouth is widened to leave a marble-sized lane on each side of the
    // bumper — at the old width the bumper simply corked the funnel.
    Bodies.rectangle(48, 2615, 200, 12, { ...staticOptions, angle: 0.55 }),
    Bodies.rectangle(WIDTH_UNITS - 48, 2615, 200, 12, { ...staticOptions, angle: -0.55 }),
    Bodies.circle(WIDTH_UNITS / 2, 2660, 16, { ...staticOptions, label: "bumper", restitution: 1 })
  );

  Composite.add(engine.world, parts);
  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const marble = pair.bodyA.label === "marble" ? pair.bodyA : pair.bodyB;
      const bumper = pair.bodyA.label === "bumper" ? pair.bodyA : pair.bodyB;
      if (marble.label !== "marble" || bumper.label !== "bumper") continue;
      const dx = marble.position.x - bumper.position.x;
      const dy = marble.position.y - bumper.position.y;
      const length = Math.hypot(dx, dy) || 1;
      Body.setVelocity(marble, {
        x: (dx / length) * BUMPER_KICK,
        y: (dy / length) * BUMPER_KICK,
      });
    }
  });
  return movers;
}

// A gate half built from short segments chained end to end. Each segment tilts a
// little differently so the bounce direction is unpredictable, but every one of
// them points downhill and each starts where the last ended: the surface only
// ever descends toward the gap. A ripple in the segment *heights* would dig a
// concave pocket, and a frictionless marble that settles in one never leaves.
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
  const length = span / segments;
  const bodies: Body[] = [];

  // Walk from the wall end down to the gap, so the chain starts high and ends low.
  let x = direction === 1 ? fromX : toX;
  let y = baseY - (span / 2) * 0.42;
  for (let i = 0; i < segments; i++) {
    const wobble = Math.sin(((i + 0.5) / segments) * Math.PI * 2.5) * 0.2;
    const angle = 0.42 + wobble;
    const dx = direction * length;
    const dy = Math.abs(dx) * Math.tan(angle);
    bodies.push(
      Bodies.rectangle(x + dx / 2, y + dy / 2, length * 1.3, 11, {
        ...options,
        angle: direction * angle,
      })
    );
    x += dx;
    y += dy;
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
