"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { PlaybackAnimator } from "./animator";

interface Ball {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "stir"; until: number; winnerId: string }
  | { kind: "eject"; start: number; end: number; from: { x: number; y: number }; winnerId: string }
  | { kind: "show"; until: number; label: string };

const RADIUS = 24;
const SPEED = 2.4;
const HEIGHT = 420;
const STIR_MS = 600;
const EJECT_MS = 1000;
const SHOW_MS = 800;

export const BallLotteryCanvas = forwardRef<PlaybackAnimator, { remaining: DrawCandidate[] }>(
  function BallLotteryCanvas({ remaining }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ballsRef = useRef<Ball[]>([]);
    const phaseRef = useRef<Phase>({ kind: "idle" });
    const resolveRef = useRef<(() => void) | null>(null);
    const sizeRef = useRef({ width: 0, height: HEIGHT });

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

    function syncBalls(candidates: DrawCandidate[]) {
      const { width, height } = sizeRef.current;
      const previous = new Map(ballsRef.current.map((b) => [b.id, b]));
      ballsRef.current = candidates.map((c) => {
        const existing = previous.get(c.id);
        if (existing) return { ...existing, label: c.label };
        const angle = Math.random() * Math.PI * 2;
        return {
          id: c.id,
          label: c.label,
          x: RADIUS + Math.random() * Math.max(1, width - RADIUS * 2),
          y: RADIUS + Math.random() * Math.max(1, height - RADIUS * 2),
          vx: Math.cos(angle) * SPEED,
          vy: Math.sin(angle) * SPEED,
          hue: hueOf(c.id),
        };
      });
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        phaseRef.current = {
          kind: "stir",
          until: performance.now() + scale(STIR_MS),
          winnerId: winner.id,
        };
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
        });
      },
      skip: settle,
      sync: syncBalls,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // A browser with no 2D context draws nothing but still resolves play(), so
      // the draw itself never stalls.
      if (!ctx) return;

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;

      function resize() {
        const width = canvas!.clientWidth;
        canvas!.width = width * dpr;
        canvas!.height = HEIGHT * dpr;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { width, height: HEIGHT };
      }
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      syncBalls(remaining);

      function step(now: number) {
        const { width, height } = sizeRef.current;
        const phase = phaseRef.current;
        const boost = phase.kind === "stir" ? 2.2 : 1;

        for (const ball of ballsRef.current) {
          if (phase.kind === "eject" && ball.id === phase.winnerId) continue;
          ball.x += ball.vx * boost;
          ball.y += ball.vy * boost;
          if (ball.x < RADIUS || ball.x > width - RADIUS) {
            ball.vx *= -1;
            ball.x = Math.min(width - RADIUS, Math.max(RADIUS, ball.x));
          }
          if (ball.y < RADIUS || ball.y > height - RADIUS) {
            ball.vy *= -1;
            ball.y = Math.min(height - RADIUS, Math.max(RADIUS, ball.y));
          }
        }
        separate(ballsRef.current);

        if (phase.kind === "stir" && now >= phase.until) {
          const winner = ballsRef.current.find((b) => b.id === phase.winnerId);
          phaseRef.current = {
            kind: "eject",
            start: now,
            end: now + scale(EJECT_MS),
            from: winner ? { x: winner.x, y: winner.y } : { x: width / 2, y: height / 2 },
            winnerId: phase.winnerId,
          };
        } else if (phase.kind === "eject") {
          const winner = ballsRef.current.find((b) => b.id === phase.winnerId);
          const t = clamp01((now - phase.start) / (phase.end - phase.start));
          if (winner) {
            winner.x = lerp(phase.from.x, width / 2, t);
            winner.y = lerp(phase.from.y, height + RADIUS * 2, t);
          }
          if (t >= 1) {
            phaseRef.current = {
              kind: "show",
              until: now + scale(SHOW_MS),
              label: winner?.label ?? "",
            };
          }
        } else if (phase.kind === "show" && now >= phase.until) {
          settle();
        }

        draw(ctx!, ballsRef.current, sizeRef.current, phaseRef.current);
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

function draw(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  size: { width: number; height: number },
  phase: Phase
): void {
  ctx.clearRect(0, 0, size.width, size.height);

  // Drum wall and the exit chute at the bottom centre.
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
  ctx.fillStyle = "rgba(68,114,196,.14)";
  ctx.fillRect(size.width / 2 - RADIUS - 6, size.height - 10, (RADIUS + 6) * 2, 10);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${ball.hue} 62% 58%)`;
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(fit(ctx, ball.label, RADIUS * 1.7), ball.x, ball.y);
  }

  if (phase.kind === "show") {
    ctx.fillStyle = "rgba(14,17,23,.78)";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(phase.label, size.width / 2, size.height / 2);
  }
}

// Cheap positional separation. The winner is already decided, so balls only need
// to look like they are jostling — accurate collision response buys nothing.
function separate(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const overlap = RADIUS * 2 - distance;
      if (overlap <= 0) continue;
      const nx = (dx / distance) * (overlap / 2);
      const ny = (dy / distance) * (overlap / 2);
      a.x -= nx;
      a.y -= ny;
      b.x += nx;
      b.y += ny;
    }
  }
}

function fit(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let cut = label;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function hueOf(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
