"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberLane } from "@lolpamin/db";
import { LANE_OPTIONS, UNSET_LANE_LABEL, laneLabel } from "@lolpamin/core";
import { updateMemberLaneAction } from "@/app/member-info/actions";
import type { LaneSlot } from "@/lib/mutations/update-member-lane";

// select의 빈 값. DOM에서는 빈 문자열이 "값 없음"이라 그대로 쓴다.
const UNSET_VALUE = "";

export function MemberLaneCell({
  memberId,
  slot,
  lane,
  isAdmin,
}: {
  memberId: string;
  slot: LaneSlot;
  lane: MemberLane | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return (
      <div className={`truncate text-center ${lane === null ? "text-ghost" : "text-fg-2"}`}>{laneLabel(lane)}</div>
    );
  }

  function save(next: MemberLane | null) {
    if (next === lane) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberLaneAction(memberId, slot, next);
      setError(actionError);
      router.refresh();
    });
  }

  // 티어 셀과 같은 이유로 "클릭해서 편집기 열기" 단계를 두지 않는다 — 네이티브 select가
  // 한 번의 클릭으로 열린다.
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={lane ?? UNSET_VALUE}
        disabled={isPending}
        onChange={(e) => save(e.target.value === UNSET_VALUE ? null : (e.target.value as MemberLane))}
        title={slot === "primary" ? "주 라인 수정" : "부 라인 수정"}
        className={`w-full min-w-0 cursor-pointer rounded-md border border-ink/[.09] bg-inset px-1.5 py-1 text-center text-[13px] outline-none focus:border-accent disabled:opacity-40 ${
          lane === null ? "text-ghost" : "text-fg"
        }`}
      >
        <option value={UNSET_VALUE}>{UNSET_LANE_LABEL}</option>
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
