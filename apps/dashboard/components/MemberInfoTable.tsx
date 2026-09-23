import Link from "next/link";
import {
  birthYearLabel,
  type MemberInfoRow,
  type MemberInfoSort,
  type ModeRecord,
  type SortDirection,
} from "@/lib/queries/member-info";
import { laneLabel, tierLabel, tierScore } from "@lolpamin/core";
import { MemberInfoCard } from "@/components/MemberInfoCard";
import { MasteryChampions } from "@/components/MasteryChampions";

// 이름은 실명이라 석 자 안팎, 나이는 두 자리다 — 둘 다 고정폭으로 두고 남는 폭은 라이엇
// 계정이 가져간다. 협곡·칼바람 10칸은 한 덩어리(600px)로 묶고 안에서 균등하게 나눈다 —
// METRICS_GRID 참고. 주라인·부라인은 두 글자라 좁다. 모스트는 아이콘 세 개와 레벨이 들어간다.
// 이 화면은 보기 전용이라 편집 칸이 없다 — 편집은 /member-admin.
const GRID = "grid-cols-[80px_56px_600px_80px_80px_56px_56px_1.2fr_132px]";

// 협곡 5칸 + 칼바람 5칸, 전부 같은 폭. 두 절반이 정확히 5칸씩이라 METRICS_BG의 50%가
// 곧 협곡·칼바람 경계다.
const METRICS_GRID = "grid-cols-10";

// 협곡·칼바람 블록을 하나의 그라데이션으로 칠한다. 칸마다 배경을 따로 칠하면 gap-3가
// 흰 틈으로 보이고, 두 블록 사이에도 같은 gap이 끼어 파랑·주황이 맞닿지 않는다 —
// 한 덩어리 위에 50:50 그라데이션을 얹으면 내부 칸 간격도, 두 블록의 경계도 전부 이
// 배경 하나가 이어서 채운다. 두 절반은 실제로 정확히 5칸씩 같은 폭이라 50%가 곧 그
// 경계다. 불투명한 accent-tint가 아니라 accent에 alpha를 얹는 이유: 스킨마다 accent가
// 다르므로 같은 alpha면 어느 스킨에서든 그 스킨 색의 연한 판이 되고, 아래 깔린 지브라
// 줄무늬도 비쳐 보인다.
const METRICS_BG = {
  background:
    "linear-gradient(90deg, rgb(var(--c-accent) / 0.07) 0%, rgb(var(--c-accent) / 0.07) 50%, rgb(var(--c-orange) / 0.07) 50%, rgb(var(--c-orange) / 0.07) 100%)",
};

function mmrClassName(mmr: number): string {
  if (mmr === 0) return "text-ghost";
  return mmr >= 1600 ? "text-gold" : "text-fg";
}

// 이름은 오름차순, 숫자는 내림차순으로 시작한다 — 가나다순으로 찾는 칸과 "가장 많이/잘한
// 사람"을 찾는 칸의 기대가 서로 반대다. 같은 칸을 다시 누르면 방향만 뒤집는다.
// 나이 칸은 출생연도라, 오름차순이 곧 연장자부터다.
const TEXT_SORTS: MemberInfoSort[] = ["realName", "age"];

function winRateLabel(record: ModeRecord): string {
  return record.winRate === null ? "-" : `${record.winRate}%`;
}

// 점수 0(아이언·언랭)은 "점수를 매기지 않는 구간"이라 흐리게 둔다 — MemberTierCell의 보기 모드와 같다.
function TierText({ tier }: { tier: MemberInfoRow["tier"] }) {
  return (
    <div className={`truncate text-center ${tierScore(tier) === 0 ? "text-ghost" : "text-fg-2"}`}>{tierLabel(tier)}</div>
  );
}

