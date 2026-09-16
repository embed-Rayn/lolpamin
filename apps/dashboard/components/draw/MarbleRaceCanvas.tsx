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
  findFinishers,
  findWinner,
  leader,
  spawnMarbles,
  type Mover,
  type RaceMarble,
} from "@/lib/draw/marble-course";
import { drainBudget, frameBudget } from "@/lib/draw/speed";
import type { RaceAnimator } from "./animator";

// 07 runs a real marble race the way lazygyu/roulette does: gravity, pegs,
// spinners and moving bars decide who reaches the goal first and nothing steers
// a marble. So the renderer is what learns the winner, and it hands that back to
// the screen. The course is several screens tall, so the view scrolls with the
// leader and a rail on the right shows where everyone is on the whole drop.
// Course geometry and the finish rule live in lib/draw/marble-course so a vitest
// run can play hundreds of races without a browser.
const SKIP_STEPS_PER_FRAME = 40;
// 한 프레임이 돌 물리 스텝의 상한. 정상 동작에서는 닿지 않는다 — 4배속에 프레임 상한
// 100ms를 다 써도 24스텝이다. 예산 계산이 어긋났을 때 브라우저가 멎지 않게 하는 빗장이다.
const MAX_STEPS_PER_FRAME = 30;
const FLASH_MS = 1100;
// 팀 뽑기는 한 명 들어올 때마다 알리되 레이스를 가리지 않도록 짧게, 어둡게 하지 않고 띄운다.
const FINISH_FLASH_MS = 700;
const CAMERA_EASE = 0.12;
const RAIL_WIDTH = 26;

interface Race {
  marbles: RaceMarble[];
  elapsed: number;
  skipping: boolean;
  // "first" ends at the first crossing; "all" records every crossing and ends
  // once the field is home (or the time cap ranks the stragglers).
  until: "first" | "all";
  finished: string[];
  onFinish?: (order: DrawCandidate[]) => void;
  resolve: (order: DrawCandidate[]) => void;
}

interface Flash {
  until: number;
  label: string;
  dim: boolean;
}

// The marbles still on the course — in an "all" race the ones already home sit
// below the goal and must not count as the leader.
function racing(race: Race): RaceMarble[] {
  if (race.until === "first") return race.marbles;
  const done = new Set(race.finished);
  return race.marbles.filter((m) => !done.has(m.id));
}

export const MarbleRaceCanvas = forwardRef<
  RaceAnimator,
  { remaining: DrawCandidate[]; speed: number }
