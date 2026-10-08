import { Fragment } from "react";
import { laneLabel, type ChampionAverages, type ChampionRow } from "@lolpamin/core";
import { championName } from "@/lib/ddragon/assets";
import { formatAvg, formatKda, formatRate } from "@/lib/player-stats/format";
import { ChampionIcon } from "./ChampionIcon";

const GRID = "grid grid-cols-[40px_minmax(0,1fr)_80px_130px_80px_150px_40px] items-center gap-2";

function Cells({ row }: { row: ChampionAverages }) {
  return (
    <>
      <div className="text-right font-mono text-[13px] text-fg">{row.games}</div>
      <div className="text-right text-[13px] text-fg">
        {formatRate(row.winRate)}
        <span className="ml-1.5 text-[11.5px] text-faint">
          {row.wins}승 {row.losses}패
        </span>
      </div>
      <div className="text-right font-mono text-[13px] font-semibold text-fg">{formatKda(row.kda)}</div>
      <div className="text-right font-mono text-[12.5px] text-muted">
        {formatAvg(row.kills)} / {formatAvg(row.deaths)} / {formatAvg(row.assists)}
      </div>
    </>
  );
}

export function ChampionStatsTable({
  rows,
  names,
  showLane,
  expanded,
  onToggle,
}: {
  rows: ChampionRow[];
  names: Map<string, string>;
  showLane: boolean;
  expanded: Set<string>;
  onToggle: (champion: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[.07] bg-surface">
      <div className={`${GRID} border-b border-ink/[.06] bg-surface-2 px-4 py-2.5 text-[12px] font-bold text-muted`}>
        <div className="text-right">#</div>
        <div>챔피언</div>
        <div className="text-right">판수</div>
        <div className="text-right">승률</div>
        <div className="text-right">KDA</div>
        <div className="text-right">K / D / A</div>
        <div />
      </div>
      {rows.map((row, i) => {
        const open = expanded.has(row.champion);
        return (
          <Fragment key={row.champion}>
            <button
              type="button"
              onClick={() => onToggle(row.champion)}
              aria-expanded={open}
              className={`${GRID} w-full border-b border-ink/[.05] px-4 py-2 text-left hover:bg-ink/[.03]`}
            >
              <div className="text-right font-mono text-[12px] text-faint">{i + 1}</div>
              <div className="flex min-w-0 items-center gap-2.5">
                <ChampionIcon champion={row.champion} size={32} />
                <span className="truncate text-[13.5px] font-semibold text-fg">{championName(row.champion)}</span>
              </div>
              <Cells row={row} />
              <div className="text-center text-[12px] text-faint">{open ? "▾" : "▸"}</div>
            </button>
            {open &&
              row.members.map((m) => (
                <div key={m.memberId} className={`${GRID} border-b border-ink/[.04] bg-surface-2 px-4 py-1.5`}>
                  <div />
                  <div className="flex min-w-0 items-center gap-2 pl-10 text-[13px] text-fg">
                    <span className="truncate">{names.get(m.memberId) ?? "이름 미확인"}</span>
                    {showLane && <span className="flex-none text-[11.5px] text-faint">{laneLabel(m.mainLane)}</span>}
                  </div>
                  <Cells row={m} />
                  <div />
                </div>
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}
