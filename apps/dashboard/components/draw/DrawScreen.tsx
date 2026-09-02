"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDrawState,
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
import type { DrawAnimator } from "./animator";
import { CandidateSetup, type CandidateSource } from "./CandidateSetup";
import { DrawControls } from "./DrawControls";
import { PickSpotlight } from "./PickSpotlight";
import { ResultList } from "./ResultList";

export function DrawScreen({
  pool,
  variant,
}: {
  pool: LinkedMemberOption[];
  variant: "ball" | "plinko";
}) {
  const [source, setSource] = useState<CandidateSource>("members");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(pool.map((m) => m.id)));
  const [manual, setManual] = useState<DrawCandidate[]>([]);
  const [range, setRange] = useState({ min: 1, max: 10 });
  // null means "not started yet" — the pool is still derived live from the setup
  // panel. The first draw freezes it into a DrawState.
  const [state, setState] = useState<DrawState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animatorRef = useRef<DrawAnimator>(null);

  const setupCandidates = useMemo(
    () =>
      source === "members"
        ? [...toMemberCandidates(pool, selectedIds), ...manual]
        : toNumberCandidates(range.min, range.max),
    [source, pool, selectedIds, manual, range]
  );

  const active = state ?? createDrawState(setupCandidates);
  const remaining = remainingCandidates(active);
  const drawn = drawnCandidates(active);
  const locked = drawn.length > 0;
  const remainingKey = remaining.map((c) => c.id).join(",");

  useEffect(() => {
    animatorRef.current?.sync(remaining);
    // Redraw whenever the pool identity changes — after a draw, an undo, a reset
    // or a setup edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingKey]);

  async function handleDraw() {
    const result = drawNext(active, secureNextIndex);
    if (!result) return;
    setState(result.state);
    setIsAnimating(true);
    try {
      await animatorRef.current?.play(result.picked);
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

        <PickSpotlight ref={animatorRef} remaining={remaining} />

        <div className="flex items-center justify-between">
          <DrawControls
            canDraw={remaining.length > 0}
            canUndo={drawn.length > 0}
            canReset={drawn.length > 0}
            isAnimating={isAnimating}
            onDraw={handleDraw}
            onUndo={handleUndo}
            onReset={handleReset}
            onSkip={() => animatorRef.current?.skip()}
          />
          <div className="font-mono text-[12px] text-[#8A94A6]">
            남은 {remaining.length} / 전체 {active.candidates.length}
          </div>
        </div>
      </div>

      <ResultList drawn={drawn} />
    </div>
  );
}
