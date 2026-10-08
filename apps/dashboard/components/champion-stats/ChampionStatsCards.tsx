import { laneLabel, type ChampionRow } from "@lolpamin/core";
import { championName } from "@/lib/ddragon/assets";
import { formatKda, formatRate } from "@/lib/player-stats/format";
import { ChampionIcon } from "./ChampionIcon";

export function ChampionStatsCards({
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
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const open = expanded.has(row.champion);
        return (
          <div key={row.champion} className="rounded-xl border border-ink/[.07] bg-surface">
            <button
              type="button"
              onClick={() => onToggle(row.champion)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="w-5 flex-none text-right font-mono text-[12px] text-faint">{i + 1}</span>
              <ChampionIcon champion={row.champion} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-fg">{championName(row.champion)}</div>
                <div className="text-[12px] text-muted">
                  {row.games}판 · {formatRate(row.winRate)} · KDA {formatKda(row.kda)}
                </div>
              </div>
              <span className="flex-none text-[12px] text-faint">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div className="border-t border-ink/[.06] px-3 py-1.5">
                {row.members.map((m) => (
                  <div key={m.memberId} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {names.get(m.memberId) ?? "이름 미확인"}
                      {showLane && <span className="ml-1.5 text-[11.5px] text-faint">{laneLabel(m.mainLane)}</span>}
                    </span>
                    <span className="flex-none text-[12px] text-muted">
                      {m.games}판 · {formatRate(m.winRate)} · {formatKda(m.kda)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
