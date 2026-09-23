import { LANE_LABELS, PLAYER_STAT_LANES, type StatColumn, type StatLine } from "@lolpamin/core";
import type { Lane } from "@lolpamin/db";
import type { PlayerStatsMember } from "@/lib/queries/player-stats";
import { championIcon, championName } from "@/lib/ddragon/assets";
import { formatAvg, formatInt, formatKda, formatRate } from "@/lib/player-stats/format";

const LANE_BADGE: Record<Lane, string> = { TOP: "TOP", JUG: "JG", MID: "MID", AD: "AD", SUP: "SUP" };
const COLS = "grid-cols-[88px_44px_56px_56px_1.4fr_64px_1fr_1fr_1fr]";

function Summary({ line }: { line: StatLine | null }) {
  if (!line) return <span className="text-[13px] text-faint">기록 없음</span>;
  return (
    <span className="text-[13px] text-muted">
      {line.games}전 {line.wins}승 {line.losses}패 · {formatRate(line.winRate)}
    </span>
  );
}

function LaneBadge({ lane }: { lane: Lane }) {
  return (
    <span className="flex items-center gap-2 font-semibold text-fg">
      <span className="grid h-[22px] w-[26px] place-items-center rounded-md bg-accent-tint text-[9px] font-bold text-accent-soft">
        {LANE_BADGE[lane]}
      </span>
      {LANE_LABELS[lane]}
    </span>
  );
}

function Cell({ children, hi }: { children: React.ReactNode; hi?: boolean }) {
  return <div className={`text-right ${hi ? "font-bold text-accent-soft" : ""}`}>{children}</div>;
}

function Row({ label, line, isBest }: { label: React.ReactNode; line: StatLine | null; isBest: (c: StatColumn) => boolean }) {
  if (!line) {
    return (
      <div className={`grid ${COLS} items-center gap-2 border-b border-ink/[.05] px-3 py-2.5 text-ink/25`}>
        <div className="opacity-60">{label}</div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="text-right">–</div>
        ))}
      </div>
    );
  }
  return (
    <div className={`grid ${COLS} items-center gap-2 border-b border-ink/[.05] px-3 py-2.5 text-fg-2`}>
      <div>{label}</div>
      <Cell>{line.games}</Cell>
      <Cell>{line.wins}-{line.losses}</Cell>
      <Cell hi={isBest("winRate")}>{formatRate(line.winRate)}</Cell>
      <Cell>{formatAvg(line.kills)} / {formatAvg(line.deaths)} / {formatAvg(line.assists)}</Cell>
      <Cell hi={isBest("kda")}>{formatKda(line.kda)}</Cell>
      <Cell hi={isBest("damageDealt")}>{formatInt(line.damageDealt)}</Cell>
      <Cell hi={isBest("damageTaken")}>{formatInt(line.damageTaken)}</Cell>
      <Cell hi={isBest("gold")}>{formatInt(line.gold)}</Cell>
    </div>
  );
}

function MobileLane({ lane, line, isBest }: { lane: Lane; line: StatLine | null; isBest: (c: StatColumn) => boolean }) {
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] ${line ? "text-fg-2" : "text-ink/25"}`}>
      <div className="flex items-center justify-between">
        <LaneBadge lane={lane} />
        {line ? (
          <span>
            {line.games}판 · <span className={isBest("winRate") ? "font-bold text-accent-soft" : ""}>{formatRate(line.winRate)}</span> · KDA{" "}
            <span className={isBest("kda") ? "font-bold text-accent-soft" : ""}>{formatKda(line.kda)}</span>
          </span>
        ) : (
          <span>–</span>
        )}
      </div>
      {line && (
        <div className="mt-1 flex justify-between text-[12px] text-muted">
          <span>{formatAvg(line.kills)}/{formatAvg(line.deaths)}/{formatAvg(line.assists)}</span>
          <span>피해 {formatInt(line.damageDealt)}</span>
          <span>골드 {formatInt(line.gold)}</span>
        </div>
      )}
    </div>
  );
}

export function PlayerStatBlock({
  member,
  collapsed,
  onToggle,
}: {
  member: PlayerStatsMember;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { stats } = member;
  const bestFor = (lane: Lane) => (c: StatColumn) => stats.best[c].includes(lane);
  const noBest = () => false;

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-left md:px-5"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[16px] font-extrabold text-fg">{member.name}</span>
          <Summary line={stats.total} />
        </span>
        <span className="text-[12px] text-faint">{collapsed ? "펼치기 ▾" : "접기 ▴"}</span>
      </button>

      {!collapsed && stats.total && (
        <div className="flex flex-col gap-4 border-t border-ink/[.06] px-4 py-4 md:flex-row md:px-5">
          <div className="min-w-0 flex-1">
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[720px] text-[13px] tabular-nums">
                <div className={`grid ${COLS} gap-2 border-b border-ink/[.08] px-3 py-2 text-[11px] font-semibold text-faint`}>
                  <div>포지션</div>
                  <div className="text-right">판</div>
                  <div className="text-right">승-패</div>
                  <div className="text-right">승률</div>
                  <div className="text-right">K / D / A</div>
                  <div className="text-right">KDA</div>
                  <div className="text-right">피해량</div>
                  <div className="text-right">받은 피해</div>
                  <div className="text-right">골드</div>
                </div>
                {PLAYER_STAT_LANES.map((lane) => (
                  <Row key={lane} label={<LaneBadge lane={lane} />} line={stats.lanes[lane]} isBest={bestFor(lane)} />
                ))}
                <div className="bg-surface-2 font-bold [&>div]:border-b-0">
                  <Row label="합계" line={stats.total} isBest={noBest} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 md:hidden">
              {PLAYER_STAT_LANES.map((lane) => (
                <MobileLane key={lane} lane={lane} line={stats.lanes[lane]} isBest={bestFor(lane)} />
              ))}
            </div>
          </div>

          <div className="md:w-[210px] md:flex-none md:border-l md:border-ink/[.06] md:pl-4">
            <div className="mb-1 text-[12px] font-bold text-muted">주 챔피언</div>
            {stats.champions.map((c) => {
              const icon = championIcon(c.champion);
              return (
                <div key={c.champion} className="flex items-center gap-2.5 border-b border-ink/[.05] py-2 last:border-b-0">
                  {icon ? (
                    <img src={icon} alt="" width={32} height={32} loading="lazy" className="rounded-lg" />
                  ) : (
                    <span className="inline-block h-8 w-8 rounded-lg bg-ink/[.08]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-fg">{championName(c.champion)}</div>
                    <div className="text-[11px] text-faint">
                      {c.wins}승 {c.games - c.wins}패 · {formatRate(c.winRate)}
                    </div>
                  </div>
                  <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-soft">
                    {c.games}판
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
