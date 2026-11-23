"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setTournamentEnabledAction } from "@/app/admins/actions";

export function TournamentSwitchPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await setTournamentEnabledAction(!enabled);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-ink/[.06] px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-bold">대회 페이지</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-faint">
            끄면 메뉴와 페이지가 방문자에게 숨겨집니다. 경기 기록은 내전 기록에 그대로 남습니다.
          </p>
        </div>
        <div className={`text-[13px] font-bold ${enabled ? "text-success" : "text-faint"}`}>
          {enabled ? "켜짐" : "꺼짐"}
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          type="button"
          onClick={toggle}
          disabled={isPending}
          className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {enabled ? "끄기" : "켜기"}
        </button>
        <Link
          href="/tournament"
          className="rounded-lg border border-ink/[.1] px-3.5 py-2 text-[13px] font-bold text-fg-2 hover:bg-hover"
        >
          대회 페이지로 이동
        </Link>
      </div>
      {error && <div className="px-5 pb-4 text-[12.5px] text-danger-soft">{error}</div>}
    </section>
  );
}
