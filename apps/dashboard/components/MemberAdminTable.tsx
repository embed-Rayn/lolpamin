import Link from "next/link";
import { INACTIVITY_THRESHOLD_DAYS, LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";
import type { MemberAdminRow, MemberAdminSort, MemberAdminSortDirection } from "@/lib/queries/member-admin";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberAgeCell } from "@/components/MemberAgeCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberLaneCell } from "@/components/MemberLaneCell";
import { MemberRiotAccountsCell } from "@/components/MemberRiotAccountsCell";
import { MasteryChampions } from "@/components/MasteryChampions";
import { InactiveLastActiveCell } from "@/components/InactiveLastActiveCell";
import { MemberNoteCell } from "@/components/MemberNoteCell";

// 순번·나이·활동일은 몇 글자라 고정폭, 티어 두 칸은 select라 조금 넓게. 모스트는 아이콘
// 세 개와 레벨이 들어간다. 라이엇 계정(칩 + 입력창)과 비고가 남는 폭을 나눠 가진다.
const GRID = "grid-cols-[40px_88px_56px_104px_104px_72px_72px_1.4fr_132px_136px_64px_1fr]";

// 이름·나이는 오름차순, 티어는 높은 쪽부터, 최근 활동은 오래된 쪽부터 시작한다 — 이 화면에서
// 찾는 것은 "누가 오래 안 나왔나"다.
const START_DIR: Record<MemberAdminSort, MemberAdminSortDirection> = {
  realName: "asc",
  age: "asc",
  peakTier: "desc",
  tier: "desc",
  lastActive: "asc",
};

function daysClassName(days: number): string {
  if (days >= LONG_INACTIVITY_THRESHOLD_DAYS) return "text-danger-soft";
  if (days >= INACTIVITY_THRESHOLD_DAYS) return "text-orange";
  return "text-muted";
}

export function MemberAdminTable({
  rows,
  sort,
  dir,
}: {
  rows: MemberAdminRow[];
  sort: MemberAdminSort;
  dir: MemberAdminSortDirection;
}) {
  function SortLink({ sortKey, label }: { sortKey: MemberAdminSort; label: string }) {
    const nextDir = sort === sortKey ? (dir === "asc" ? "desc" : "asc") : START_DIR[sortKey];
    const mark = sort === sortKey ? (dir === "desc" ? " ↓" : " ↑") : "";
    return (
      <Link href={`/member-admin?sort=${sortKey}&dir=${nextDir}`} className="text-center hover:text-fg-2">
        {label}
        {mark}
      </Link>
    );
  }

  return (
    <div>
      <div
        className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
      >
        <div className="text-center">순번</div>
        <SortLink sortKey="realName" label="이름" />
        <SortLink sortKey="age" label="나이" />
        <SortLink sortKey="peakTier" label="최고티어" />
        <SortLink sortKey="tier" label="산정티어" />
        <div className="text-center">주라인</div>
        <div className="text-center">부라인</div>
        <div className="text-center">라이엇 계정</div>
        <div className="text-center">모스트</div>
        <SortLink sortKey="lastActive" label="최근 활동 날짜" />
        <div className="text-center">활동일</div>
        <div className="text-center">비고</div>
      </div>
      {rows.length === 0 && <div className="px-5 py-8 text-center text-[13.5px] text-ghost">회원이 없습니다.</div>}
      {rows.map((m, index) => (
        <div
          key={m.id}
          className={`grid ${GRID} items-center gap-3 border-b border-ink/[.04] px-5 py-3 text-[14px] hover:bg-hover ${
            index % 2 === 1 ? "bg-surface-2" : ""
          }`}
        >
          <div className="text-center font-mono text-[12.5px] text-faint">{index + 1}</div>
          <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin />
          <MemberAgeCell memberId={m.id} age={m.age} birthYear={m.birthYear} />
          <MemberTierCell memberId={m.id} tier={m.peakTier} field="peakTier" isAdmin />
          <MemberTierCell memberId={m.id} tier={m.tier} field="tier" isAdmin />
          <MemberLaneCell memberId={m.id} slot="main" lane={m.mainLane} isAdmin />
          <MemberLaneCell memberId={m.id} slot="sub" lane={m.subLane} isAdmin />
          <MemberRiotAccountsCell memberId={m.id} accounts={m.riotAccounts} isAdmin />
          <MasteryChampions masteries={m.masteries} />
          <InactiveLastActiveCell memberId={m.id} lastActiveDate={m.lastActiveDate} isAdmin />
          <div className={`text-center font-mono text-[12.5px] ${daysClassName(m.daysSinceActive)}`}>
            D+{m.daysSinceActive}
          </div>
          <MemberNoteCell memberId={m.id} note={m.note} isAdmin />
        </div>
      ))}
    </div>
  );
}
