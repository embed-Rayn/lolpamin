"use client";

import { useState, type ReactNode } from "react";
import type { Lane } from "@lolpamin/db";
import {
  DRAFT_LANES,
  laneLabel,
  tierLabel,
  tierScore,
  type DraftSide,
  type LineupSideStats,
  type LineupSlots,
  type SlotRef,
} from "@lolpamin/core";
import type { LineupCandidate } from "@/lib/team-builder/lineup";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "@/components/draft/dnd";
import { tierTone } from "./tier-tone";

// 한 팀 칸의 안쪽 열. 블루는 이름이 가운데(포지션 쪽)로 오고 레드는 그 거울상이다 —
// 양 팀의 같은 정보가 화면 가운데를 축으로 마주 보게.
const BLUE_COLS = "grid-cols-[30px_52px_50px_42px_42px_minmax(0,1fr)]";
const RED_COLS = "grid-cols-[minmax(0,1fr)_42px_42px_50px_52px_30px]";
const ROW = "grid grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)] items-stretch gap-2.5";

const TONE: Record<DraftSide, { label: string; text: string; wash: string; ring: string; bar: string }> = {
  blue: {
    label: "BLUE",
    text: "text-team-blue-soft",
    wash: "bg-team-blue/[.07]",
    ring: "border-team-blue/60 bg-team-blue/[.14]",
    bar: "bg-team-blue",
  },
  red: {
    label: "RED",
    text: "text-team-red-soft",
    wash: "bg-team-red/[.07]",
    ring: "border-team-red/60 bg-team-red/[.14]",
    bar: "bg-team-red",
  },
};

const slotId = (s: SlotRef) => `${s.side}:${s.lane}`;

// 그 자리가 본인의 주라인이면 진하게, 부라인이면 한 단계 옅게 — 「라인을 맞춰 앉혔나」를
// 한눈에 보려고. 둘 다 아니면 평범한 글자로 둔다(경고색은 과하다: 일부러 바꿔 앉히기도 한다).
function laneCellTone(preferred: Lane | null, lane: Lane, strong: string): string {
  return preferred === lane ? `font-bold ${strong}` : "text-muted";
}

function SeatCells({ side, lane, c }: { side: DraftSide; lane: Lane; c: LineupCandidate }) {
  const score = tierScore(c.tier);
  const cells: ReactNode[] = [
    <span key="score" className={`font-mono text-[15px] font-extrabold ${side === "blue" ? "text-left" : "text-right"}`}>
      {score === 0 ? <span className="text-ghost">·</span> : score}
    </span>,
    <span key="tier" className={`text-center text-[13px] font-bold ${tierTone(c.tier)}`}>
      {tierLabel(c.tier)}
    </span>,
    <span key="mmr" className="text-center font-mono text-[13px] font-semibold text-fg-2">
      {c.mmr}
    </span>,
    <span key="main" className={`text-center text-[12.5px] ${laneCellTone(c.mainLane, lane, "text-success-soft")}`}>
      {laneLabel(c.mainLane)}
    </span>,
    <span key="sub" className={`text-center text-[12.5px] ${laneCellTone(c.subLane, lane, "text-gold-deep")}`}>
      {laneLabel(c.subLane)}
    </span>,
    <span key="name" className={`flex min-w-0 flex-col ${side === "blue" ? "items-end text-right" : "items-start text-left"}`}>
      <span className="max-w-full truncate text-[14.5px] font-bold text-fg">
        {c.name}
        {c.isGuest && <span className="mx-1 text-[10.5px] font-normal text-faint">게스트</span>}
      </span>
      <span className="max-w-full truncate text-[11px] text-faint">{c.riotId ?? " "}</span>
    </span>,
  ];
  // 레드는 블루의 거울상이되 주라인·부라인만은 읽는 순서(주 → 부)를 지킨다 — 시안의 열 순서.
  const [scoreCell, tierCell, mmrCell, mainCell, subCell, nameCell] = cells;
  return <>{side === "blue" ? cells : [nameCell, mainCell, subCell, mmrCell, tierCell, scoreCell]}</>;
}

