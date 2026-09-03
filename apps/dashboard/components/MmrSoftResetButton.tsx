"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SOFT_RESET_BASE } from "@lolpamin/core";
import { softResetMmrAction } from "@/app/admins/actions";

// 되돌릴 수 없는 전체 쓰기라, 눌린 김에 실행되는 일이 없도록 확인을 두 번 받는다.
const FIRST_CONFIRM = [
  "전체 회원의 MMR을 소프트 리셋합니다.",
  `${SOFT_RESET_BASE} 기준으로 격차가 절반이 됩니다 (예: 1300 → 1150, 800 → 900).`,
  "되돌릴 수 없습니다.",
].join("\n");

const SECOND_CONFIRM = ["정말 실행합니까?", "마지막 확인입니다. 확인을 누르면 즉시 반영됩니다."].join("\n");

export function MmrSoftResetButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  function handleClick() {
    if (!window.confirm(FIRST_CONFIRM)) return;
    if (!window.confirm(SECOND_CONFIRM)) return;

    setError(null);
    setDoneCount(null);
    startTransition(async () => {
      const result = await softResetMmrAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setDoneCount(result.count);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#E05A5A]/25 bg-[#151A24] px-4 py-3.5">
      <div>
        <div className="text-[12.5px] font-bold text-[#EE8B8B]">분기 소프트 리셋</div>
        <div className="text-[11px] text-[#6E7889]">
          전체 회원의 MMR을 {SOFT_RESET_BASE} 쪽으로 절반 수축시킵니다. 순위는 유지되고 격차만 줄어듭니다. 되돌릴 수
          없습니다.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-bold ${
            isPending
              ? "cursor-not-allowed border-white/[.06] text-[#5C6577]"
              : "cursor-pointer border-[#E05A5A]/30 text-[#EE8B8B] hover:bg-[#E05A5A]/[.12]"
          }`}
        >
          {isPending ? "리셋 중" : "MMR 소프트 리셋"}
        </button>
        {doneCount !== null && <span className="text-[11px] text-[#6E7889]">{doneCount}명 리셋 완료</span>}
        {error && <span className="text-[11px] text-[#EE8B8B]">{error}</span>}
      </div>
    </div>
  );
}
