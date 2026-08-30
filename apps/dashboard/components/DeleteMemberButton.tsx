"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMemberAction } from "@/app/members/actions";

export interface DeleteMemberButtonProps {
  memberId: string;
  label: string;
  mentionCount: number;
  gameCount: number;
}

function confirmMessage({ label, mentionCount, gameCount }: Omit<DeleteMemberButtonProps, "memberId">): string {
  const lines = [`'${label}' 회원을 삭제합니다.`];
  if (gameCount > 0) lines.push(`전적 ${gameCount}건이 함께 삭제되며, 그 경기의 참가자 목록에서 빠집니다.`);
  if (mentionCount > 0) lines.push(`활동기록 ${mentionCount}건이 함께 삭제됩니다.`);
  lines.push("되돌릴 수 없습니다.");
  return lines.join("\n");
}

export function DeleteMemberButton({ memberId, label, mentionCount, gameCount }: DeleteMemberButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage({ label, mentionCount, gameCount }))) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteMemberAction(memberId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title={`${label} 삭제`}
        className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
          isPending
            ? "cursor-not-allowed border-white/[.06] text-[#5C6577]"
            : "cursor-pointer border-[#E05A5A]/30 text-[#EE8B8B] hover:bg-[#E05A5A]/[.12]"
        }`}
      >
        {isPending ? "삭제 중" : "삭제"}
      </button>
      {error && <span className="text-right text-[10px] text-[#EE8B8B]">{error}</span>}
    </div>
  );
}
