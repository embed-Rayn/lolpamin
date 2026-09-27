"use client";

import { DRAFT_LANES, DRAFT_SIDES, isCaptain, laneLabel, type DraftSide, type DraftState, type SlotRef } from "@lolpamin/core";
import type { Candidate } from "@/lib/draft/candidates";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "./dnd";

const HEAD: Record<DraftSide, { label: string; text: string; cell: string }> = {
  blue: { label: "BLUE", text: "text-accent-soft", cell: "bg-accent/10" },
  red: { label: "RED", text: "text-danger-soft", cell: "bg-danger/10" },
};

export function EntryBoard({
  draft,
  byKey,
  averages,
  onDrop,
}: {
  draft: DraftState;
  byKey: Map<string, Candidate>;
  averages: Record<DraftSide, number | null>;
  onDrop: (payload: DragPayload, to: SlotRef) => void;
}) {
  const count = (side: DraftSide) => DRAFT_LANES.filter((lane) => draft.slots[side][lane] !== null).length;

  return (
    <section className="grid grid-cols-[64px_1fr_1fr] gap-2">
      <div />
      {DRAFT_SIDES.map((side) => (
        <div key={side} className={`rounded-xl px-4 py-2.5 ${HEAD[side].cell}`}>
          <div className={`text-[13px] font-extrabold ${HEAD[side].text}`}>
            {HEAD[side].label} {count(side)}/5
          </div>
          <div className="text-[12px] text-muted">평균 MMR {averages[side] ?? "—"}</div>
        </div>
      ))}
      {DRAFT_LANES.map((lane) => (
        <div key={lane} className="contents">
          <div className="flex items-center justify-center rounded-lg bg-inset text-[13px] font-extrabold">{laneLabel(lane)}</div>
          {DRAFT_SIDES.map((side) => {
            const key = draft.slots[side][lane];
            const candidate = key === null ? undefined : byKey.get(key);
            return (
              <div
                key={side}
                onDragOver={acceptDrag}
                onDrop={(e) => {
                  e.preventDefault();
                  const payload = readDragPayload(e);
                  if (payload !== null) onDrop(payload, { side, lane });
                }}
                draggable={candidate !== undefined}
                onDragStart={(e) => setDragPayload(e, { kind: "slot", from: { side, lane } })}
                className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 ${HEAD[side].cell} ${
                  candidate ? "cursor-grab" : ""
                }`}
              >
                {candidate ? (
                  <>
                    <span className="text-[13.5px] font-bold">
                      {isCaptain(draft, candidate.key) && <span title="팀장">👑 </span>}
                      {candidate.name}
                    </span>
                    <span className="font-mono text-[12px] text-muted">{candidate.mmr}</span>
                  </>
                ) : (
                  <span className="text-[12px] text-ghost">비어 있음</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
