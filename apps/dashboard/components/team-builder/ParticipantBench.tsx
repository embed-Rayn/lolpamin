"use client";

import { useState } from "react";
import type { MemberTier } from "@lolpamin/db";
import { laneLabel, TIER_OPTIONS, tierLabel, type DraftSide } from "@lolpamin/core";
import type { LineupCandidate, LineupGuest } from "@/lib/team-builder/lineup";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "@/components/draft/dnd";
import { GuestMmrInput } from "@/components/draft/CandidateTable";
import { MemberTierCell } from "@/components/MemberTierCell";
import { tierTone } from "./tier-tone";

const SIDE_TONE: Record<DraftSide, { dot: string; chip: string }> = {
  blue: { dot: "bg-accent", chip: "border-accent/30 bg-accent/[.06]" },
  red: { dot: "bg-danger", chip: "border-danger/30 bg-danger/[.06]" },
};

function GuestTierSelect({ value, onChange }: { value: MemberTier; onChange: (tier: MemberTier) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MemberTier)}
      title="산정티어"
      className="w-full min-w-0 cursor-pointer rounded-md border border-ink/[.09] bg-inset px-1.5 py-1 text-center text-[13.5px] text-fg outline-none focus:border-accent"
    >
      {TIER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// 칩 안의 입력은 칩의 클릭(고르기)으로 번지면 안 된다 — 산정티어를 고치려다 사람이 골라진다.
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function ParticipantBench({
  candidates,
  sideOf,
  picked,
  onPick,
  onUnseat,
  onDrop,
  onGuestChange,
}: {
  candidates: LineupCandidate[];
  sideOf: (key: string) => DraftSide | null;
  // 클릭으로 앉히기: 칩을 눌러 고른 뒤 라인업의 자리를 누른다.
  picked: string | null;
  onPick: (key: string) => void;
  // 라인업에서 고른 사람이 있을 때 이 칸의 빈 곳을 누르면 자리에서 빠진다.
  onUnseat: () => void;
  // 라인업에서 끌어 온 사람을 여기 놓으면 자리에서 빠진다.
  onDrop: (payload: DragPayload) => void;
  onGuestChange: (name: string, patch: Partial<Omit<LineupGuest, "name">>) => void;
}) {
  const [over, setOver] = useState(false);
  const benched = candidates.filter((c) => sideOf(c.key) === null).length;

  return (
    <section
      onDragOver={acceptDrag}
      onDragEnter={() => setOver(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = readDragPayload(e);
        if (payload !== null) onDrop(payload);
      }}
      onClick={onUnseat}
      className={`sticky top-0 z-20 flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm backdrop-blur transition-colors ${
        over ? "border-accent/50 bg-surface" : "border-ink/[.06] bg-surface/95"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <h2 className="m-0 text-[14px] font-bold">참여자</h2>
          <span className="text-[12px] text-faint">
            끌어서 놓거나, 눌러 고른 뒤 자리를 누르세요 · 라인업에서 여기로 옮기면 빠집니다
          </span>
        </div>
        <span className="font-mono text-[12px] text-muted">
          대기 {benched} / {candidates.length}
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="py-4 text-center text-[13px] text-faint">위에서 참여자를 선택하세요.</div>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          {candidates.map((c) => {
            const side = sideOf(c.key);
            const isPicked = picked === c.key;
            return (
              <div
                key={c.key}
                draggable
                onDragStart={(e) => setDragPayload(e, { kind: "bench", key: c.key })}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(c.key);
                }}
                className={`flex cursor-grab select-none flex-col gap-1 rounded-lg border px-2.5 py-2 transition-all active:cursor-grabbing ${
                  isPicked
                    ? "border-accent bg-accent/[.10] ring-2 ring-accent/40"
                    : side === null
                      ? "border-ink/[.08] bg-surface hover:border-ink/[.18]"
                      : `${SIDE_TONE[side].chip} opacity-60 hover:opacity-100`
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {side !== null && <span className={`h-2 w-2 flex-none rounded-full ${SIDE_TONE[side].dot}`} />}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {c.name}
                    {c.isGuest && <span className="ml-1 text-[10.5px] font-normal text-faint">게스트</span>}
                  </span>
                  {c.isGuest ? (
                    <div className="w-[64px]" onClick={stop} onMouseDown={stop}>
                      <GuestMmrInput key={c.name} mmr={c.mmr} onCommit={(mmr) => onGuestChange(c.name, { mmr })} />
                    </div>
                  ) : (
                    <span className="font-mono text-[12.5px] font-bold text-fg-2">{c.mmr}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="text-faint">최고</span>
                  <span className={`w-[38px] font-bold ${c.peakTier === null ? "text-ghost" : tierTone(c.peakTier)}`}>
                    {c.peakTier === null ? "-" : tierLabel(c.peakTier)}
                  </span>
                  <span className="text-faint">주</span>
                  <span className="w-[26px] font-bold text-fg-2">{laneLabel(c.mainLane)}</span>
                  <span className="ml-auto text-faint">산정</span>
                  <div className="w-[76px]" onClick={stop} onMouseDown={stop}>
                    {c.memberId === null ? (
                      <GuestTierSelect value={c.tier} onChange={(tier) => onGuestChange(c.name, { tier })} />
                    ) : (
                      <MemberTierCell key={c.key} memberId={c.memberId} tier={c.tier} isAdmin />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
