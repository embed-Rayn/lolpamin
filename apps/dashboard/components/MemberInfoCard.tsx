import type { MemberInfoRow, ModeRecord } from "@/lib/queries/member-info";
import { tierLabel, tierScore } from "@lolpamin/core";

function mmrClassName(mmr: number): string {
  if (mmr === 0) return "text-ghost";
  return mmr >= 1600 ? "text-gold" : "text-fg";
}

function winRateLabel(record: ModeRecord): string {
  return record.winRate === null ? "-" : `${record.winRate}%`;
}

function ModeLine({ label, labelClassName, record }: { label: string; labelClassName: string; record: ModeRecord }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className={`w-14 flex-none font-bold ${labelClassName}`}>{label}</span>
      <span className={`flex-1 text-right font-mono font-bold ${mmrClassName(record.mmr)}`}>{record.mmr}</span>
      <span className="w-20 flex-none text-right font-mono text-muted">
        {record.games}판 {record.wins}승 {record.losses}패
      </span>
      <span className="w-10 flex-none text-right font-mono text-faint">{winRateLabel(record)}</span>
    </div>
  );
}

export function MemberInfoCard({ row, index }: { row: MemberInfoRow; index: number }) {
  return (
    <div className="border-b border-ink/[.04] px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="w-6 flex-none font-mono text-[12px] text-ghost">{index + 1}</span>
        <span className={`truncate text-[15px] font-bold ${row.realName === "-" ? "text-ghost" : ""}`}>{row.realName}</span>
        <span className={`ml-auto flex-none text-[12.5px] ${tierScore(row.tier) === 0 ? "text-ghost" : "text-fg-2"}`}>
          {tierLabel(row.tier)}
        </span>
      </div>
      <div className={`truncate pl-8 font-mono text-[12px] ${row.kakaoNickname === "-" ? "text-ghost" : "text-gold"}`}>
        {row.kakaoNickname}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 pl-8">
        <ModeLine label="협곡" labelClassName="text-accent-soft" record={row.rift} />
        <ModeLine label="칼바람" labelClassName="text-orange" record={row.aram} />
      </div>
      {row.note && <div className="mt-1 truncate pl-8 text-[12px] text-faint">비고: {row.note}</div>}
    </div>
  );
}
