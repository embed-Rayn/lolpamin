"use client";

import { useState } from "react";
import type { MemberTier } from "@lolpamin/db";
import { laneLabel, TIER_OPTIONS, tierLabel, type DraftSide } from "@lolpamin/core";
import type { LineupCandidate, LineupGuest } from "@/lib/team-builder/lineup";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "@/components/draft/dnd";
import { GuestMmrInput, LaneSelect } from "@/components/draft/CandidateTable";
import { MasteryChampionStrip } from "@/components/MasteryChampionStrip";
import { MemberTierCell } from "@/components/MemberTierCell";
import { tierTone } from "./tier-tone";

const GRID = "grid grid-cols-[18px_120px_minmax(0,1fr)_60px_88px_60px_64px_64px_240px_52px] items-center gap-3";

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

// 줄 안의 입력은 줄의 클릭(고르기)으로 번지면 안 된다 — 산정티어를 고치려다 사람이 골라진다.
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
  // 클릭으로 앉히기: 줄을 눌러 고른 뒤 라인업의 자리를 누른다.
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
      className={`flex flex-col gap-1 rounded-xl border bg-surface px-4 py-3.5 transition-colors ${
        over ? "border-accent/50 bg-accent/[.03]" : "border-ink/[.06]"
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between">
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

      <div className={`${GRID} border-b border-ink/[.06] px-2 pb-1.5 text-[11.5px] font-bold text-faint`}>
        <span />
        <span>이름</span>
        <span>Riot ID</span>
        <span className="text-center">최고티어</span>
        <span className="text-center">산정티어</span>
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
            className={`${GRID} cursor-grab select-none rounded-lg px-2 py-1 text-[13px] transition-colors active:cursor-grabbing ${
              isPicked
                ? "bg-accent/[.10] ring-2 ring-accent/40"
                : side === null
                  ? "hover:bg-hover"
                  : "opacity-45 hover:opacity-80"
            }`}
          >
            <span className="text-[14px] leading-none text-ghost" aria-hidden>
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
            <span className={`text-center font-bold ${c.peakTier === null ? "text-ghost" : tierTone(c.peakTier)}`}>
              {c.peakTier === null ? "-" : tierLabel(c.peakTier)}
            </span>
            <div onClick={stop} onMouseDown={stop}>
              {c.memberId === null ? (
                <GuestTierSelect value={c.tier} onChange={(tier) => onGuestChange(c.name, { tier })} />
              ) : (
                <MemberTierCell key={c.key} memberId={c.memberId} tier={c.tier} isAdmin />
              )}
            </div>
            {c.isGuest ? (
              <div onClick={stop} onMouseDown={stop}>
                <GuestMmrInput key={c.name} mmr={c.mmr} onCommit={(mmr) => onGuestChange(c.name, { mmr })} />
              </div>
            ) : (
              <span className="text-right font-mono font-bold">{c.mmr}</span>
            )}
            {c.isGuest ? (
              <div onClick={stop} onMouseDown={stop}>
                <LaneSelect value={c.mainLane} onChange={(mainLane) => onGuestChange(c.name, { mainLane })} />
              </div>
            ) : (
              <span className="text-center">{laneLabel(c.mainLane)}</span>
            )}
            {c.isGuest ? (
              <div onClick={stop} onMouseDown={stop}>
                <LaneSelect value={c.subLane} onChange={(subLane) => onGuestChange(c.name, { subLane })} />
              </div>
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
