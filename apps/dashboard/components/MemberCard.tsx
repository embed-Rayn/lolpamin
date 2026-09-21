import type { MemberRow } from "@/lib/queries/members";
import { tierLabel, tierScore } from "@lolpamin/core";

// 1·2·3위는 금·은·동으로 물들이고 은은하게 빛난다(globals.css의 .rank-row-*,
// .rank-badge-*). MemberTable의 데스크톱 순위 칸과 이 카드가 같은 표를 공유하므로
// 여기 한 곳에서만 정의한다 — 두 군데서 따로 관리하면 색이 갈라질 수 있다.
export const PODIUM: Record<1 | 2 | 3, { row: string; badge: string; label: string }> = {
  1: { row: "rank-row-gold", badge: "rank-badge-gold", label: "1위" },
  2: { row: "rank-row-silver", badge: "rank-badge-silver", label: "2위" },
  3: { row: "rank-row-bronze", badge: "rank-badge-bronze", label: "3위" },
};

export function podiumOf(rank: number | null): (typeof PODIUM)[1 | 2 | 3] | null {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM[rank] : null;
}

export function RankBadge({ rank }: { rank: 1 | 2 | 3 }) {
  const podium = PODIUM[rank];
  return (
    <span className={`rank-badge ${podium.badge}`} aria-label={podium.label}>
      {rank}
    </span>
  );
}

function displayLabel(m: MemberRow): string {
  for (const candidate of [m.realName, m.kakaoNickname, m.discordName]) {
    if (candidate !== "-") return candidate;
  }
  return "이름 미확인";
}

export function MemberCard({ row }: { row: MemberRow }) {
  const podium = podiumOf(row.rank);
  const nickname = [row.kakaoNickname, row.discordName].filter((v) => v !== "-").join(" · ");
  return (
    <div className={`flex items-center gap-3 border-b border-ink/[.04] px-4 py-3 ${podium ? podium.row : ""}`}>
      <div className="flex w-8 flex-none items-center justify-center">
        {podium ? (
          <RankBadge rank={row.rank as 1 | 2 | 3} />
        ) : (
          <span className={`font-mono text-[13px] ${row.rank === null ? "text-ghost-2" : "text-muted"}`}>
            {row.rank ?? "-"}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-bold">{displayLabel(row)}</span>
          <span
            className={`flex-none font-mono text-[17px] font-bold ${
              row.mmr === 0 ? "text-ghost" : row.mmr >= 1600 ? "text-gold" : "text-fg"
            }`}
          >
            {row.mmr}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">
          {nickname || "-"} · <span className={tierScore(row.tier) === 0 ? "text-ghost" : ""}>{tierLabel(row.tier)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[12px]">
          <span className="text-faint">
            {row.playedCount}판 {row.wins}승 {row.losses}패
          </span>
          <span
            className={
              row.daysSinceActive !== null && row.daysSinceActive >= 30
                ? "text-danger-soft"
                : row.daysSinceActive !== null && row.daysSinceActive >= 14
                ? "text-orange"
                : "text-faint"
            }
          >
            {row.lastActiveLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
