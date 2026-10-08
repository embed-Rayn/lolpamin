"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeetingNoteAction } from "@/app/meeting-notes/actions";

// Two steps: the first click arms the button, the second deletes. Not undoable.
export function MeetingNoteDeleteButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteMeetingNoteAction(noteId);
        if (result.error) {
          setError(result.error);
          setArmed(false);
          return;
        }
        router.push("/meeting-notes");
        router.refresh();
      } catch {
        setError("회의록을 삭제하지 못했습니다. 로그인 상태를 확인해 주세요.");
        setArmed(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {armed && !isPending && (
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
        >
          취소
        </button>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12.5px] font-bold text-danger-soft hover:bg-danger/10 disabled:opacity-50"
      >
        {isPending ? "삭제 중…" : armed ? "정말 삭제 (되돌릴 수 없음)" : "삭제"}
      </button>
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
