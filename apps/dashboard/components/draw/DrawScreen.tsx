"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignTeams,
  createDrawState,
  drawById,
  drawNext,
  drawnCandidates,
  remainingCandidates,
  undoDraw,
  type DrawCandidate,
  type DrawState,
} from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { toMemberCandidates, toNumberCandidates } from "@/lib/draw/candidates";
import { secureNextIndex } from "@/lib/draw/random";
import { clampSpeed } from "@/lib/draw/speed";
import type { PlaybackAnimator, RaceAnimator } from "./animator";
import { CannonCanvas } from "./CannonCanvas";
import { BgmPlayer } from "./BgmPlayer";
import { MarbleRaceCanvas } from "./MarbleRaceCanvas";
import { CandidateSetup, type CandidateSource } from "./CandidateSetup";
import { DrawControls } from "./DrawControls";
import { ResultList } from "./ResultList";
import { TeamTable } from "./TeamTable";

const SOURCES: Record<"cannon" | "plinko", readonly CandidateSource[]> = {
  cannon: ["members", "numbers", "teams"],
  plinko: ["members", "numbers", "teams"],
};

const SPEED_KEY = "lolpamin.draw.speed";

function readStoredSpeed(): number | null {
  try {
    const raw = window.localStorage.getItem(SPEED_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isNaN(value) ? null : clampSpeed(value);
  } catch {
    return null;
  }
}

export function DrawScreen({
  pool,
  variant,
}: {
  pool: LinkedMemberOption[];
  variant: "cannon" | "plinko";
}) {
  const [source, setSource] = useState<CandidateSource>("members");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(pool.map((m) => m.id)));
  const [manual, setManual] = useState<DrawCandidate[]>([]);
  const [range, setRange] = useState({ min: 1, max: 10 });
  // null means "not started yet" — the pool is still derived live from the setup
  // panel. The first draw freezes it into a DrawState.
  const [state, setState] = useState<DrawState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  // 서버 렌더와 첫 클라이언트 렌더가 어긋나면 안 되므로 1x로 시작하고, 마운트 뒤에
  // 저장된 값이나 reduced-motion 기본값으로 갈아끼운다.
  const [speed, setSpeed] = useState(1);
  // 06 plays back a winner the state machine already picked; 07 races marbles
  // and reports back who crossed first. Each variant mounts exactly one of these.
  const playbackRef = useRef<PlaybackAnimator>(null);
  const raceRef = useRef<RaceAnimator>(null);

  useEffect(() => {
    const stored = readStoredSpeed();
    if (stored !== null) {
      setSpeed(stored);
      return;
    }
    // 저장된 값이 없을 때만 reduced-motion을 본다. 이건 기본값이지 강제가 아니다 —
    // 켜져 있어도 슬라이더로 되돌릴 수 있다.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setSpeed(4);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // 시크릿 창이나 사이트 데이터 차단 설정에서는 쓰기가 막힌다. 이번 세션 동안만
      // 유지되면 충분하므로 조용히 넘어간다.
    }
  }, [speed]);

  const setupCandidates = useMemo(
    () =>
      source === "numbers"
        ? toNumberCandidates(range.min, range.max)
        : [...toMemberCandidates(pool, selectedIds), ...manual],
    [source, pool, selectedIds, manual, range]
  );

  const active = state ?? createDrawState(setupCandidates);
  const remaining = remainingCandidates(active);
  const drawn = drawnCandidates(active);
  const locked = drawn.length > 0;
  // Team draw runs the whole field in one go (one marble race, or one cannon
  // volley), so there is nothing to undo one pick at a time — reset is the only
  // way back.
  const teamMode = source === "teams";
  const remainingKey = remaining.map((c) => c.id).join(",");

  useEffect(() => {
    playbackRef.current?.sync(remaining);
    raceRef.current?.sync(remaining);
    // Redraw whenever the pool identity changes — after a draw, an undo, a reset
    // or a setup edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingKey]);

  async function handleDraw() {
    if (remaining.length === 0) return;
    setIsAnimating(true);
    try {
      if (teamMode && variant === "cannon") {
        // The cannon has no race: fire once per candidate until the pool is
        // empty, committing each pick as it lands so the table fills in live.
        // Draw order is the seat order assignTeams alternates over.
        let current = active;
        for (;;) {
          const result = drawNext(current, secureNextIndex);
          if (!result) break;
          current = result.state;
          setState(current);
          await playbackRef.current?.play(result.picked);
        }
        return;
      }
      if (teamMode) {
        // Every crossing lands in the table as it happens; the final order is
        // the same list, so the resolved value only needs committing once more
        // in case the last onFinish never fired.
        const commit = (order: DrawCandidate[]) =>
          setState({ candidates: active.candidates, drawnIds: order.map((c) => c.id) });
        const order = await raceRef.current?.raceAll(commit);
        if (order) commit(order);
        return;
      }
      if (variant === "plinko") {
        // Physics decides this one, so the state is committed after the race.
        const winner = await raceRef.current?.race();
        const result = winner ? drawById(active, winner.id) : null;
        if (result) setState(result.state);
        return;
      }
      const result = drawNext(active, secureNextIndex);
      if (!result) return;
      setState(result.state);
      await playbackRef.current?.play(result.picked);
    } finally {
      setIsAnimating(false);
    }
  }

  function handleUndo() {
    const next = undoDraw(active);
    setState(next.drawnIds.length === 0 ? null : next);
  }

  function handleReset() {
    setState(null);
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 px-7 pb-10 pt-6">
      <div className="flex min-w-0 flex-col gap-4">
        <CandidateSetup
          pool={pool}
          sources={SOURCES[variant]}
          source={source}
          onSourceChange={setSource}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          manual={manual}
          onManualChange={setManual}
          range={range}
          onRangeChange={setRange}
          locked={locked}
        />

        {variant === "cannon" ? (
          <CannonCanvas ref={playbackRef} remaining={remaining} speed={speed} />
        ) : (
          <MarbleRaceCanvas ref={raceRef} remaining={remaining} speed={speed} />
        )}

        <div className="flex items-center gap-4">
          <DrawControls
            canDraw={teamMode ? drawn.length === 0 && remaining.length > 0 : remaining.length > 0}
            canUndo={!teamMode && drawn.length > 0}
            canReset={drawn.length > 0}
            isAnimating={isAnimating}
            onDraw={handleDraw}
            onUndo={handleUndo}
            onReset={handleReset}
            speed={speed}
            onSpeedChange={setSpeed}
          />
          <BgmPlayer />
          <div className="ml-auto whitespace-nowrap font-mono text-[13px] text-muted">
            {teamMode
              ? `${variant === "cannon" ? "발사" : "통과"} ${drawn.length} / 전체 ${active.candidates.length}`
              : `남은 ${remaining.length} / 전체 ${active.candidates.length}`}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {teamMode ? <TeamTable teams={assignTeams(drawn)} /> : <ResultList drawn={drawn} />}
      </div>
    </div>
  );
}