function Seat({
  at,
  candidate,
  over,
  picking,
  isPicked,
  onOver,
  onDrop,
  onClick,
}: {
  at: SlotRef;
  candidate: LineupCandidate | undefined;
  over: boolean;
  // 누군가를 클릭해 고른 상태 — 빈 자리가 「앉힐 수 있음」을 보여 준다.
  picking: boolean;
  isPicked: boolean;
  onOver: (id: string | null) => void;
  onDrop: (payload: DragPayload, to: SlotRef) => void;
  onClick: (at: SlotRef) => void;
}) {
  const tone = TONE[at.side];
  const filled = candidate !== undefined;
  return (
    <div
      onClick={() => onClick(at)}
      onDragOver={acceptDrag}
      onDragEnter={() => onOver(slotId(at))}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onOver(null);
        const payload = readDragPayload(e);
        if (payload !== null) onDrop(payload, at);
      }}
      draggable={filled}
      onDragStart={(e) => setDragPayload(e, { kind: "slot", from: at })}
      className={`grid min-h-[52px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 transition-all duration-150 ${
        at.side === "blue" ? BLUE_COLS : RED_COLS
      } ${
        over
          ? `${tone.ring} scale-[1.01] shadow-sm`
          : isPicked
            ? `${tone.ring} ring-2 ring-accent/40`
            : filled
              ? `border-transparent ${tone.wash} cursor-grab hover:border-ink/[.12] active:cursor-grabbing`
              : picking
                ? "border-dashed border-accent/50 bg-accent/[.03] hover:bg-accent/[.08]"
                : "border-dashed border-ink/[.12]"
      }`}
    >
      {candidate ? (
        <SeatCells side={at.side} lane={at.lane} c={candidate} />
      ) : (
        <span className="col-span-full text-center text-[12px] text-ghost">{over ? "여기에 놓기" : picking ? "여기에 앉히기" : "비어 있음"}</span>
      )}
    </div>
  );
}

function SideBanner({ side, stats }: { side: DraftSide; stats: LineupSideStats }) {
  const tone = TONE[side];
  const blue = side === "blue";
  return (
    <div
      className={`flex items-center justify-between overflow-hidden rounded-2xl px-6 py-4 ${
        blue ? "bg-gradient-to-r from-team-blue/25 to-team-blue/[.04]" : "flex-row-reverse bg-gradient-to-l from-team-red/25 to-team-red/[.04]"
      }`}
    >
      <div className={`text-[34px] font-black leading-none tracking-[.18em] ${tone.text}`}>{tone.label}</div>
      <div className={`flex gap-5 ${blue ? "" : "flex-row-reverse"}`}>
        <BannerStat label="인원" value={`${stats.count}/5`} />
        <BannerStat label="산정티어 합" value={String(stats.tierTotal)} />
        <BannerStat label="평균 MMR" value={stats.mmrAverage === null ? "—" : String(stats.mmrAverage)} />
      </div>
    </div>
  );
}

function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10.5px] font-bold tracking-wide text-faint">{label}</span>
      <span className="font-mono text-[16px] font-extrabold text-fg">{value}</span>
    </div>
  );
}

// 차이 한 줄. 가운데에서 앞선 팀 쪽으로 막대가 자란다 — 양쪽 값의 비율 막대는 MMR처럼
// 1000 근처에 몰린 값에서 언제나 반반으로 보여 쓸모가 없다. scale은 막대가 끝까지
// 차는 차이다.
function GapRow({
  label,
  blue,
  red,
  scale,
}: {
  label: string;
  blue: number | null;
  red: number | null;
  scale: number;
}) {
  const known = blue !== null && red !== null;
  const gap = known ? blue - red : 0;
  const leader: DraftSide | null = gap > 0 ? "blue" : gap < 0 ? "red" : null;
  const width = `${Math.min(Math.abs(gap) / scale, 1) * 100}%`;

  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_180px_minmax(0,1fr)_110px] items-center gap-4">
      <span className="text-right font-mono text-[22px] font-extrabold text-team-blue-soft">{blue ?? "—"}</span>
      <div className="relative h-2 overflow-hidden rounded-full bg-ink/[.06]">
        {leader === "blue" && <div className={`absolute right-0 top-0 h-full rounded-l-full ${TONE.blue.bar}`} style={{ width }} />}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-bold tracking-wide text-faint">{label}</span>
        <span className={`text-[20px] font-black leading-tight ${leader ? TONE[leader].text : "text-fg"}`}>
          {!known ? "—" : leader === null ? "동률" : `${leader === "blue" ? "블루" : "레드"} +${Math.abs(gap)}`}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-ink/[.06]">
        {leader === "red" && <div className={`absolute left-0 top-0 h-full rounded-r-full ${TONE.red.bar}`} style={{ width }} />}
      </div>
      <span className="text-left font-mono text-[22px] font-extrabold text-team-red-soft">{red ?? "—"}</span>
    </div>
  );
}

