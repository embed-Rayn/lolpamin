import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export function InactiveCard({ row }: { row: InactiveRow }) {
  const severe = row.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS;
  return (
    <div className="border-b border-ink/[.04] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14.5px] font-bold">{row.name}</span>
        <span className={`flex-none font-mono text-[15px] font-bold ${severe ? "text-danger-soft" : "text-orange"}`}>
          {row.daysSinceActive}일
        </span>
      </div>
      <div className="truncate text-[12.5px] text-muted">{row.kakaoNickname}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-faint">
        <span>마지막 활동 {row.lastActiveDate}</span>
        <span>
          <span className="font-mono font-bold text-fg-2">{row.mmr}</span> · 내전 {row.gameCount}회
        </span>
      </div>
    </div>
  );
}
