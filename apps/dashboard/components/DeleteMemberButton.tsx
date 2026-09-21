"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMemberAction } from "@/app/rift/actions";

export interface DeleteMemberButtonProps {
  memberId: string;
  label: string;
  mentionCount: number;
  gameCount: number;
  aliasCount: number;
}

// 숫자는 이 회원이 흡수한 별칭(묘비)의 기록까지 합산한 값이다 — deleteMember가 그것들도
// 함께 지우므로, 생존자 자기 기록만 세어 보여주면 실제보다 적게 안내하게 된다.
function confirmMessage({
  label,
  mentionCount,
  gameCount,
  aliasCount,
}: Omit<DeleteMemberButtonProps, "memberId">): string {
  const lines = [`'${label}' 회원을 삭제합니다.`];
  if (aliasCount > 0) lines.push(`연결된 과거 닉네임 ${aliasCount}개도 함께 삭제됩니다.`);
  if (gameCount > 0) lines.push(`전적 ${gameCount}건이 함께 삭제되며, 그 경기의 참가자 목록에서 빠집니다.`);
  if (mentionCount > 0) lines.push(`활동기록 ${mentionCount}건이 함께 삭제됩니다.`);
  lines.push("되돌릴 수 없습니다.");
  return lines.join("\n");
}

export function DeleteMemberButton({
  memberId,
  label,
  mentionCount,
  gameCount,
  aliasCount,
}: DeleteMemberButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage({ label, mentionCount, gameCount, aliasCount }))) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteMemberAction(memberId);
        router.refresh();
      } catch {
        // 프로덕션 빌드에서는 서버 액션이 던진 에러 메시지가 Next.js에 의해
        // 알아볼 수 없는 digest 문자열로 대체된다. e.message를 신뢰하지 않고
        // 고정된 한글 안내 문구를 보여준다.
        setError("변경하지 못했습니다. 관리자 로그인 상태를 확인해 주세요.");
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
        className={`rounded-md border px-2 py-1 text-[12px] font-bold ${
          isPending
            ? "cursor-not-allowed border-ink/[.06] text-ghost"
            : "cursor-pointer border-danger/30 text-danger-soft hover:bg-danger/[.12]"
        }`}
      >
        {isPending ? "삭제 중" : "삭제"}
      </button>
      {error && <span className="text-right text-[11.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
