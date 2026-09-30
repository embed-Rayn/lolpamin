import Link from "next/link";
import type { MemberActivityFilter, MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberLaneCell } from "@/components/MemberLaneCell";
import { MasteryChampions } from "@/components/MasteryChampions";
import { MasteryChampionStrip } from "@/components/MasteryChampionStrip";
import { MemberCard, PodiumFrame, RankBadge, podiumOf } from "@/components/MemberCard";

// 랭킹 화면이라 보기만 한다 — 회원 삭제(관리)와 티어 편집은 /member-admin에 있다. 두 모드가
// 칸 구성이 다르다.
// 협곡: 순위, 실명, MMR, 판, 승, 패, 승률, 주라인, 부라인, 최고티어, 마지막 활동, 모스트(5, x레벨).
//   라인은 운영진만 그 자리에서 고친다(MemberLaneCell — /member-admin과 같은 셀). 티어는
//   산정티어가 아닌 최고티어를 읽기 전용으로 둔다.
// 칼바람: 순위, 실명, MMR, 판, 승, 패, 승률, 마지막 활동, 모스트(10 + 숙련도). 칼바람은 챔피언이
//   무작위라 티어가 뜻이 없고, 대신 폭넓은 챔피언 풀을 보인다.
const GRID = {
  // 실명은 석 자 안팎이라 남는 폭을 혼자 갖지 않게 한다 — 여분은 실명·마지막 활동·모스트가
  // 0.7 : 0.8 : 1.3으로 나눠 가진다.
  RIFT: "grid-cols-[64px_minmax(80px,0.7fr)_88px_46px_44px_44px_60px_72px_72px_88px_minmax(100px,0.8fr)_minmax(232px,1.3fr)]",
  ARAM: "grid-cols-[64px_minmax(96px,0.6fr)_88px_46px_44px_44px_60px_96px_minmax(0,2.4fr)]",
} as const;

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

export function MemberTable({
  rows,
  isAdmin,
  sort,
  dir,
  filter,
  activity,
  query,
  basePath,
  mode,
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
  mode: "RIFT" | "ARAM";
}) {
  const grid = GRID[mode];
  const isRift = mode === "RIFT";
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
          className={`grid ${grid} gap-4 rounded-t-lg border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            순위
          </Link>
          <Link href={sortHref("realName")} className="text-center hover:text-fg-2">
            실명{sortMark("realName")}
          </Link>
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            MMR{sortMark("mmr")}
          </Link>
          <div className="text-center">판</div>
          <div className="text-center">승</div>
          <div className="text-center">패</div>
          <div className="text-center">승률</div>
          {isRift && (
            <>
              <div className="text-center">주라인</div>
              <div className="text-center">부라인</div>
              <Link href={sortHref("peakTier")} className="text-center hover:text-fg-2">
                최고티어{sortMark("peakTier")}
              </Link>
            </>
          )}
          <div className="text-center">마지막 활동</div>
          <div className="text-center">{isRift ? "모스트 · 레벨" : "모스트 챔피언 · 숙련도"}</div>
        </div>
        {rows.map((m) => {
          const podium = podiumOf(m.rank);
          const cells = (
            <>
              <RankCell rank={m.rank} />
              <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
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
              {isRift && (
                <>
                  <MemberLaneCell memberId={m.id} slot="main" lane={m.mainLane} isAdmin={isAdmin} />
                  <MemberLaneCell memberId={m.id} slot="sub" lane={m.subLane} isAdmin={isAdmin} />
                  <MemberTierCell memberId={m.id} tier={m.peakTier} field="peakTier" isAdmin={false} />
                </>
              )}
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
              {isRift ? (
                <MasteryChampions masteries={m.masteries.slice(0, 5)} />
              ) : (
                <MasteryChampionStrip masteries={m.masteries} />
              )}
            </>
          );
          if (podium) {
            return (
              <PodiumFrame key={m.id} rank={m.rank as 1 | 2 | 3}>
                <div className={`grid ${grid} relative items-center gap-4 px-5 py-3.5 text-[15px] ${podium.row}`}>
                  {cells}
                </div>
              </PodiumFrame>
            );
          }
          return (
            <div
              key={m.id}
              className={`grid ${grid} relative items-center gap-4 border-b border-ink/[.04] px-5 py-3.5 text-[15px] hover:bg-hover`}
            >
              {cells}
            </div>
          );
        })}
      </div>
      <div className="md:hidden p-3">
        {rows.map((m) => (
          <MemberCard key={m.id} row={m} showTier={isRift} />
        ))}
      </div>
    </>
  );
}
