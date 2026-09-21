"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberTier } from "@lolpamin/db";
import { TIER_OPTIONS, tierLabel, tierScore } from "@lolpamin/core";
import { updateMemberTierAction } from "@/app/rift/actions";

export function MemberTierCell({
  memberId,
  tier,
  isAdmin,
}: {
  memberId: string;
  tier: MemberTier;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 점수 0(아이언·언랭)은 "점수를 매기지 않는 구간"이라 흐리게 둔다.
  const muted = tierScore(tier) === 0;

  if (!isAdmin) {
    return <div className={`truncate ${muted ? "text-[#5C6577]" : "text-[#C7D0DF]"}`}>{tierLabel(tier)}</div>;
  }

  function save(next: MemberTier) {
    if (next === tier) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberTierAction(memberId, next);
      setError(actionError);
      router.refresh();
    });
  }

  // 실명 셀과 달리 "클릭해서 편집기 열기" 단계를 두지 않는다. 네이티브 select는 그
  // 자체가 한 번의 클릭으로 열리므로, 단계를 하나 더 두면 클릭만 늘어난다.
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={tier}
        disabled={isPending}
        onChange={(e) => save(e.target.value as MemberTier)}
        title="티어 수정"
        className={`w-full min-w-0 cursor-pointer rounded-md border border-white/[.09] bg-[#0F131B] px-1.5 py-1 text-[13.5px] outline-none focus:border-[#4472C4] disabled:opacity-40 ${
          muted ? "text-[#5C6577]" : "text-[#E6EAF2]"
        }`}
      >
        {TIER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="flex-none text-[12px] text-[#EE8B8B]">{error}</span>}
    </div>
  );
}
