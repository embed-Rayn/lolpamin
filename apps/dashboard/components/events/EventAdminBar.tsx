"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteEventPostAction,
  setEventPostRevealAtAction,
  setEventPostRevealedAction,
} from "@/app/events/actions";

const LABEL_MAX = 40;

const secondaryButton =
  "rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-accent-hover disabled:opacity-50";

// The hidden images are in one of three states: hidden (no time), scheduled (a future
// time — visitors see a countdown) or revealed (a past time).
export function EventAdminBar({
  postId,
  revealed,
  scheduledLabel,
  revealLabel,
  hiddenCount,
}: {
  postId: string;
  revealed: boolean;
  // "10.03 21:00" while a reveal is scheduled, else null.
  scheduledLabel: string | null;
  revealLabel: string | null;
  hiddenCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [at, setAt] = useState("");
  const [label, setLabel] = useState(revealLabel ?? "");

  function run(confirmMessage: string | null, action: () => Promise<{ error: string | null }>) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function schedule() {
    if (!at) {
      setError("공개할 날짜와 시간을 골라 주세요.");
      return;
    }
    // datetime-local has no zone; the browser reads it as local (Seoul) time.
    const iso = new Date(at).toISOString();
    run(`${at.replace("T", " ")}에 추후 공개 사진 ${hiddenCount}장을 공개하도록 예약할까요?\n그때까지 누구에게나 카운트다운이 보입니다.`, () =>
      setEventPostRevealAtAction(postId, iso, label),
    );
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

  const revealNow = () =>
    run(`추후 공개 사진 ${hiddenCount}장을 지금 공개할까요? 글 맨 위에 바로 나타납니다.`, () =>
      setEventPostRevealedAction(postId, true),
    );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink/[.06] bg-surface-3 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-bold text-faint">운영자</span>
        {hiddenCount > 0 && revealed && (
          <button
            type="button"
            disabled={isPending}
            className={secondaryButton}
            onClick={() =>
              run("추후 공개 사진을 다시 숨길까요? 일반 회원에게 보이지 않게 됩니다.", () =>
                setEventPostRevealedAction(postId, false),
              )
            }
          >
            추후 공개 숨기기
          </button>
        )}
        {hiddenCount > 0 && !revealed && (
          <button type="button" disabled={isPending} className={primaryButton} onClick={revealNow}>
            지금 공개 ({hiddenCount})
          </button>
        )}
        {scheduledLabel && (
          <>
            <span className="text-[12.5px] font-bold text-accent">{scheduledLabel} 공개 예정</span>
            <button
              type="button"
              disabled={isPending}
              className={secondaryButton}
              onClick={() => run("공개 예약을 취소할까요? 카운트다운도 사라집니다.", () => setEventPostRevealAtAction(postId, null, label))}
            >
              예약 취소
            </button>
          </>
        )}
        <Link href={`/events/${postId}/edit`} className={secondaryButton}>
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
      </div>
      {hiddenCount > 0 && !revealed && !scheduledLabel && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-faint">예약 공개</span>
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="rounded-lg border border-ink/[.1] bg-inset px-2 py-1 text-[12.5px] text-fg"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={LABEL_MAX}
            placeholder="카운트다운 설명 (예: 이벤트 결과 공개까지)"
            className="min-w-[240px] flex-1 rounded-lg border border-ink/[.1] bg-inset px-2 py-1 text-[12.5px] text-fg"
          />
          <button type="button" disabled={isPending} className={primaryButton} onClick={schedule}>
            예약
          </button>
        </div>
      )}
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
