import type { MemberInfoRow, ModeRecord } from "@/lib/queries/member-info";
import { tierLabel, tierScore } from "@lolpamin/core";

function mmrClassName(mmr: number): string {
  if (mmr === 0) return "text-ghost";
  return mmr >= 1600 ? "text-gold" : "text-fg";
}

function winRateLabel(record: ModeRecord): string {
  return record.winRate === null ? "-" : `${record.winRate}%`;
}

// 협곡·칼바람 두 줄이 같은 자리에서 숫자가 시작하도록 고정폭 그리드로 칸을 나눈다.
// 예전엔 "판/승/패"를 한 덩어리 텍스트로 오른쪽 정렬해서, 자릿수가 줄마다 다르면(예:
// "1판 1승 0패" vs "13판 4승 9패") 오른쪽 끝만 맞고 안쪽 숫자는 줄마다 어긋났다 —
// 데스크톱 표처럼 판·승·패를 각자 칸으로 쪼개면 두 줄이 완전히 같은 세로줄에 선다.
const MODE_LINE_GRID = "grid-cols-[44px_48px_26px_22px_22px_40px]";

function ModeLine({ label, labelClassName, record }: { label: string; labelClassName: string; record: ModeRecord }) {
  return (
    <div className={`grid ${MODE_LINE_GRID} items-center gap-1 text-[12.5px]`}>
      <span className={`font-bold ${labelClassName}`}>{label}</span>
      <span className={`text-rightfont-bold ${mmrClassName(record.mmr)}`}>{record.mmr}</span>
      <span className="text-righttext-muted">{record.games}</span>
      <span className={`text-right${record.wins > 0 ? "text-success-soft" : "text-ghost"}`}>{record.wins}</span>
      <span className={`text-right${record.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>{record.losses}</span>
      <span className="text-righttext-faint">{winRateLabel(record)}</span>
    </div>
  );
}

export function MemberInfoCard({ row, index }: { row: MemberInfoRow; index: number }) {
  return (
    <div className="border-b border-ink/[.04] px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="w-6 flex-none text-[12px] text-ghost">{index + 1}</span>
        <span className={`truncate text-[15px] font-bold ${row.realName === "-" ? "text-ghost" : ""}`}>{row.realName}</span>
        <span className={`ml-auto flex-none text-[12.5px] ${tierScore(row.tier) === 0 ? "text-ghost" : "text-fg-2"}`}>
          {tierLabel(row.tier)}
        </span>
      </div>
      <div className={`truncate pl-8 text-[12.5px] ${row.kakaoNickname === "-" ? "text-ghost" : "text-muted"}`}>
        {row.kakaoNickname}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 pl-8">
        <ModeLine label="협곡" labelClassName="text-accent-soft" record={row.rift} />
        <ModeLine label="칼바람" labelClassName="text-orange" record={row.aram} />
      </div>
      {/* 폰에서는 보기만 한다 — 편집은 다른 셀들과 같이 데스크톱 표에서만. */}
      {row.riotAccounts.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-8">
          {row.riotAccounts.map((a) => (
            <span
              key={a.id}
              className="rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-success-soft"
            >
              {a.gameName}#{a.tagLine}
            </span>
          ))}
        </div>
      )}
      {row.note &&<div className="mt-1 truncate pl-8 text-[12px] text-faint">비고: {row.note}</div>}
    </div>
  );
}
