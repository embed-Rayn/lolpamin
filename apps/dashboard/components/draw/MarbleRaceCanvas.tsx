"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Composite, type Engine } from "matter-js";
import type { DrawCandidate } from "@lolpamin/core";
import {
  COURSE_HEIGHT,
  GOAL_Y,
  MARBLE_RADIUS,
  STEP_MS,
  WIDTH_UNITS,
  advance,
  buildCourse,
  clearMarbles,
  createRaceEngine,
  findWinner,
  spawnMarbles,
  type RaceMarble,
  type Spinner,
} from "@/lib/draw/marble-course";
import type { RaceAnimator } from "./animator";

// 07 runs a real marble race the way lazygyu/roulette does: gravity, pegs and
// spinners decide who reaches the goal first and nothing steers a marble. So the
// renderer is what learns the winner, and it hands that back to the screen.
// Course geometry and the finish rule live in lib/draw/marble-course so a vitest
// run can play hundreds of races without a browser.
const SKIP_STEPS_PER_FRAME = 40;
const FLASH_MS = 900;

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
    const spinnersRef = useRef<Spinner[]>([]);
    const raceRef = useRef<Race | null>(null);
    const poolRef = useRef<DrawCandidate[]>(remaining);
    const flashRef = useRef<{ until: number; label: string } | null>(null);

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
        if (!raceRef.current && engineRef.current) clearMarbles(engineRef.current);
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
      spinnersRef.current = buildCourse(engine);

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;

      function resize() {
        const width = canvas!.clientWidth;
        // One scale for both axes — scaling x alone would squash the pegs into
        // ellipses and stretch the labels. The element's height follows the
        // course ratio so the board always fills it exactly.
        const scale = width / WIDTH_UNITS;
        canvas!.style.height = `${COURSE_HEIGHT * scale}px`;
        canvas!.width = width * dpr;
        canvas!.height = COURSE_HEIGHT * scale * dpr;
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

      function step(now: number) {
        const race = raceRef.current;
        if (race) {
          const steps = race.skipping ? SKIP_STEPS_PER_FRAME : 1;
          for (let i = 0; i < steps && raceRef.current; i++) {
            advance(engine, spinnersRef.current, STEP_MS);
            race.elapsed += STEP_MS;
            const winner = findWinner(race.marbles, race.elapsed);
            if (winner) {
              finish(winner);
              break;
            }
          }
        } else {
          advance(engine, spinnersRef.current, STEP_MS);
        }

        if (flashRef.current && now >= flashRef.current.until) flashRef.current = null;
        draw(ctx!, engine, poolRef.current, raceRef.current, flashRef.current);
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
      <div className="mx-auto w-full max-w-[520px]">
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
  flash: { until: number; label: string } | null
): void {
  ctx.clearRect(0, 0, WIDTH_UNITS, COURSE_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,.22)";
  for (const body of Composite.allBodies(engine.world)) {
    if (body.label === "marble") continue;
    const [first, ...rest] = body.vertices;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const vertex of rest) ctx.lineTo(vertex.x, vertex.y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(68,114,196,.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GOAL_Y);
  ctx.lineTo(WIDTH_UNITS, GOAL_Y);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (race) {
    for (const marble of race.marbles) {
      const { x, y } = marble.body.position;
      ctx.beginPath();
      ctx.arc(x, y, MARBLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hueOf(marble.id)} 64% 60%)`;
      ctx.fill();
      ctx.fillStyle = "#E6EAF2";
      ctx.font = "600 9px system-ui, sans-serif";
      ctx.fillText(marble.label, x, y - MARBLE_RADIUS - 7);
    }
  } else {
    ctx.fillStyle = "#8A94A6";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(`대기 중 ${pool.length}명 · 뽑기를 누르면 출발`, WIDTH_UNITS / 2, 24);
  }

  if (flash) {
    ctx.fillStyle = "rgba(14,17,23,.78)";
    ctx.fillRect(0, 0, WIDTH_UNITS, COURSE_HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.fillText(flash.label, WIDTH_UNITS / 2, COURSE_HEIGHT / 2);
  }
}

function hueOf(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}
