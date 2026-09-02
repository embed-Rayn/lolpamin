"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Composite, type Engine } from "matter-js";
import type { DrawCandidate } from "@lolpamin/core";
import {
  COURSE_HEIGHT,
  GOAL_Y,
  MARBLE_RADIUS,
  STEP_MS,
  VIEW_HEIGHT,
  WIDTH_UNITS,
  advance,
  buildCourse,
  clearMarbles,
  createRaceEngine,
  findWinner,
  leader,
  spawnMarbles,
  type Mover,
  type RaceMarble,
} from "@/lib/draw/marble-course";
import type { RaceAnimator } from "./animator";

// 07 runs a real marble race the way lazygyu/roulette does: gravity, pegs,
// spinners and moving bars decide who reaches the goal first and nothing steers
// a marble. So the renderer is what learns the winner, and it hands that back to
// the screen. The course is several screens tall, so the view scrolls with the
// leader and a rail on the right shows where everyone is on the whole drop.
// Course geometry and the finish rule live in lib/draw/marble-course so a vitest
// run can play hundreds of races without a browser.
const SKIP_STEPS_PER_FRAME = 40;
const FLASH_MS = 1100;
const CAMERA_EASE = 0.12;
const RAIL_WIDTH = 26;

interface Race {
  marbles: RaceMarble[];
  elapsed: number;
  skipping: boolean;
  resolve: (winner: DrawCandidate) => void;
}

