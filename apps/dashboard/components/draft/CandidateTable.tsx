"use client";

import type { Lane } from "@lolpamin/db";
import { isCaptain, LANE_OPTIONS, laneLabel, seatOf, type DraftSide, type DraftState } from "@lolpamin/core";
import { championIcon, championIdByKey, championName } from "@/lib/ddragon/assets";
import type { Candidate, Guest } from "@/lib/draft/candidates";
import { setDragPayload } from "./dnd";

const GRID = "grid grid-cols-[28px_120px_1.2fr_150px_40px_40px_56px_56px_56px_64px_150px] items-center gap-2";

function MasteryIcons({ candidate }: { candidate: Candidate }) {
  if (candidate.masteries.length === 0) return <span className="text-ghost">—</span>;
  return (
    <div className="flex gap-1.5">
      {candidate.masteries.map((m) => {
        const id = championIdByKey(m.championId);
        const icon = id ? championIcon(id) : null;
        return (
          <div key={m.championId} className="flex items-center gap-0.5" title={id ? championName(id) : undefined}>
            {icon ? (
              <img src={icon} alt="" width={24} height={24} className="rounded" />
            ) : (
              <span className="inline-block h-6 w-6 rounded bg-ink/[.08]" />
            )}
            <span className="font-mono text-[11px] text-muted">x{m.level}</span>
          </div>
        );
      })}
    </div>
  );
}

function LaneSelect({ value, onChange }: { value: Lane | null; onChange: (lane: Lane | null) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as Lane))}
      className="w-full rounded border border-ink/[.09] bg-inset px-1 py-0.5 text-[12px] text-fg"
    >
      <option value="">-</option>
      {LANE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CandidateTable({
  candidates,
  draft,
  turn,
  onSetCaptain,
  onPick,
  onGuestChange,
}: {
  candidates: Candidate[];
  draft: DraftState;
  turn: DraftSide | null;
  onSetCaptain: (side: DraftSide, candidate: Candidate) => void;
  onPick: (candidate: Candidate) => void;
  onGuestChange: (name: string, patch: Partial<Omit<Guest, "name">>) => void;
}) {
  const captainsReady = draft.captains.blue !== null && draft.captains.red !== null;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <h2 className="m-0 text-[14px] font-bold">후보 선수</h2>
      <div className={`${GRID} border-b border-ink/[.06] pb-1.5 text-[11.5px] font-bold text-faint`}>
        <span>#</span>
        <span>이름</span>
        <span>Riot ID</span>
        <span>숙련 챔피언</span>
        <span className="text-right">승</span>
        <span className="text-right">패</span>
        <span className="text-right">MMR</span>
        <span>주라인</span>
        <span>부라인</span>
        <span>팀</span>
        <span />
      </div>
      {candidates.length === 0 && <div className="py-6 text-center text-[13px] text-faint">위에서 참여자를 선택하세요.</div>}
      {candidates.map((c, index) => {
        const seat = seatOf(draft, c.key);
        const tone = seat?.side === "blue" ? "bg-accent/10" : seat?.side === "red" ? "bg-danger/10" : "";
        return (
          <div
            key={c.key}
            draggable={seat === null}
            onDragStart={(e) => setDragPayload(e, { kind: "bench", key: c.key })}
            className={`${GRID} rounded-md px-1 py-1.5 text-[13px] ${tone} ${seat === null ? "cursor-grab" : ""}`}
          >
            <span className="font-mono text-faint">{index + 1}</span>
            <span className="truncate font-bold">
              {isCaptain(draft, c.key) && <span title="팀장">👑 </span>}
              {c.name}
              {c.isGuest && <span className="ml-1 text-[10.5px] font-normal text-faint">게스트</span>}
            </span>
            <span className="truncate font-mono text-[12px] text-muted">
              {c.riotId ?? "—"}
              {c.extraAccounts > 0 && <span className="text-faint"> +{c.extraAccounts}</span>}
            </span>
            <MasteryIcons candidate={c} />
            <span className="text-right font-mono text-success-soft">{c.wins ?? "—"}</span>
            <span className="text-right font-mono text-danger-soft">{c.losses ?? "—"}</span>
            {c.isGuest ? (
              <input
                type="number"
                step={10}
                value={c.mmr}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) onGuestChange(c.name, { mmr: value });
                }}
                className="w-full rounded border border-ink/[.09] bg-inset px-1 py-0.5 text-right font-mono text-[12px] text-fg"
              />
            ) : (
              <span className="text-right font-mono font-bold">{c.mmr}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.mainLane} onChange={(lane) => onGuestChange(c.name, { mainLane: lane })} />
            ) : (
              <span>{laneLabel(c.mainLane)}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.subLane} onChange={(lane) => onGuestChange(c.name, { subLane: lane })} />
            ) : (
              <span>{laneLabel(c.subLane)}</span>
            )}
            <span
              className={`rounded border px-1.5 py-0.5 text-center text-[11.5px] font-bold ${
                seat?.side === "blue"
                  ? "border-accent/50 text-accent-soft"
                  : seat?.side === "red"
                    ? "border-danger/50 text-danger-soft"
                    : "border-ink/[.12] text-faint"
              }`}
            >
              {seat?.side === "blue" ? "블루" : seat?.side === "red" ? "레드" : "미배정"}
            </span>
            <div className="flex gap-1">
              {seat === null && !captainsReady && (
                <>
                  {draft.captains.blue === null && (
                    <button onClick={() => onSetCaptain("blue", c)} className="rounded border border-accent/50 px-1.5 py-0.5 text-[11.5px] font-bold text-accent-soft">
                      블루 팀장
                    </button>
                  )}
                  {draft.captains.red === null && (
                    <button onClick={() => onSetCaptain("red", c)} className="rounded border border-danger/50 px-1.5 py-0.5 text-[11.5px] font-bold text-danger-soft">
                      레드 팀장
                    </button>
                  )}
                </>
              )}
              {seat === null && turn !== null && (
                <button
                  onClick={() => onPick(c)}
                  className={`rounded px-2 py-0.5 text-[11.5px] font-bold text-white ${turn === "blue" ? "bg-accent" : "bg-danger"}`}
                >
                  뽑기
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
