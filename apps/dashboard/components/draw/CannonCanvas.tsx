"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { PlaybackAnimator } from "./animator";

// 06 is the 대포뽑기 (cannon draw) from HJPyo/RandomSeqGenerator: a cannon sits
// between two hills, fires one ball per draw, and the ball shrinks as it flies
// off into the distance carrying the drawn name. The winner is still picked by
// the crypto-uniform state machine before the shot — the reference shuffles its
// sequence up front for the same reason — so the animation only plays it back.
const HEIGHT = 420;
const AIM_MS = 320;
const FIRE_MS = 900;
const SHOW_MS = 800;
const FLASH_MS = 130;
const BALL_RADIUS = 34;
const MAX_AMMO_DOTS = 12;

type Phase =
  | { kind: "idle" }
  | { kind: "aim"; start: number; end: number; winner: DrawCandidate }
  | { kind: "fire"; start: number; end: number; winner: DrawCandidate }
  | { kind: "show"; until: number; label: string };

interface Scene {
  width: number;
  muzzle: { x: number; y: number };
  pivot: { x: number; y: number };
  angle: number;
}

export const CannonCanvas = forwardRef<PlaybackAnimator, { remaining: DrawCandidate[] }>(
  function CannonCanvas({ remaining }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef<Phase>({ kind: "idle" });
    const resolveRef = useRef<(() => void) | null>(null);
    const poolRef = useRef<DrawCandidate[]>(remaining);
    const widthRef = useRef(0);

    function scale(ms: number): number {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return reduced ? ms * 0.12 : ms;
    }

    function settle() {
      phaseRef.current = { kind: "idle" };
      resolveRef.current?.();
      resolveRef.current = null;
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        const now = performance.now();
        phaseRef.current = { kind: "aim", start: now, end: now + scale(AIM_MS), winner };
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
        });
      },
      skip: settle,
      sync(candidates) {
        poolRef.current = candidates;
      },
    }));

    useEffect(() => {
      poolRef.current = remaining;
    }, [remaining]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // No 2D context: nothing is drawn, but play() still resolves so the draw
      // itself never stalls.
      if (!ctx) return;

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;

      function resize() {
        const width = canvas!.clientWidth;
        canvas!.width = width * dpr;
        canvas!.height = HEIGHT * dpr;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        widthRef.current = width;
      }
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      function step(now: number) {
        const phase = phaseRef.current;
        if (phase.kind === "aim" && now >= phase.end) {
          phaseRef.current = {
            kind: "fire",
            start: now,
            end: now + scale(FIRE_MS),
            winner: phase.winner,
          };
        } else if (phase.kind === "fire" && now >= phase.end) {
          phaseRef.current = { kind: "show", until: now + scale(SHOW_MS), label: phase.winner.label };
        } else if (phase.kind === "show" && now >= phase.until) {
          settle();
        }

        draw(ctx!, scene(widthRef.current), poolRef.current, phaseRef.current, now);
        frame = requestAnimationFrame(step);
      }

      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT }}
        className="w-full rounded-xl border border-white/[.07] bg-[#12161F]"
      />
    );
  }
);

