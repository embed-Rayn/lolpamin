"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { PlaybackAnimator } from "./animator";

// Text-only animator. Used while a canvas renderer is unavailable and as the
// fallback when a browser cannot give us a 2D context.
export const PickSpotlight = forwardRef<PlaybackAnimator, { remaining: DrawCandidate[] }>(
  function PickSpotlight({ remaining }, ref) {
    const [shown, setShown] = useState<DrawCandidate | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resolveRef = useRef<(() => void) | null>(null);

    function finish() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      resolveRef.current?.();
      resolveRef.current = null;
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        setShown(winner);
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          timerRef.current = setTimeout(finish, 900);
        });
      },
      sync: () => setShown(null),
    }));

    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-ink/[.07] bg-surface-2">
        <div className="text-[12.5px] text-faint">남은 인원 {remaining.length}명</div>
        <div className="text-[40px] font-extrabold text-fg">{shown ? shown.label : "—"}</div>
      </div>
    );
  }
);
