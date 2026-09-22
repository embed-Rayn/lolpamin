import Link from "next/link";
import type { MemberActivityFilter, MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberCard, PodiumFrame, RankBadge, podiumOf } from "@/components/MemberCard";

// 순위, 실명, 디코, 티어, MMR, 판, 승, 패, 승률, 마지막 활동, 관리. 카톡 닉네임 컬럼은
// 뺐다(디코 닉네임이 유일한 식별용 컬럼으로 남는다) — Riot ID도 이 표에서 뺐다, 편집은
// /team-builder에 남아 있다.
const GRID = "grid-cols-[64px_0.6fr_1fr_112px_88px_46px_44px_44px_60px_120px_80px]";

function winRateLabel(wins: number, played: number): string {
  if (played === 0) return "-";
  return `${Math.round((wins / played) * 100)}%`;
}

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
  activity,
  query,
  basePath,
}: {
  rows: MemberRow[];
  isAdmin: boolean;
  sort: MemberSort;
  dir: SortDirection;
  filter: MemberFilter;
  activity: MemberActivityFilter;
  query: string;
  // 정렬 링크가 돌아올 페이지 — MemberFilters의 basePath와 같은 이유다.
  basePath: string;
}) {
  function sortHref(key: MemberSort): string {
    // 같은 기준을 다시 누르면 방향을 뒤집고, 다른 기준으로 바꾸면 내림차순부터 시작한다.
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams({ filter, sort: key, dir: nextDir });
    if (activity !== "all") params.set("activity", activity);
    if (query) params.set("q", query);
    return `${basePath}?${params.toString()}`;
  }

  function sortMark(key: MemberSort): string {
    if (sort !== key) return "";
    return dir === "desc" ? " ↓" : " ↑";
  }

  return (
    <>
      {/* 데스크톱: 원래 그리드 표. 폰: 아래 md:hidden 카드 목록이 대신한다.
          p-3: 카드 테두리와 표 내용(1~3위 박스 포함) 사이에 여백을 둔다 — 필터 바는
          툴바라 여기 포함하지 않고 edge-to-edge로 둔다. */}
      <div className="hidden md:block p-3">
        <div
          className={`grid ${GRID} gap-4 rounded-t-lg border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            순위
          </Link>
          <Link href={sortHref("realName")} className="text-center hover:text-fg-2">
            실명{sortMark("realName")}
          </Link>
          <div>디코 닉네임</div>
          <Link href={sortHref("tier")} className="text-center hover:text-fg-2">
            티어{sortMark("tier")}
          </Link>
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            MMR{sortMark("mmr")}
          </Link>
          <div className="text-center">판</div>
          <div className="text-center">승</div>
          <div className="text-center">패</div>
          <div className="text-center">승률</div>
          <div className="text-center">마지막 활동</div>
          <div className="text-center">관리</div>
        </div>
        {rows.map((m) => {
          const podium = podiumOf(m.rank);
          const cells = (
            <>
              <RankCell rank={m.rank} />
              <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
              <div className={`truncate font-mono text-[13.5px] ${m.discordName === "-" ? "text-ghost" : "text-accent-soft"}`}>
                {m.discordName}
              </div>
              <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
              <div
                className={`text-center font-mono text-[15.5px] font-bold ${
                  m.mmr === 0 ? "text-ghost" : m.mmr >= 1600 ? "text-gold" : "text-fg"
                }`}
              >
                {m.mmr}
              </div>
              <div className="text-center font-mono text-[13.5px] text-muted">{m.playedCount}</div>
              <div className={`text-center font-mono text-[13.5px] ${m.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
                {m.wins}
              </div>
              <div className={`text-center font-mono text-[13.5px] ${m.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
                {m.losses}
              </div>
              <div className="text-center font-mono text-[13.5px] text-muted">{winRateLabel(m.wins, m.playedCount)}</div>
              <div
                className={`text-center font-mono text-[13.5px] ${
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
                <div className="flex justify-center">
                  <DeleteMemberButton
                    memberId={m.id}
                    label={displayLabel(m)}
                    mentionCount={m.mentionCount}
                    gameCount={m.gameCount}
                    aliasCount={m.aliasCount}
                  />
                </div>
              ) : (
                <div />
              )}
            </>
          );
          if (podium) {
            return (
              <PodiumFrame key={m.id} rank={m.rank as 1 | 2 | 3}>
                <div className={`grid ${GRID} relative items-center gap-4 px-5 py-3.5 text-[15px] ${podium.row}`}>
                  {cells}
                </div>
              </PodiumFrame>
            );
          }
          return (
            <div
              key={m.id}
              className={`grid ${GRID} relative items-center gap-4 border-b border-ink/[.04] px-5 py-3.5 text-[15px] hover:bg-hover`}
            >
              {cells}
            </div>
          );
        })}
      </div>
      <div className="md:hidden p-3">
        {rows.map((m) => (
          <MemberCard key={m.id} row={m} />
        ))}
      </div>
    </>
  );
}
