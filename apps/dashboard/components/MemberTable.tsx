import type { MemberRow } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";

function displayLabel(m: MemberRow): string {
  for (const candidate of [m.realName, m.kakaoNickname, m.discordHandle]) {
    if (candidate !== "-") return candidate;
  }
  return "이름 미확인";
}

export function MemberTable({ rows, isAdmin }: { rows: MemberRow[]; isAdmin: boolean }) {
  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_1fr_100px_140px_72px] gap-4 border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[11.5px] font-bold tracking-wide text-[#6E7889]">
        <div>실명</div>
        <div>카톡 닉네임</div>
        <div>디코 닉네임</div>
        <div className="text-right">ELO</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">관리</div>
      </div>
      {rows.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-[1fr_1fr_1fr_100px_140px_72px] items-center gap-4 border-b border-white/[.04] px-5 py-3.5 text-[14px] hover:bg-[#181E29]"
        >
          <div className={`truncate font-semibold ${m.realName === "-" ? "text-[#5C6577]" : ""}`}>{m.realName}</div>
          <div className={`truncate font-mono text-[12.5px] ${m.kakaoNickname === "-" ? "text-[#5C6577]" : "text-[#F2C75C]"}`}>
            {m.kakaoNickname}
          </div>
          <div className={`truncate font-mono text-[12.5px] ${m.discordHandle === "-" ? "text-[#5C6577]" : "text-[#8FA9F5]"}`}>
            {m.discordHandle}
          </div>
          <div className={`text-right font-mono text-[14.5px] font-bold ${m.elo >= 1600 ? "text-[#F2C75C]" : "text-[#E6EAF2]"}`}>
            {m.elo}
          </div>
          <div
            className={`text-right font-mono text-[12.5px] ${
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
            />
          ) : (
            <div />
          )}
        </div>
      ))}
    </>
  );
}