>(
  function MarbleRaceCanvas({ remaining, speed }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const moversRef = useRef<Mover[]>([]);
    const raceRef = useRef<Race | null>(null);
    const poolRef = useRef<DrawCandidate[]>(remaining);
    const flashRef = useRef<Flash | null>(null);
    const cameraRef = useRef(0);
    // rAF 루프는 마운트 때 한 번 만들어져 닫힌 값을 계속 본다. 배속은 레이스 도중에도
    // 바뀌므로 ref로 넘겨야 다음 프레임부터 바로 먹는다.
    const speedRef = useRef(speed);

    function reducedMotion(): boolean {
      return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

    function startRace(
      until: Race["until"],
      onFinish?: (order: DrawCandidate[]) => void
    ): Promise<DrawCandidate[]> {
      const engine = engineRef.current;
      const pool = poolRef.current;
      return new Promise<DrawCandidate[]>((resolve) => {
        if (!engine || pool.length === 0) {
          // No 2D context (so no engine) or an empty pool: resolve immediately
          // rather than leaving the button spinning forever.
          resolve(until === "first" ? pool.slice(0, 1) : pool);
          return;
        }
        cameraRef.current = 0;
        raceRef.current = {
          marbles: spawnMarbles(engine, pool),
          elapsed: 0,
          // reduced-motion이라고 레이스를 건너뛰지 않는다. 그건 결과를 못 보게 만드는
          // 것이지 움직임을 줄이는 게 아니다 — 대신 DrawScreen이 초기 배속을 올린다.
          skipping: false,
          until,
          finished: [],
          onFinish,
          resolve,
        };
      });
    }

    useImperativeHandle(ref, () => ({
      async race() {
        const [winner] = await startRace("first");
        return winner;
      },
      raceAll(onFinish) {
        return startRace("all", onFinish);
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
      speedRef.current = speed;
    }, [speed]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const engine = createRaceEngine();
      engineRef.current = engine;
      moversRef.current = buildCourse(engine);

      let frame = 0;
      // 시간 기반 루프의 상태. lastNow가 null인 첫 프레임은 delta를 0으로 둔다.
      let lastNow: number | null = null;
      let budget = 0;
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

      function toOrder(race: Race, ids: string[]): DrawCandidate[] {
        const byId = new Map(race.marbles.map((m) => [m.id, m]));
        return ids.map((id) => ({ id, label: byId.get(id)!.label }));
      }

      function finish(race: Race, order: DrawCandidate[]) {
        raceRef.current = null;
        if (race.until === "first") {
          flashRef.current = {
            until: performance.now() + (reducedMotion() ? 200 : FLASH_MS),
            label: order[0].label,
            dim: true,
          };
        }
        race.resolve(order);
      }

      // 한 스텝 진행한다. 레이스가 끝났으면 true.
      function advanceRace(race: Race): boolean {
        advance(engine, moversRef.current, STEP_MS, race.elapsed);
        race.elapsed += STEP_MS;
        if (race.until === "first") {
          const winner = findWinner(race.marbles, race.elapsed);
          if (!winner) return false;
          finish(race, [{ id: winner.id, label: winner.label }]);
          return true;
        }
        const next = findFinishers(race.marbles, race.finished, race.elapsed);
        if (next.length === race.finished.length) return false;
        race.finished = next;
        const order = toOrder(race, next);
        const latest = order[order.length - 1];
        flashRef.current = {
          until: performance.now() + (reducedMotion() ? 200 : FINISH_FLASH_MS),
          label: `${order.length}등 ${latest.label}`,
          dim: false,
        };
        race.onFinish?.(order);
        if (next.length < race.marbles.length) return false;
        finish(race, order);
        return true;
      }

      function trackCamera(race: Race | null, snap: boolean) {
        const front = race ? leader(racing(race)) : null;
        const target = front
          ? clamp(front.body.position.y - VIEW_HEIGHT * 0.45, 0, COURSE_HEIGHT - VIEW_HEIGHT)
          : 0;
        cameraRef.current = snap
          ? target
          : cameraRef.current + (target - cameraRef.current) * CAMERA_EASE;
      }

      function step(now: number) {
        const race = raceRef.current;
        const delta = lastNow === null ? 0 : now - lastNow;
        lastNow = now;

        if (race?.skipping) {
          // 스킵은 결과를 지금 보겠다는 조작이라 실시간·배속과 무관하게 최대 속도로 돈다.
          budget = 0;
          for (let i = 0; i < SKIP_STEPS_PER_FRAME && raceRef.current; i++) {
            if (advanceRace(race)) break;
          }
        } else {
          // 프레임당 한 스텝이 아니라 실제 경과 시간만큼 돌린다. 그래야 144Hz 모니터에서
          // 레이스가 2.4배 빨라지지 않고, 배속이 화면과 무관하게 같은 뜻을 갖는다.
          budget += frameBudget(delta, speedRef.current);
          const drained = drainBudget(budget, STEP_MS, MAX_STEPS_PER_FRAME);
          budget = drained.rest;
          for (let i = 0; i < drained.steps; i++) {
            if (!race) {
              advance(engine, moversRef.current, STEP_MS, now);
            } else if (!raceRef.current || advanceRace(race)) {
              break;
            }
          }
        }

        trackCamera(raceRef.current, race?.skipping ?? false);

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
  flash: Flash | null,
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
    const front = leader(racing(race));
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
    const front = leader(racing(race));
    const progress = front ? Math.round((front.body.position.y / GOAL_Y) * 100) : 0;
    const home = race.until === "all" ? ` · 통과 ${race.finished.length}/${race.marbles.length}` : "";
    ctx.fillStyle = "#F5D76E";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(
      `선두 ${front?.label ?? "-"} · ${clamp(progress, 0, 100)}%${home}`,
      WIDTH_UNITS / 2,
      22
    );
  }

  if (flash) {
    if (flash.dim) {
      ctx.fillStyle = "rgba(14,17,23,.8)";
      ctx.fillRect(0, 0, WIDTH_UNITS + RAIL_WIDTH, VIEW_HEIGHT);
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${flash.dim ? 38 : 26}px system-ui, sans-serif`;
    if (!flash.dim) {
      ctx.shadowColor = "rgba(0,0,0,.9)";
      ctx.shadowBlur = 12;
    }
    ctx.fillText(flash.label, (WIDTH_UNITS + RAIL_WIDTH) / 2, VIEW_HEIGHT / 2);
    ctx.shadowBlur = 0;
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
