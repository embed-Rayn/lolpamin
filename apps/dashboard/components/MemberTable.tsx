import Link from "next/link";
import type { MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberCard, RankBadge, podiumOf } from "@/components/MemberCard";

// 순위, 실명, 카톡, 디코, 티어, MMR, 판, 승, 패, 마지막 활동, 관리. Riot ID는 이 표에서
// 뺐다 — 편집은 /team-builder에 남아 있다.
const GRID = "grid-cols-[64px_0.6fr_1fr_1fr_112px_88px_46px_44px_44px_120px_80px]";

function RankCell({ rank }: { rank: number | null }) {
  const podium = podiumOf(rank);
  if (podium) {
    return (
      <div className="flex items-center justify-center">
        <RankBadge rank={rank as 1 | 2 | 3} />
      </div>
    );
  }
  return (
    <div className={`text-center font-mono text-[13.5px] ${rank === null ? "text-ghost-2" : "text-muted"}`}>
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
      {/* 데스크톱: 원래 그리드 표. 폰: 아래 md:hidden 카드 목록이 대신한다. */}
      <div className="hidden md:block">
        <div
          className={`grid ${GRID} gap-4 border-b border-ink/[.06] bg-surface-2 px-7 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            순위
          </Link>
          <Link href={sortHref("realName")} className="hover:text-fg-2">
            실명{sortMark("realName")}
          </Link>
          <Link href={sortHref("kakaoNickname")} className="hover:text-fg-2">
            카톡 닉네임{sortMark("kakaoNickname")}
          </Link>
          <div>디코 닉네임</div>
          <Link href={sortHref("tier")} className="hover:text-fg-2">
            티어{sortMark("tier")}
          </Link>
          <Link href={sortHref("mmr")} className="text-right hover:text-fg-2">
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
              className={`grid ${GRID} relative items-center gap-4 border-b border-ink/[.04] px-7 py-3.5 text-[15px] ${
                podium ? podium.row : "hover:bg-hover"
              }`}
            >
              <RankCell rank={m.rank} />
              <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
              <div className={`truncate font-mono text-[13.5px] ${m.kakaoNickname === "-" ? "text-ghost" : "text-gold"}`}>
                {m.kakaoNickname}
              </div>
              <div className={`truncate font-mono text-[13.5px] ${m.discordName === "-" ? "text-ghost" : "text-accent-soft"}`}>
                {m.discordName}
              </div>
              <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
              <div
                className={`text-right font-mono text-[15.5px] font-bold ${
                  m.mmr === 0 ? "text-ghost" : m.mmr >= 1600 ? "text-gold" : "text-fg"
                }`}
              >
                {m.mmr}
              </div>
              <div className="text-right font-mono text-[13.5px] text-muted">{m.playedCount}</div>
              <div className={`text-right font-mono text-[13.5px] ${m.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
                {m.wins}
              </div>
              <div className={`text-right font-mono text-[13.5px] ${m.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
                {m.losses}
              </div>
              <div
                className={`text-right font-mono text-[13.5px] ${
                  m.daysSinceActive !== null && m.daysSinceActive >= 30
                    ? "text-danger-soft"
                    : m.daysSinceActive !== null && m.daysSinceActive >= 14
                    ? "text-orange"
                    : "text-muted"
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
      </div>
      <div className="md:hidden">
        {rows.map((m) => (
          <MemberCard key={m.id} row={m} />
        ))}
      </div>
    </>
  );
}
