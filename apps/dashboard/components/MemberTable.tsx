import Link from "next/link";
import type { MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberRiotIdCell } from "@/components/MemberRiotIdCell";

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
      <div className="grid grid-cols-[0.5fr_1fr_1fr_112px_1fr_88px_46px_44px_44px_120px_80px] gap-4 border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[12.5px] font-bold tracking-wide text-[#6E7889]">
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
        <div>Riot ID</div>
        <Link href={sortHref("mmr")} className="text-right hover:text-[#B7C0D0]">
          MMR{sortMark("mmr")}
        </Link>
        <div className="text-right">판</div>
        <div className="text-right">승</div>
        <div className="text-right">패</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">관리</div>
      </div>
      {rows.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-[0.5fr_1fr_1fr_112px_1fr_88px_46px_44px_44px_120px_80px] items-center gap-4 border-b border-white/[.04] px-5 py-3.5 text-[15px] hover:bg-[#181E29]"
        >
          <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
          <div className={`truncate font-mono text-[13.5px] ${m.kakaoNickname === "-" ? "text-[#5C6577]" : "text-[#F2C75C]"}`}>
            {m.kakaoNickname}
          </div>
          <div className={`truncate font-mono text-[13.5px] ${m.discordName === "-" ? "text-[#5C6577]" : "text-[#8FA9F5]"}`}>
            {m.discordName}
          </div>
          <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
          <MemberRiotIdCell memberId={m.id} riotId={m.riotId} isAdmin={isAdmin} />
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
      ))}
    </>
  );
}
