"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCountdown } from "@lolpamin/core";

// Public timer for a scheduled reveal. The clock starts after mount so the server's and the
// browser's renders agree; at zero the page refreshes once and the server, now past the
// reveal time, sends the hidden images.
export function EventCountdown({ atIso, atLabel, label }: { atIso: string; atLabel: string; label: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    const at = new Date(atIso).getTime();
    const tick = () => {
      const left = at - Date.now();
      setRemaining(left);
      if (left <= 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [atIso, router]);

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-ink/[.06] bg-accent-tint px-4 py-5 text-center">
      <div className="text-[13.5px] font-bold text-accent">{label}</div>
      <div className="font-mono text-[28px] font-extrabold tracking-tight text-fg md:text-[34px]">
        {remaining === null ? "--:--:--" : formatCountdown(remaining)}
      </div>
      <div className="text-[12.5px] text-faint">{atLabel} 공개</div>
    </div>
  );
}
