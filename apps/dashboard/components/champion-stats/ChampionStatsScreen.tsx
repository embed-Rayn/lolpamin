"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aggregateChampionStats, type ChampionSort } from "@lolpamin/core";
import { MemberPicker } from "@/components/player-stats/MemberPicker";
import type { ChampionStatsData, ChampionStatsMode } from "@/lib/queries/champion-stats";
import type { PlayerStatsPeriod } from "@/lib/queries/player-stats";
import { ChampionStatsCards } from "./ChampionStatsCards";
import { ChampionStatsTable } from "./ChampionStatsTable";

const MODES: Array<{ value: ChampionStatsMode; label: string }> = [
  { value: "RIFT", label: "협곡" },
  { value: "ARAM", label: "칼바람" },
];

const SORTS: Array<{ value: ChampionSort; label: string }> = [
  { value: "games", label: "많이 나온 순" },
  { value: "kdaDesc", label: "KDA 높은 순" },
  { value: "kdaAsc", label: "KDA 낮은 순" },
];

// 올해 → 이번 시즌 → 전체, same order and default as /player-stats.
function periods(year: number): Array<{ value: PlayerStatsPeriod; label: string }> {
  return [
    { value: "year", label: `${year}년` },
    { value: "season", label: "이번 시즌" },
    { value: "all", label: "전체" },
  ];
}

// Defaults (RIFT, year) are left out of the URL.
function href(mode: ChampionStatsMode, period: PlayerStatsPeriod): string {
  const params = new URLSearchParams();
  if (mode !== "RIFT") params.set("mode", mode);
  if (period !== "year") params.set("period", period);
  const query = params.toString();
  return query ? `/champion-stats?${query}` : "/champion-stats";
}

const SEGMENT = "inline-flex rounded-lg bg-ink/[.05] p-0.5 text-[13px]";
function segmentItem(active: boolean): string {
  return `rounded-md px-3 py-1.5 ${active ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted"}`;
}

// Selection, sort, picker and expansion are browser memory only. Sort stays out of the URL
// on purpose: a URL change goes through the server and would remount the screen, dropping
// the member selection.
export function ChampionStatsScreen({
  data,
  mode,
  period,
  year,
}: {
  data: ChampionStatsData;
  mode: ChampionStatsMode;
  period: PlayerStatsPeriod;
  // Seoul's current year, decided on the server so the label and the query agree.
  year: number;
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(data.members.map((m) => m.id)));
  const [sort, setSort] = useState<ChampionSort>("games");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => aggregateChampionStats(data.lines, selectedIds, sort), [data.lines, selectedIds, sort]);
  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const showLane = mode === "RIFT";
  const allSelected = selectedIds.size === data.members.length;

  function toggle(champion: string) {
    const next = new Set(expanded);
    if (next.has(champion)) next.delete(champion);
    else next.add(champion);
    setExpanded(next);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={SEGMENT}>
          {MODES.map((m) => (
            <Link key={m.value} href={href(m.value, period)} className={segmentItem(mode === m.value)}>
              {m.label}
            </Link>
          ))}
        </div>
        <div className={SEGMENT}>
          {periods(year).map((p) => (
            <Link key={p.value} href={href(mode, p.value)} className={segmentItem(period === p.value)}>
              {p.label}
            </Link>
          ))}
        </div>
        <div className={`${SEGMENT} md:ml-auto`}>
          {SORTS.map((s) => (
            <button key={s.value} type="button" onClick={() => setSort(s.value)} className={segmentItem(sort === s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {data.members.length === 0 ? (
        <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">
          이 기간에 리플레이로 등록한 판이 없습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              aria-expanded={pickerOpen}
              className="flex items-center justify-between rounded-xl border border-ink/[.07] bg-surface-2 px-4 py-2.5 text-left text-[13px]"
            >
              <span className="font-semibold text-fg">
                회원 선택
                <span className="ml-2 font-normal text-muted">
                  {allSelected ? `전체 ${data.members.length}명` : `${selectedIds.size}명 선택`}
                </span>
              </span>
              <span className="text-faint">{pickerOpen ? "▴" : "▾"}</span>
            </button>
            {pickerOpen && <MemberPicker members={data.members} selectedIds={selectedIds} onChange={setSelectedIds} />}
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">선택한 회원이 없습니다.</div>
          ) : (
            <>
              <div className="hidden md:block">
                <ChampionStatsTable rows={rows} names={names} showLane={showLane} expanded={expanded} onToggle={toggle} />
              </div>
              <div className="md:hidden">
                <ChampionStatsCards rows={rows} names={names} showLane={showLane} expanded={expanded} onToggle={toggle} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
