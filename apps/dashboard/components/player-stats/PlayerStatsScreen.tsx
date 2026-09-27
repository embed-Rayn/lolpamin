"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlayerStatsMember, PlayerStatsPeriod } from "@/lib/queries/player-stats";
import { MemberPicker } from "./MemberPicker";
import { PlayerStatBlock } from "./PlayerStatBlock";

const PERIODS: Array<{ value: PlayerStatsPeriod; label: string }> = [
  { value: "season", label: "이번 시즌" },
  { value: "all", label: "전체" },
];

// Selection and fold state are browser memory only: a reload starts from
// everyone selected and everything expanded.
export function PlayerStatsScreen({ members, period }: { members: PlayerStatsMember[]; period: PlayerStatsPeriod }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(members.map((m) => m.id)));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const shown = members.filter((m) => selectedIds.has(m.id));

  function toggleCollapsed(id: string) {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsedIds(next);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-ink/[.05] p-0.5 text-[13px]">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={p.value === "season" ? "/player-stats" : `/player-stats?period=${p.value}`}
              className={`rounded-md px-3 py-1.5 ${
                period === p.value ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 text-[12.5px]">
          <button type="button" className="text-muted hover:text-fg" onClick={() => setCollapsedIds(new Set(members.map((m) => m.id)))}>
            모두 접기
          </button>
          <span className="text-ghost">·</span>
          <button type="button" className="text-muted hover:text-fg" onClick={() => setCollapsedIds(new Set())}>
            모두 펼치기
          </button>
        </div>
      </div>

      <MemberPicker
        members={members.map((m) => ({ id: m.id, name: m.name, games: m.stats.total?.games ?? 0 }))}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />

      {shown.length === 0 ? (
        <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">선택한 회원이 없습니다.</div>
      ) : (
        shown.map((m) => (
          <PlayerStatBlock key={m.id} member={m} collapsed={collapsedIds.has(m.id)} onToggle={() => toggleCollapsed(m.id)} />
        ))
      )}
    </div>
  );
}
