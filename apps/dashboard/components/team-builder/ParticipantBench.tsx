"use client";

import { useState } from "react";
import type { MemberTier } from "@lolpamin/db";
import { laneLabel, TIER_OPTIONS, tierLabel, type DraftSide } from "@lolpamin/core";
import type { LineupCandidate, LineupGuest } from "@/lib/team-builder/lineup";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "@/components/draft/dnd";
import { GuestMmrInput, LaneSelect } from "@/components/draft/CandidateTable";
import { MasteryChampionStrip } from "@/components/MasteryChampionStrip";
import { tierTone } from "./tier-tone";

const GRID = "grid grid-cols-[18px_128px_1fr_64px_60px_60px_60px_240px_56px] items-center gap-3";

function TierSelect({ value, onChange }: { value: MemberTier; onChange: (tier: MemberTier) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MemberTier)}
      className="w-full rounded border border-ink/[.09] bg-inset px-1 py-0.5 text-[12px] text-fg"
    >
      {TIER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ParticipantBench({
  candidates,
  sideOf,
  onDrop,
  onGuestChange,
}: {
  candidates: LineupCandidate[];
  sideOf: (key: string) => DraftSide | null;
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
      className={`flex flex-col gap-1 rounded-xl border bg-surface px-4 py-3.5 transition-colors ${
        over ? "border-accent/50 bg-accent/[.04]" : "border-ink/[.06]"
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <h2 className="m-0 text-[14px] font-bold">참여자</h2>
          <span className="text-[12px] text-faint">끌어서 아래 라인업에 놓으세요 · 라인업에서 여기로 끌면 빠집니다</span>
        </div>
        <span className="font-mono text-[12px] text-muted">
          대기 {benched} / {candidates.length}
        </span>
      </div>

      <div className={`${GRID} border-b border-ink/[.06] px-2 pb-1.5 text-[11.5px] font-bold text-faint`}>
        <span />
        <span>이름</span>
        <span>Riot ID</span>
        <span className="text-center">티어</span>
        <span className="text-right">MMR</span>
        <span className="text-center">주라인</span>
        <span className="text-center">부라인</span>
        <span className="text-center">모스트</span>
        <span className="text-center">팀</span>
      </div>

      {candidates.length === 0 && (
        <div className="py-8 text-center text-[13px] text-faint">위에서 참여자를 선택하세요.</div>
      )}

      {candidates.map((c) => {
        const side = sideOf(c.key);
        return (
          <div
            key={c.key}
            draggable
            onDragStart={(e) => setDragPayload(e, { kind: "bench", key: c.key })}
            className={`${GRID} cursor-grab rounded-lg px-2 py-1.5 text-[13px] transition-colors active:cursor-grabbing ${
              side === null ? "hover:bg-hover" : "opacity-45 hover:opacity-80"
            }`}
          >
            <span className="select-none text-[14px] leading-none text-ghost" aria-hidden>
              ⠿
            </span>
            <span className="truncate font-bold">
              {c.name}
              {c.isGuest && <span className="ml-1.5 text-[10.5px] font-normal text-faint">게스트</span>}
            </span>
            <span className="truncate font-mono text-[12px] text-muted">
              {c.riotId ?? "—"}
              {c.extraAccounts > 0 && <span className="text-faint"> +{c.extraAccounts}</span>}
            </span>
            {c.isGuest ? (
              <TierSelect value={c.tier} onChange={(tier) => onGuestChange(c.name, { tier })} />
            ) : (
              <span className={`text-center font-bold ${tierTone(c.tier)}`}>{tierLabel(c.tier)}</span>
            )}
            {c.isGuest ? (
              <GuestMmrInput key={c.name} mmr={c.mmr} onCommit={(mmr) => onGuestChange(c.name, { mmr })} />
            ) : (
              <span className="text-right font-mono font-bold">{c.mmr}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.mainLane} onChange={(mainLane) => onGuestChange(c.name, { mainLane })} />
            ) : (
              <span className="text-center">{laneLabel(c.mainLane)}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.subLane} onChange={(subLane) => onGuestChange(c.name, { subLane })} />
            ) : (
              <span className="text-center text-muted">{laneLabel(c.subLane)}</span>
            )}
            <MasteryChampionStrip masteries={c.masteries.slice(0, 5)} />
            <span
              className={`rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${
                side === "blue"
                  ? "bg-accent/15 text-accent-soft"
                  : side === "red"
                    ? "bg-danger/15 text-danger-soft"
                    : "bg-ink/[.06] text-faint"
              }`}
            >
              {side === "blue" ? "블루" : side === "red" ? "레드" : "대기"}
            </span>
          </div>
        );
      })}
    </section>
  );
}
