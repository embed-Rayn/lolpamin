"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lane } from "@lolpamin/db";
import { LANE_OPTIONS, laneLabel } from "@lolpamin/core";
import { updateMemberLaneAction } from "@/app/member-info/actions";

export function MemberLaneCell({
  memberId,
  slot,
  lane,
  isAdmin,
}: {
  memberId: string;
  slot: "main" | "sub";
  lane: Lane | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return <div className={`truncate text-center ${lane === null ? "text-ghost" : "text-fg-2"}`}>{laneLabel(lane)}</div>;
  }

  function save(value: string) {
    const next = value === "" ? null : (value as Lane);
    if (next === lane) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberLaneAction(memberId, slot, next);
      setError(actionError);
      router.refresh();
    });
  }

  // MemberTierCell처럼 편집기 여는 단계 없이 네이티브 select를 바로 둔다.
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={lane ?? ""}
        disabled={isPending}
        onChange={(e) => save(e.target.value)}
        title={slot === "main" ? "주라인 수정" : "부라인 수정"}
        className={`w-full min-w-0 cursor-pointer rounded-md border border-ink/[.09] bg-inset px-1 py-1 text-center text-[13.5px] outline-none focus:border-accent disabled:opacity-40 ${
          lane === null ? "text-ghost" : "text-fg"
        }`}
      >
        <option value="">-</option>
        {LANE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="flex-none text-[12px] text-danger-soft">{error}</span>}
    </div>
  );
}