export function LineupBoard({
  slots,
  byKey,
  stats,
  onDrop,
  onReset,
  picked,
  onSeatClick,
}: {
  slots: LineupSlots;
  byKey: Map<string, LineupCandidate>;
  stats: Record<DraftSide, LineupSideStats>;
  onDrop: (payload: DragPayload, to: SlotRef) => void;
  picked: string | null;
  onSeatClick: (at: SlotRef) => void;
  onReset: () => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const seat = (side: DraftSide, lane: Lane) => {
    const key = slots[side][lane];
    return key === null ? undefined : byKey.get(key);
  };

  return (
    <section
      onDragEnd={() => setOver(null)}
      className="flex flex-col gap-3 rounded-2xl border border-ink/[.06] bg-surface p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[14px] font-bold">라인업</h2>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg bg-raised px-3 py-1.5 text-[12.5px] font-bold text-fg-2 transition-colors hover:bg-raised-hover"
        >
          라인업 비우기
        </button>
      </div>

      <div className={ROW}>
        <SideBanner side="blue" stats={stats.blue} />
        <div className="flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-[13px] font-black italic text-muted shadow-sm">
            VS
          </span>
        </div>
        <SideBanner side="red" stats={stats.red} />
      </div>

      <div className={`${ROW} px-0 pt-1 text-[11px] font-bold tracking-wide text-faint`}>
        <div className={`grid gap-2 px-3.5 ${BLUE_COLS}`}>
          <span>점수</span>
          <span className="text-center">산정티어</span>
          <span className="text-center">MMR</span>
          <span className="text-center">주라인</span>
          <span className="text-center">부라인</span>
          <span className="text-right">이름</span>
        </div>
        <span className="text-center">포지션</span>
        <div className={`grid gap-2 px-3.5 ${RED_COLS}`}>
          <span>이름</span>
          <span className="text-center">주라인</span>
          <span className="text-center">부라인</span>
          <span className="text-center">MMR</span>
          <span className="text-center">산정티어</span>
          <span className="text-right">점수</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {DRAFT_LANES.map((lane) => (
          <div key={lane} className={ROW}>
            <Seat
              at={{ side: "blue", lane }}
              candidate={seat("blue", lane)}
              over={over === `blue:${lane}`}
              picking={picked !== null}
              isPicked={picked !== null && slots.blue[lane] === picked}
              onOver={setOver}
              onDrop={onDrop}
              onClick={onSeatClick}
            />
            <div className="flex items-center justify-center">
              <span className="w-full rounded-lg bg-inset py-2 text-center text-[13px] font-extrabold text-fg-2">
                {laneLabel(lane)}
              </span>
            </div>
            <Seat
              at={{ side: "red", lane }}
              candidate={seat("red", lane)}
              over={over === `red:${lane}`}
              picking={picked !== null}
              isPicked={picked !== null && slots.red[lane] === picked}
              onOver={setOver}
              onDrop={onDrop}
              onClick={onSeatClick}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-3 rounded-xl bg-inset px-6 py-4">
        <GapRow label="산정티어 차이" blue={stats.blue.tierTotal} red={stats.red.tierTotal} scale={15} />
        <GapRow label="MMR 차이 (평균)" blue={stats.blue.mmrAverage} red={stats.red.mmrAverage} scale={100} />
      </div>
    </section>
  );
}
