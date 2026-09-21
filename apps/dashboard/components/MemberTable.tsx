import Link from "next/link";
import type { MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";

// 순위, 실명, 카톡, 디코, 티어, MMR, 판, 승, 패, 마지막 활동, 관리. Riot ID는 이 표에서
// 뺐다 — 편집은 /team-builder에 남아 있다.
const GRID = "grid-cols-[64px_0.6fr_1fr_1fr_112px_88px_46px_44px_44px_120px_80px]";

// 1·2·3위 행은 샘플 이미지처럼 금·은·동으로 물들이고 은은하게 빛난다. 나머지는 번호만.
// 색은 globals.css의 .rank-row-* 가 들고 있다 — 그라데이션과 글로우는 Tailwind 임의값으로
// 쓰기엔 길다.
const PODIUM: Record<1 | 2 | 3, { row: string; badge: string; label: string }> = {
  1: { row: "rank-row-gold", badge: "rank-badge-gold", label: "1위" },
  2: { row: "rank-row-silver", badge: "rank-badge-silver", label: "2위" },
  3: { row: "rank-row-bronze", badge: "rank-badge-bronze", label: "3위" },
};

function podiumOf(rank: number | null): (typeof PODIUM)[1 | 2 | 3] | null {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM[rank] : null;
}

function RankCell({ rank }: { rank: number | null }) {
  const podium = podiumOf(rank);
  if (podium) {
    return (
      <div className="flex items-center justify-center">
        <span className={`rank-badge ${podium.badge}`} aria-label={podium.label}>
          {rank}
        </span>
      </div>
    );
  }
  return (
    <div className={`text-center font-mono text-[13.5px] ${rank === null ? "text-[#3E4756]" : "text-[#8A94A6]"}`}>
      {rank ?? "-"}
    </div>
  );
}

function displayLabel(m: MemberRow): string {
  for (const candidate of [m.realName, m.kakaoNickname, m.discordName]) {
    if (candidate !== "-") return candidate;
  }
  return "이름 미확인";
}

export function MemberTable({
  rows,
  isAdmin,
  sort,
  dir,
  filter,
  query,
  basePath,
}: {
  rows: MemberRow[];
  isAdmin: boolean;
  sort: MemberSort;
  dir: SortDirection;
  filter: MemberFilter;
  query: string;
  // 정렬 링크가 돌아올 페이지 — MemberFilters의 basePath와 같은 이유다.
  basePath: string;
}) {
  function sortHref(key: MemberSort): string {
    // 같은 기준을 다시 누르면 방향을 뒤집고, 다른 기준으로 바꾸면 내림차순부터 시작한다.
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams({ filter, sort: key, dir: nextDir });
    if (query) params.set("q", query);
    return `${basePath}?${params.toString()}`;
  }

  function sortMark(key: MemberSort): string {
    if (sort !== key) return "";
    return dir === "desc" ? " ↓" : " ↑";
  }

  return (
    <>
      <div
        className={`grid ${GRID} gap-4 border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[12.5px] font-bold tracking-wide text-[#6E7889]`}
      >
        <Link href={sortHref("mmr")} className="text-center hover:text-[#B7C0D0]">
          순위
        </Link>
        <Link href={sortHref("realName")} className="hover:text-[#B7C0D0]">
          실명{sortMark("realName")}
        </Link>
        <Link href={sortHref("kakaoNickname")} className="hover:text-[#B7C0D0]">
          카톡 닉네임{sortMark("kakaoNickname")}
        </Link>
        <div>디코 닉네임</div>
        <Link href={sortHref("tier")} className="hover:text-[#B7C0D0]">
          티어{sortMark("tier")}
        </Link>
        <Link href={sortHref("mmr")} className="text-right hover:text-[#B7C0D0]">
          MMR{sortMark("mmr")}
        </Link>
        <div className="text-right">판</div>
        <div className="text-right">승</div>
        <div className="text-right">패</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">관리</div>
      </div>
      {rows.map((m) => {
        const podium = podiumOf(m.rank);
        return (
          <div
            key={m.id}
            className={`grid ${GRID} relative items-center gap-4 border-b border-white/[.04] px-5 py-3.5 text-[15px] ${
              podium ? podium.row : "hover:bg-[#181E29]"
            }`}
          >
            <RankCell rank={m.rank} />
            <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
            <div className={`truncate font-mono text-[13.5px] ${m.kakaoNickname === "-" ? "text-[#5C6577]" : "text-[#F2C75C]"}`}>
              {m.kakaoNickname}
            </div>
            <div className={`truncate font-mono text-[13.5px] ${m.discordName === "-" ? "text-[#5C6577]" : "text-[#8FA9F5]"}`}>
              {m.discordName}
            </div>
            <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
            <div
              className={`text-right font-mono text-[15.5px] font-bold ${
                m.mmr === 0 ? "text-[#5C6577]" : m.mmr >= 1600 ? "text-[#F2C75C]" : "text-[#E6EAF2]"
              }`}
            >
              {m.mmr}
            </div>
            <div className="text-right font-mono text-[13.5px] text-[#8A94A6]">{m.playedCount}</div>
            <div className={`text-right font-mono text-[13.5px] ${m.wins > 0 ? "text-[#7FD1A0]" : "text-[#5C6577]"}`}>
              {m.wins}
            </div>
            <div className={`text-right font-mono text-[13.5px] ${m.losses > 0 ? "text-[#EE8B8B]" : "text-[#5C6577]"}`}>
              {m.losses}
            </div>
            <div
              className={`text-right font-mono text-[13.5px] ${
                m.daysSinceActive !== null && m.daysSinceActive >= 30
                  ? "text-[#EE8B8B]"
                  : m.daysSinceActive !== null && m.daysSinceActive >= 14
                  ? "text-[#F2985C]"
                  : "text-[#8A94A6]"
              }`}
            >
              {m.lastActiveLabel}
            </div>
            {isAdmin ? (
              <DeleteMemberButton
                memberId={m.id}
                label={displayLabel(m)}
                mentionCount={m.mentionCount}
                gameCount={m.gameCount}
                aliasCount={m.aliasCount}
              />
            ) : (
              <div />
            )}
          </div>
        );
      })}
    </>
  );
}