// The cannon sits on the left hill and fires up and to the right, so the ball
// has the whole sky to shrink into.
function scene(width: number): Scene {
  const angle = -Math.PI / 3.4;
  const pivot = { x: width * 0.26, y: HEIGHT - 88 };
  const barrelLength = 92;
  return {
    width,
    pivot,
    angle,
    muzzle: {
      x: pivot.x + Math.cos(angle) * barrelLength,
      y: pivot.y + Math.sin(angle) * barrelLength,
    },
  };
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  pool: DrawCandidate[],
  phase: Phase,
  now: number
): void {
  ctx.clearRect(0, 0, s.width, HEIGHT);
  drawSky(ctx, s.width);
  drawHills(ctx, s.width);

  const recoil = recoilOffset(phase, now);
  drawCannon(ctx, s, recoil);
  drawAmmo(ctx, s, pool.length);

  if (phase.kind === "fire") {
    const t = clamp01((now - phase.start) / (phase.end - phase.start));
    drawShot(ctx, s, phase.winner, t);
    if (now - phase.start < FLASH_MS) drawMuzzleFlash(ctx, s);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#6E7889";
  ctx.font = "600 11.5px system-ui, sans-serif";
  ctx.fillText(
    phase.kind === "idle" ? `장전 ${pool.length}발 · 뽑기를 누르면 발사` : "발사!",
    s.width / 2,
    22
  );

  if (phase.kind === "show") {
    ctx.fillStyle = "rgba(14,17,23,.78)";
    ctx.fillRect(0, 0, s.width, HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(phase.label, s.width / 2, HEIGHT / 2);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, width: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#141A26");
  sky.addColorStop(1, "#10141D");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, HEIGHT);
}

function drawHills(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.fillStyle = "#1B2130";
  ctx.beginPath();
  ctx.moveTo(-20, HEIGHT);
  ctx.quadraticCurveTo(width * 0.22, HEIGHT - 150, width * 0.52, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#161B26";
  ctx.beginPath();
  ctx.moveTo(width * 0.48, HEIGHT);
  ctx.quadraticCurveTo(width * 0.78, HEIGHT - 116, width + 20, HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawCannon(ctx: CanvasRenderingContext2D, s: Scene, recoil: number): void {
  ctx.save();
  ctx.translate(s.pivot.x, s.pivot.y);
  ctx.rotate(s.angle);
  ctx.translate(-recoil, 0);

  ctx.fillStyle = "#3A4356";
  roundedRect(ctx, -18, -14, 110, 28, 8);
  ctx.fill();

  ctx.fillStyle = "#4E5A72";
  roundedRect(ctx, 78, -16, 14, 32, 5);
  ctx.fill();
  ctx.restore();

  // Carriage: a wheel and a wedge so the barrel does not float.
  ctx.fillStyle = "#2A3244";
  ctx.beginPath();
  ctx.arc(s.pivot.x - 4, s.pivot.y + 20, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#46506680";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#232B3A";
  ctx.beginPath();
  ctx.moveTo(s.pivot.x - 26, s.pivot.y + 34);
  ctx.lineTo(s.pivot.x + 30, s.pivot.y + 34);
  ctx.lineTo(s.pivot.x + 6, s.pivot.y + 4);
  ctx.closePath();
  ctx.fill();
}

// Balls still in the pool, piled next to the cannon.
function drawAmmo(ctx: CanvasRenderingContext2D, s: Scene, count: number): void {
  const dots = Math.min(count, MAX_AMMO_DOTS);
  const baseX = s.pivot.x + 66;
  const baseY = HEIGHT - 34;
  for (let i = 0; i < dots; i++) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    ctx.beginPath();
    ctx.arc(baseX + col * 17 - row * 8, baseY - row * 15, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#4472C4";
    ctx.fill();
  }
  if (count > MAX_AMMO_DOTS) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8A94A6";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(`+${count - MAX_AMMO_DOTS}`, baseX + 6 * 17 - 4, baseY);
  }
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, s: Scene): void {
  const flash = ctx.createRadialGradient(s.muzzle.x, s.muzzle.y, 2, s.muzzle.x, s.muzzle.y, 46);
  flash.addColorStop(0, "rgba(255,214,140,.95)");
  flash.addColorStop(1, "rgba(255,160,60,0)");
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(s.muzzle.x, s.muzzle.y, 46, 0, Math.PI * 2);
  ctx.fill();
}

// The shot follows a shallow arc to the upper right and shrinks as it goes, the
// way the reference shrinks its ball to simulate distance.
function drawShot(ctx: CanvasRenderingContext2D, s: Scene, winner: DrawCandidate, t: number): void {
  const targetX = s.width * 0.82;
  const targetY = 74;
  const x = lerp(s.muzzle.x, targetX, t);
  const y = lerp(s.muzzle.y, targetY, t) - Math.sin(t * Math.PI) * 46;
  const radius = BALL_RADIUS * (1 - 0.62 * t);

  const skin = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.2, x, y, radius);
  skin.addColorStop(0, "#8FD98C");
  skin.addColorStop(1, "#127909");
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F5D76E";
  ctx.font = `700 ${Math.max(9, radius * 0.42)}px system-ui, sans-serif`;
  ctx.fillText(fit(ctx, winner.label, radius * 1.9), x, y - radius - 12);
}

function recoilOffset(phase: Phase, now: number): number {
  if (phase.kind === "aim") {
    return 10 * clamp01((now - phase.start) / (phase.end - phase.start));
  }
  if (phase.kind === "fire") {
    // Snap forward on the shot, then ease back over the first third of the flight.
    const t = clamp01((now - phase.start) / (phase.end - phase.start));
    return 10 * Math.max(0, 1 - t * 3);
  }
  return 0;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let cut = label;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
