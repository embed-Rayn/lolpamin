import type { MemberRow } from "@/lib/queries/members";
import { tierLabel, tierScore } from "@lolpamin/core";

// 1·2·3위는 금·은·동으로 물들이고 은은하게 빛난다(globals.css의 .rank-row-*).
// 배지 자체는 왕관+월계관 메달 이미지(public/medals) — 사용자가 준 레퍼런스를 다듬은
// 것으로, 셋 다 원본은 검은/체크무늬 배경이라 스크립트로 배경을 투명 처리하고 트리밍했다
// (packages/db·core를 건드리지 않는 정적 에셋이라 여기 코드에는 처리 과정이 남지 않는다).
// MemberTable의 데스크톱 순위 칸과 이 카드가 같은 표를 공유하므로 여기 한 곳에서만
// 정의한다 — 두 군데서 따로 관리하면 이미지·색이 갈라질 수 있다.
export const PODIUM: Record<1 | 2 | 3, { row: string; image: string; label: string }> = {
  1: { row: "rank-row-gold", image: "/medals/gold.png", label: "1위" },
  2: { row: "rank-row-silver", image: "/medals/silver.png", label: "2위" },
  3: { row: "rank-row-bronze", image: "/medals/bronze.png", label: "3위" },
};

export function podiumOf(rank: number | null): (typeof PODIUM)[1 | 2 | 3] | null {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM[rank] : null;
}

// eslint-disable-next-line @next/next/no-img-element -- 장식용 고정 3장, next/image의
// 리사이즈 파이프라인을 태울 만큼 다양하지 않다.
export function RankBadge({ rank, size = "md" }: { rank: 1 | 2 | 3; size?: "sm" | "md" }) {
  const podium = PODIUM[rank];
  return (
    <img
      src={podium.image}
      alt={podium.label}
      className={`w-auto drop-shadow-[0_3px_8px_rgb(var(--c-ink)/0.35)] ${size === "sm" ? "h-9" : "h-11"}`}
    />
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
      <div className="flex w-12 flex-none items-center justify-center">
        {podium ? (
          <RankBadge rank={row.rank as 1 | 2 | 3} size="sm" />
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
