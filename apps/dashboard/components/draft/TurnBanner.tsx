"use client";

import { DRAFT_PICK_COUNT, draftPickCount, isDraftComplete, type DraftSide, type DraftState } from "@lolpamin/core";
import type { Candidate } from "@/lib/draft/candidates";

const SIDE_LABEL: Record<DraftSide, string> = { blue: "블루", red: "레드" };

export function TurnBanner({
  draft,
  turn,
  byKey,
  onUndo,
  onReset,
}: {
  draft: DraftState;
  turn: DraftSide | null;
  byKey: Map<string, Candidate>;
  onUndo: () => void;
  onReset: () => void;
}) {
  let text: string;
  if (draft.captains.blue === null || draft.captains.red === null) {
    text = "후보 표에서 블루 팀장과 레드 팀장을 지정하세요.";
  } else if (isDraftComplete(draft)) {
    text = "드래프트 완료";
  } else if (turn !== null) {
    const captain = byKey.get(draft.captains[turn]!)?.name ?? "";
    text = `${SIDE_LABEL[turn]} 팀장 ${captain} 차례 · ${draftPickCount(draft) + 1}/${DRAFT_PICK_COUNT}픽`;
  } else {
    text = "";
  }

  const tone = turn === "blue" ? "border-accent/50 bg-accent/10" : turn === "red" ? "border-danger/50 bg-danger/10" : "border-ink/[.08] bg-surface";

  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${tone}`}>
      <span className="text-[15px] font-extrabold">{text}</span>
      <div className="flex gap-2">
        <button onClick={onUndo} className="rounded-md border border-ink/[.12] px-2.5 py-1 text-[12px] text-muted">
          되돌리기
        </button>
        <button
          onClick={() => {
            if (window.confirm("드래프트를 초기화할까요? 되돌릴 수 없습니다.")) onReset();
          }}
          className="rounded-md border border-ink/[.12] px-2.5 py-1 text-[12px] text-faint"
        >
          초기화
        </button>
      </div>
    </div>
  );
}
