import Link from "next/link";
import type { MemberInfoRow, MemberInfoSort, ModeRecord, SortDirection } from "@/lib/queries/member-info";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberNoteCell } from "@/components/MemberNoteCell";
import { MemberInfoCard } from "@/components/MemberInfoCard";

// 이름은 실명이라 석 자 안팎이다 — 고정폭으로 두고 남는 폭은 닉네임과 비고가 가져간다.
const GRID = "grid-cols-[40px_72px_1.3fr_58px_38px_34px_34px_54px_58px_38px_34px_34px_54px_112px_1.3fr]";

function mmrClassName(mmr: number): string {
  if (mmr === 0) return "text-ghost";
  return mmr >= 1600 ? "text-gold" : "text-fg";
}

// 이름은 오름차순, 숫자는 내림차순으로 시작한다 — 가나다순으로 찾는 칸과 "가장 많이/잘한
// 사람"을 찾는 칸의 기대가 서로 반대다. 같은 칸을 다시 누르면 방향만 뒤집는다.
const TEXT_SORTS: MemberInfoSort[] = ["realName", "kakaoNickname"];

function winRateLabel(record: ModeRecord): string {
  return record.winRate === null ? "-" : `${record.winRate}%`;
}

export function MemberInfoTable({
  rows,
  isAdmin,
  sort,
  dir,
  query,
}: {
  rows: MemberInfoRow[];
  isAdmin: boolean;
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

  function SortLink({ sortKey, label, align }: { sortKey: MemberInfoSort; label: string; align?: "right" }) {
    return (
      <Link href={sortHref(sortKey)} className={`hover:text-fg-2 ${align === "right" ? "text-right" : ""}`}>
        {label}
        {sortMark(sortKey)}
      </Link>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <div
          className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 pt-3 text-[11.5px] font-bold tracking-wide text-ghost`}
        >
          <div />
          <div />
          <div />
          <div className="col-span-5 text-center text-accent-soft">협곡</div>
          <div className="col-span-5 text-center text-orange">칼바람</div>
          <div />
          <div />
        </div>
        <div
          className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 pb-3 pt-1.5 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <div className="text-right">NO.</div>
          <SortLink sortKey="realName" label="이름" />
          <SortLink sortKey="kakaoNickname" label="닉네임" />
          <SortLink sortKey="riftMmr" label="MMR" align="right" />
          <SortLink sortKey="riftGames" label="판" align="right" />
          <div className="text-right">승</div>
          <div className="text-right">패</div>
          <SortLink sortKey="riftWinRate" label="승률" align="right" />
          <SortLink sortKey="aramMmr" label="MMR" align="right" />
          <SortLink sortKey="aramGames" label="판" align="right" />
          <div className="text-right">승</div>
          <div className="text-right">패</div>
          <SortLink sortKey="aramWinRate" label="승률" align="right" />
          <SortLink sortKey="tier" label="현재티어" />
          <div>비고</div>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13.5px] text-ghost">조건에 맞는 회원이 없습니다.</div>
        )}
        {rows.map((m, index) => (
          <div
            key={m.id}
            className={`grid ${GRID} items-center gap-3 border-b border-ink/[.04] px-5 py-3 text-[14px] hover:bg-hover`}
          >
            <div className="text-right font-mono text-[12.5px] text-ghost">{index + 1}</div>
            <div className={`truncate font-semibold ${m.realName === "-" ? "text-ghost" : ""}`}>{m.realName}</div>
            <div
              className={`truncate font-mono text-[13px] ${m.kakaoNickname === "-" ? "text-ghost" : "text-gold"}`}
            >
              {m.kakaoNickname}
            </div>

            <div className={`text-right font-mono text-[13.5px] font-bold ${mmrClassName(m.rift.mmr)}`}>{m.rift.mmr}</div>
            <div className="text-right font-mono text-[13px] text-muted">{m.rift.games}</div>
            <div className={`text-right font-mono text-[13px] ${m.rift.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
              {m.rift.wins}
            </div>
            <div className={`text-right font-mono text-[13px] ${m.rift.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
              {m.rift.losses}
            </div>
            <div
              className={`text-right font-mono text-[13px] ${m.rift.winRate === null ? "text-ghost" : "text-fg"}`}
            >
              {winRateLabel(m.rift)}
            </div>

            <div className={`text-right font-mono text-[13.5px] font-bold ${mmrClassName(m.aram.mmr)}`}>{m.aram.mmr}</div>
            <div className="text-right font-mono text-[13px] text-muted">{m.aram.games}</div>
            <div className={`text-right font-mono text-[13px] ${m.aram.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
              {m.aram.wins}
            </div>
            <div className={`text-right font-mono text-[13px] ${m.aram.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
              {m.aram.losses}
            </div>
            <div
              className={`text-right font-mono text-[13px] ${m.aram.winRate === null ? "text-ghost" : "text-fg"}`}
            >
              {winRateLabel(m.aram)}
            </div>

            <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
            <MemberNoteCell memberId={m.id} note={m.note} isAdmin={isAdmin} />
          </div>
        ))}
      </div>
      <div className="md:hidden">
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13.5px] text-ghost">조건에 맞는 회원이 없습니다.</div>
        )}
        {rows.map((m, index) => (
          <MemberInfoCard key={m.id} row={m} index={index} />
        ))}
      </div>
    </>
  );
}
