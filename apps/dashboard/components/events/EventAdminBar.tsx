"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEventPostAction, setEventPostRevealedAction } from "@/app/events/actions";

export function EventAdminBar({
  postId,
  revealed,
  hiddenCount,
}: {
  postId: string;
  revealed: boolean;
  hiddenCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleReveal() {
    const message = revealed
      ? "추후 공개 사진을 다시 숨길까요? 일반 회원에게 보이지 않게 됩니다."
      : `추후 공개 사진 ${hiddenCount}장을 공개할까요? 글 맨 위에 바로 나타납니다.`;
    if (!window.confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const result = await setEventPostRevealedAction(postId, !revealed);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  // Not undoable, so two confirms — the same guard as the rating resets.
  function remove() {
    if (!window.confirm("이 글과 사진을 모두 삭제합니다. 되돌릴 수 없습니다.")) return;
    if (!window.confirm("정말 삭제합니까?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEventPostAction(postId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/events");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/[.06] bg-surface-3 px-3 py-2.5">
      <span className="text-[12.5px] font-bold text-faint">운영자</span>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={toggleReveal}
          disabled={isPending}
          className={
            revealed
              ? "rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50"
              : "rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
          }
        >
          {revealed ? "추후 공개 숨기기" : `추후 공개 사진 공개 (${hiddenCount})`}
        </button>
      )}
      <Link
        href={`/events/${postId}/edit`}
        className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
      >
        수정
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-danger-soft hover:bg-hover disabled:opacity-50"
      >
        삭제
      </button>
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