export const MarbleRaceCanvas = forwardRef<RaceAnimator, { remaining: DrawCandidate[] }>(
  function MarbleRaceCanvas({ remaining }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const moversRef = useRef<Mover[]>([]);
    const raceRef = useRef<Race | null>(null);
    const poolRef = useRef<DrawCandidate[]>(remaining);
    const flashRef = useRef<{ until: number; label: string } | null>(null);
    const cameraRef = useRef(0);

    function reducedMotion(): boolean {
      return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

    useImperativeHandle(ref, () => ({
      race() {
        const engine = engineRef.current;
        const pool = poolRef.current;
        return new Promise<DrawCandidate>((resolve) => {
          if (!engine || pool.length === 0) {
            // No 2D context (so no engine) or an empty pool: resolve immediately
            // rather than leaving the button spinning forever.
            resolve(pool[0]);
            return;
          }
          cameraRef.current = 0;
          raceRef.current = {
            marbles: spawnMarbles(engine, pool),
            elapsed: 0,
            skipping: reducedMotion(),
            resolve,
          };
        });
      },
      skip() {
        if (raceRef.current) raceRef.current.skipping = true;
      },
      sync(candidates) {
        poolRef.current = candidates;
        if (!raceRef.current && engineRef.current) {
          clearMarbles(engineRef.current);
          cameraRef.current = 0;
        }
      },
    }));

    useEffect(() => {
      poolRef.current = remaining;
    }, [remaining]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const engine = createRaceEngine();
      engineRef.current = engine;
      moversRef.current = buildCourse(engine);

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;
      let scale = 1;

      function resize() {
        const width = canvas!.clientWidth;
        // One scale for both axes — scaling x alone would squash the pegs into
        // ellipses. The element's height follows the viewport ratio.
        scale = width / (WIDTH_UNITS + RAIL_WIDTH);
        canvas!.style.height = `${VIEW_HEIGHT * scale}px`;
        canvas!.width = width * dpr;
        canvas!.height = VIEW_HEIGHT * scale * dpr;
        ctx!.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      }
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      function finish(winner: RaceMarble) {
        const race = raceRef.current;
        raceRef.current = null;
        flashRef.current = {
          until: performance.now() + (reducedMotion() ? 200 : FLASH_MS),
          label: winner.label,
        };
        race?.resolve({ id: winner.id, label: winner.label });
      }

      function trackCamera(race: Race | null, snap: boolean) {
        const front = race ? leader(race.marbles) : null;
        const target = front
          ? clamp(front.body.position.y - VIEW_HEIGHT * 0.45, 0, COURSE_HEIGHT - VIEW_HEIGHT)
          : 0;
        cameraRef.current = snap
          ? target
          : cameraRef.current + (target - cameraRef.current) * CAMERA_EASE;
      }

      function step(now: number) {
        const race = raceRef.current;
        if (race) {
          const steps = race.skipping ? SKIP_STEPS_PER_FRAME : 1;
          for (let i = 0; i < steps && raceRef.current; i++) {
            advance(engine, moversRef.current, STEP_MS, race.elapsed);
            race.elapsed += STEP_MS;
            const winner = findWinner(race.marbles, race.elapsed);
            if (winner) {
              finish(winner);
              break;
            }
          }
          trackCamera(raceRef.current, race.skipping);
        } else {
          advance(engine, moversRef.current, STEP_MS, now);
          trackCamera(null, false);
        }

        if (flashRef.current && now >= flashRef.current.until) flashRef.current = null;
        draw(ctx!, engine, poolRef.current, raceRef.current, flashRef.current, cameraRef.current);
        frame = requestAnimationFrame(step);
      }

      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        engineRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div className="mx-auto w-full max-w-[460px]">
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-white/[.07] bg-[#12161F]"
        />
      </div>
    );
  }
);

function draw(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  pool: DrawCandidate[],
  race: Race | null,
  flash: { until: number; label: string } | null,
  cameraY: number
): void {
  ctx.clearRect(0, 0, WIDTH_UNITS + RAIL_WIDTH, VIEW_HEIGHT);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH_UNITS, VIEW_HEIGHT);
  ctx.clip();
  ctx.translate(0, -cameraY);

  drawDepthMarks(ctx, cameraY);

  for (const body of Composite.allBodies(engine.world)) {
    if (body.label === "marble") continue;
    // Cull anything outside the visible slice — the course is five screens tall.
    if (body.bounds.max.y < cameraY - 40 || body.bounds.min.y > cameraY + VIEW_HEIGHT + 40) continue;
    // Bumpers kick hard, so they are the one obstacle worth calling out by colour.
    const isBumper = body.label === "bumper";
    ctx.fillStyle = isBumper ? "#E0603C" : "rgba(255,255,255,.22)";
    for (const part of body.parts.length > 1 ? body.parts.slice(1) : body.parts) {
      const [first, ...rest] = part.vertices;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const vertex of rest) ctx.lineTo(vertex.x, vertex.y);
      ctx.closePath();
      ctx.fill();
      if (isBumper) {
        ctx.strokeStyle = "#FFC48A";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  ctx.strokeStyle = "rgba(68,114,196,.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GOAL_Y);
  ctx.lineTo(WIDTH_UNITS, GOAL_Y);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (race) {
    const front = leader(race.marbles);
    for (const marble of race.marbles) {
      const { x, y } = marble.body.position;
      if (y < cameraY - 30 || y > cameraY + VIEW_HEIGHT + 30) continue;
      const isLeader = front?.id === marble.id;
      ctx.beginPath();
      ctx.arc(x, y, MARBLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hueOf(marble.id)} 64% 60%)`;
      ctx.fill();
      if (isLeader) {
        ctx.strokeStyle = "#F5D76E";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.fillStyle = isLeader ? "#F5D76E" : "#C7D0DF";
      ctx.font = `${isLeader ? "700" : "600"} 9px system-ui, sans-serif`;
      ctx.fillText(marble.label, x, y - MARBLE_RADIUS - 7);
    }
  }
  ctx.restore();

  drawRail(ctx, race);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!race) {
    ctx.fillStyle = "#8A94A6";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(`대기 중 ${pool.length}명 · 뽑기를 누르면 출발`, WIDTH_UNITS / 2, 22);
  } else {
    const front = leader(race.marbles);
    const progress = front ? Math.round((front.body.position.y / GOAL_Y) * 100) : 0;
    ctx.fillStyle = "#F5D76E";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(`선두 ${front?.label ?? "-"} · ${clamp(progress, 0, 100)}%`, WIDTH_UNITS / 2, 22);
  }

  if (flash) {
    ctx.fillStyle = "rgba(14,17,23,.8)";
    ctx.fillRect(0, 0, WIDTH_UNITS + RAIL_WIDTH, VIEW_HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 38px system-ui, sans-serif";
    ctx.fillText(flash.label, (WIDTH_UNITS + RAIL_WIDTH) / 2, VIEW_HEIGHT / 2);
  }
}

// Faint depth ticks so the scroll reads as descent rather than drift.
function drawDepthMarks(ctx: CanvasRenderingContext2D, cameraY: number): void {
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  ctx.lineWidth = 1;
  const first = Math.floor(cameraY / 100) * 100;
  for (let y = first; y < cameraY + VIEW_HEIGHT + 100; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH_UNITS, y);
    ctx.stroke();
  }
}

// The rail is the whole course squeezed into one strip: how far down everyone is
// and how much drop is left.
function drawRail(ctx: CanvasRenderingContext2D, race: Race | null): void {
  const x = WIDTH_UNITS + RAIL_WIDTH / 2;
  const top = 34;
  const bottom = VIEW_HEIGHT - 18;

  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(68,114,196,.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 7, bottom);
  ctx.lineTo(x + 7, bottom);
  ctx.stroke();

  if (!race) return;
  for (const marble of race.marbles) {
    const t = clamp(marble.body.position.y / GOAL_Y, 0, 1);
    ctx.beginPath();
    ctx.arc(x, top + (bottom - top) * t, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hueOf(marble.id)} 64% 60%)`;
    ctx.fill();
  }
}

function hueOf(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
