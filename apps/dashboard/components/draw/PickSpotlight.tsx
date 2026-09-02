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
      skip: finish,
      sync: () => setShown(null),
    }));

    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-white/[.07] bg-[#12161F]">
        <div className="text-[11.5px] text-[#6E7889]">남은 인원 {remaining.length}명</div>
        <div className="text-[40px] font-extrabold text-white">{shown ? shown.label : "—"}</div>
      </div>
    );
  }
);
