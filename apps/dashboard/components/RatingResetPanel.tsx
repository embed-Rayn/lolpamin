"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SOFT_RESET_BASE } from "@lolpamin/core";
import type { RatingResetKind } from "@lolpamin/db";
import { resetRatingsAction } from "@/app/admins/actions";

interface ResetOption {
  kind: RatingResetKind;
  title: string;
  description: string;
  buttonLabel: string;
  // 되돌릴 수 없는 전체 쓰기라, 눌린 김에 실행되는 일이 없도록 확인을 두 번 받는다.
  firstConfirm: string;
}

const SECOND_CONFIRM = ["정말 실행합니까?", "마지막 확인입니다. 확인을 누르면 즉시 반영됩니다."].join("\n");

const RESET_OPTIONS: ResetOption[] = [
  {
    kind: "SOFT",
    title: "분기 소프트 리셋",
    description: `전체 회원의 MMR을 ${SOFT_RESET_BASE} 쪽으로 절반 수축시키고, 판/승/패를 0/0/0으로 되돌립니다. 순위는 유지되고 격차만 줄어듭니다.`,
    buttonLabel: "소프트 리셋",
    firstConfirm: [
      "전체 회원을 소프트 리셋합니다.",
      `MMR은 ${SOFT_RESET_BASE} 기준으로 격차가 절반이 됩니다 (예: 1300 → 1150, 800 → 900).`,
      "판/승/패는 모두 0/0/0에서 다시 시작합니다.",
      "되돌릴 수 없습니다.",
    ].join("\n"),
  },
  {
    kind: "HARD",
    title: "하드 리셋",
    description: `전체 회원의 MMR을 ${SOFT_RESET_BASE}으로 통일하고, 판/승/패를 0/0/0으로 되돌립니다. 순위도 함께 사라집니다.`,
    buttonLabel: "하드 리셋",
    firstConfirm: [
      "전체 회원을 하드 리셋합니다.",
      `MMR이 전원 ${SOFT_RESET_BASE}점이 됩니다. 지금까지의 순위는 남지 않습니다.`,
      "판/승/패는 모두 0/0/0에서 다시 시작합니다.",
      "되돌릴 수 없습니다.",
    ].join("\n"),
  },
];

export function RatingResetPanel() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 어느 버튼이 돌고 있는지 알아야 다른 하나를 함께 잠글 수 있다. 두 리셋이 겹쳐
  // 실행되면 기준선이 둘 생기고 MMR도 두 번 수축한다.
  const [runningKind, setRunningKind] = useState<RatingResetKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function handleClick(option: ResetOption) {
    if (!window.confirm(option.firstConfirm)) return;
    if (!window.confirm(SECOND_CONFIRM)) return;

    setError(null);
    setDoneMessage(null);
    setRunningKind(option.kind);
    startTransition(async () => {
      const result = await resetRatingsAction(option.kind);
      setRunningKind(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDoneMessage(`${option.title} 완료 · ${result.count}명`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-danger/25 bg-surface px-4 py-3.5">
      <div className="text-[13.5px] font-bold text-danger-soft">시즌 리셋</div>
      <div className="flex flex-col gap-3">
        {RESET_OPTIONS.map((option) => (
          <div key={option.kind} className="flex flex-col gap-2">
            <div>
              <div className="text-[13px] font-bold text-fg-2">{option.title}</div>
              <div className="text-[12px] text-faint">{option.description} 되돌릴 수 없습니다.</div>
            </div>
            <button
              type="button"
              onClick={() => handleClick(option)}
              disabled={isPending}
              className={`self-start rounded-md border px-3 py-1.5 text-[12px] font-bold ${
                isPending
                  ? "cursor-not-allowed border-ink/[.06] text-ghost"
                  : "cursor-pointer border-danger/30 text-danger-soft hover:bg-danger/[.12]"
              }`}
            >
              {runningKind === option.kind ? "리셋 중" : option.buttonLabel}
            </button>
          </div>
        ))}
      </div>
      <div className="text-[12px] text-faint">
        경기 기록은 지워지지 않습니다. 리셋 이전 경기는 전적 집계에서만 빠지고, 그 경기는 되돌릴 수 없게 됩니다.
      </div>
      {doneMessage && <span className="text-[12px] text-success-soft">{doneMessage}</span>}
      {error && <span className="text-[12px] text-danger-soft">{error}</span>}
    </div>
  );
}
