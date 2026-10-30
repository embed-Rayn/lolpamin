"use client";

import { formatEventDateTime } from "@lolpamin/core";
import type { MeetingNoteSnapshotDto } from "@/app/meeting-notes/actions";

interface Values {
  title: string;
  meetingDate: string;
  body: string;
}

function Version({ heading, values }: { heading: string; values: Values }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[12.5px] font-bold text-fg-2">{heading}</div>
      <div className="truncate text-[12px] text-faint">
        {values.title} · {values.meetingDate}
      </div>
      <textarea
        readOnly
        value={values.body}
        className="h-[260px] resize-none rounded-md border border-ink/[.1] bg-inset px-2.5 py-1.5 font-mono text-[12.5px] text-fg"
      />
    </div>
  );
}

// Shown when a save is refused because another admin changed the text (not just ticks).
// Two whole versions side by side; no line-by-line merge.
export function ConflictPanel({
  conflict,
  mine,
  onOverwrite,
  onLoadTheirs,
}: {
  conflict: MeetingNoteSnapshotDto;
  mine: Values;
  onOverwrite: () => void;
  onLoadTheirs: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/[.05] p-3" aria-label="저장 충돌">
      <div className="text-[13px] font-bold text-danger-soft">
        {conflict.updatedByName}님이 {formatEventDateTime(new Date(conflict.updatedAt))}에 수정했습니다. 어느 쪽으로
        이어갈지 골라 주세요.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Version heading="상대 버전" values={conflict} />
        <Version heading="내 버전" values={mine} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOverwrite}
          className="rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-bold text-white"
        >
          내 것으로 덮어쓰기
        </button>
        <button
          type="button"
          onClick={onLoadTheirs}
          className="rounded-lg border border-ink/[.12] px-3 py-1.5 text-[12.5px] font-bold text-fg-2"
        >
          상대 것 불러오기 (내 글은 보관)
        </button>
      </div>
    </section>
  );
}