export function MemberInfoTable({
  rows,
  sort,
  dir,
  query,
}: {
  rows: MemberInfoRow[];
  sort: MemberInfoSort;
  dir: SortDirection;
  query: string;
}) {
  function sortHref(key: MemberInfoSort): string {
    const startDir: SortDirection = TEXT_SORTS.includes(key) ? "asc" : "desc";
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : startDir;
    const params = new URLSearchParams({ sort: key, dir: nextDir });
    if (query) params.set("q", query);
    return `/member-info?${params.toString()}`;
  }

  function sortMark(key: MemberInfoSort): string {
    if (sort !== key) return "";
    return dir === "desc" ? " ↓" : " ↑";
  }

  function SortLink({ sortKey, label, align }: { sortKey: MemberInfoSort; label: string; align?: "center" }) {
    return (
      <Link href={sortHref(sortKey)} className={`hover:text-fg-2 ${align === "center" ? "text-center" : ""}`}>
        {label}
        {sortMark(sortKey)}
      </Link>
    );
  }

  return (
    <>
      <div className="hidden md:block md:pb-4">
        <div className={`grid ${GRID} gap-3 bg-surface-2 px-5 pt-2 text-[12.5px] font-bold tracking-wide`}>
          <div />
          <div />
          {/* 협곡·칼바람 이름표는 서로 떨어진 두 상자다 — 아래 행들의 그라데이션과 달리
              여기서만 둘 사이에 틈을 두고 위 모서리를 둥글린다. */}
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded-t-lg bg-accent/[.14] py-2 text-center text-accent-soft">협곡</div>
            <div className="rounded-t-lg bg-orange/[.14] py-2 text-center text-orange">칼바람</div>
          </div>
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
        <div
          className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 pb-3 pt-1.5 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <SortLink sortKey="realName" label="이름" align="center" />
          <SortLink sortKey="age" label="나이" align="center" />
          {/* -mt-1.5 pt-1.5 -mb-3 pb-3: 이 행의 위·아래 여백이 서로 다르다(pt-1.5,
              pb-3) — 양쪽 다 값이 다른 만큼 밀어내고 되채워야 배경이 정확히 여백까지
              닿는다. */}
          <div className={`-mb-3 -mt-1.5 grid ${METRICS_GRID} gap-3 pb-3 pt-1.5`} style={METRICS_BG}>
            <SortLink sortKey="riftMmr" label="MMR" align="center" />
            <SortLink sortKey="riftGames" label="판" align="center" />
            <div className="text-center">승</div>
            <div className="text-center">패</div>
            <SortLink sortKey="riftWinRate" label="승률" align="center" />
            <SortLink sortKey="aramMmr" label="MMR" align="center" />
            <SortLink sortKey="aramGames" label="판" align="center" />
            <div className="text-center">승</div>
            <div className="text-center">패</div>
            <SortLink sortKey="aramWinRate" label="승률" align="center" />
          </div>
          <SortLink sortKey="peakTier" label="최고티어" align="center" />
          <SortLink sortKey="tier" label="산정티어" align="center" />
          <div className="text-center">주라인</div>
          <div className="text-center">부라인</div>
          <div className="text-center">라이엇 계정</div>
          <div className="text-center">모스트</div>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13.5px] text-ghost">조건에 맞는 회원이 없습니다.</div>
        )}
        {rows.map((m, index) => (
          <div
            key={m.id}
            className={`grid ${GRID} items-center gap-3 border-b border-ink/[.04] px-5 py-3 text-[14px] hover:bg-hover ${
              index % 2 === 1 ? "bg-surface-2" : ""
            }`}
          >
            <div className={`truncate text-center font-bold ${m.realName === "-" ? "text-ghost" : ""}`}>{m.realName}</div>
            <div className={`text-center text-[13.5px] ${m.birthYear === null ? "text-ghost" : "text-muted"}`}>
              {birthYearLabel(m.birthYear)}
            </div>

            {/* -my-3 py-3: 그리드 컨테이너의 py-3는 이 셀이 아니라 컨테이너 자신의
                여백이라, 셀 배경이 위아래로 그 여백까지 덮게 하려면 밀어냈다가(-my-3)
                똑같이 되채워야(py-3) 한다 — 행 높이는 그대로고 배경만 꽉 찬다. */}
            <div className={`-my-3 grid ${METRICS_GRID} items-center gap-3 py-3`} style={METRICS_BG}>
              <div className={`text-center text-[14px] font-bold ${mmrClassName(m.rift.mmr)}`}>{m.rift.mmr}</div>
              <div className="text-center text-[13.5px] text-muted">{m.rift.games}</div>
              <div className={`text-center text-[13.5px] ${m.rift.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
                {m.rift.wins}
              </div>
              <div className={`text-center text-[13.5px] ${m.rift.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
                {m.rift.losses}
              </div>
              <div
                className={`text-center text-[13.5px] ${m.rift.winRate === null ? "text-ghost" : "text-fg"}`}
              >
                {winRateLabel(m.rift)}
              </div>

              <div className={`text-center text-[14px] font-bold ${mmrClassName(m.aram.mmr)}`}>{m.aram.mmr}</div>
              <div className="text-center text-[13.5px] text-muted">{m.aram.games}</div>
              <div className={`text-center text-[13.5px] ${m.aram.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
                {m.aram.wins}
              </div>
              <div className={`text-center text-[13.5px] ${m.aram.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
                {m.aram.losses}
              </div>
              <div
                className={`text-center text-[13.5px] ${m.aram.winRate === null ? "text-ghost" : "text-fg"}`}
              >
                {winRateLabel(m.aram)}
              </div>
            </div>

            <TierText tier={m.peakTier} />
            <TierText tier={m.tier} />
            <div className={`text-center ${m.mainLane ? "text-fg-2" : "text-ghost"}`}>{laneLabel(m.mainLane)}</div>
            <div className={`text-center ${m.subLane ? "text-fg-2" : "text-ghost"}`}>{laneLabel(m.subLane)}</div>
            <div className="flex flex-wrap justify-center gap-1">
              {m.riotAccounts.length === 0 ? (
                <span className="text-ghost">-</span>
              ) : (
                m.riotAccounts.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[12px] text-success-soft"
                  >
                    {a.gameName}#{a.tagLine}
                  </span>
                ))
              )}
            </div>
            <MasteryChampions masteries={m.masteries} />
          </div>
        ))}
      </div>
      <div className="md:hidden">
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13.5px] text-ghost">조건에 맞는 회원이 없습니다.</div>
        )}
        {rows.map((m) => (
          <MemberInfoCard key={m.id} row={m} />
        ))}
      </div>
    </>
  );
}
