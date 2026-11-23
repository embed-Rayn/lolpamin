import type { TournamentStanding } from "@lolpamin/core";
import { TournamentTeamNameCell } from "./TournamentTeamNameCell";

// A typographic minus, not a hyphen: "−2" lines up with "+3" in a mono column.
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function formatPoints(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

// Six narrow columns in a fixed-layout table: fits a 375px phone without scrolling.
export function TournamentStandingsTable({
  standings,
  isAdmin,
}: {
  standings: TournamentStanding[];
  isAdmin: boolean;
}) {
  const head = "px-1.5 py-2 text-[12px] font-bold text-faint md:px-3";
  const cell = "px-1.5 py-2.5 font-mono text-[13.5px] md:px-3";

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[.07] bg-surface-2">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-11 md:w-16" />
          <col />
          <col className="w-9 md:w-16" />
          <col className="w-9 md:w-16" />
          <col className="w-11 md:w-20" />
          <col className="w-14 md:w-20" />
        </colgroup>
        <thead>
          <tr className="border-b border-ink/[.07]">
            <th className={`${head} text-center`}>순위</th>
            <th className={`${head} text-left`}>팀</th>
            <th className={`${head} text-center`}>승</th>
            <th className={`${head} text-center`}>패</th>
            <th className={`${head} text-center`}>승점</th>
            <th className={`${head} text-center`}>킬득실</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.slot} className="border-b border-ink/[.05] last:border-b-0">
              <td className={`${cell} text-center font-bold ${s.rank === 1 && s.played > 0 ? "text-accent-soft" : "text-fg-2"}`}>
                {s.rank}
              </td>
              <td className="truncate px-1.5 py-2.5 text-[13.5px] md:px-3">
                {isAdmin ? (
                  <TournamentTeamNameCell slot={s.slot} name={s.name} />
                ) : (
                  <span className="font-semibold text-fg">{s.name}</span>
                )}
              </td>
              <td className={`${cell} text-center text-fg-2`}>{s.wins}</td>
              <td className={`${cell} text-center text-fg-2`}>{s.losses}</td>
              <td className={`${cell} text-center font-bold text-fg`}>{formatPoints(s.points)}</td>
              <td
                className={`${cell} text-center ${
                  s.killDiff > 0 ? "text-success-soft" : s.killDiff < 0 ? "text-danger-soft" : "text-muted"
                }`}
              >
                {formatSigned(s.killDiff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
