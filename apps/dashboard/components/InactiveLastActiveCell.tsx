"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberLastActiveAction } from "@/app/inactive/actions";

export function InactiveLastActiveCell({
  memberId,
  lastActiveDate,
  isAdmin,
}: {
  memberId: string;
  lastActiveDate: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return <div className="text-right font-mono text-[12.5px] text-[#7A8496]">{lastActiveDate}</div>;
  }

  // 티어 셀처럼 편집기를 따로 열지 않는다 — date input은 그 자체가 한 번의 클릭으로
  // 달력을 연다. 값이 확정되는 change 때 바로 저장한다.
  function save(next: string) {
    if (next === lastActiveDate) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberLastActiveAction(memberId, next);
      setError(actionError);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <input
        type="date"
        value={lastActiveDate}
        disabled={isPending}
        onChange={(e) => save(e.target.value)}
        title="마지막 활동일 수정"
        className="w-full cursor-pointer rounded-md border border-white/[.09] bg-[#0F131B] px-1.5 py-1 text-right font-mono text-[12.5px] text-[#C7D0DF] outline-none [color-scheme:dark] focus:border-[#4472C4] disabled:opacity-40"
      />
      {error && <span className="text-[12px] text-[#EE8B8B]">{error}</span>}
    </div>
  );
}
