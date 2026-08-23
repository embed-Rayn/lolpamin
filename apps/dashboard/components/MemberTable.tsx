import type { MemberRow } from "@/lib/queries/members";

export function MemberTable({ rows }: { rows: MemberRow[] }) {
  return (
    <>
      <div className="grid grid-cols-[180px_1fr_92px_132px_210px] gap-0 border-b border-white/[.06] bg-[#12161F] px-4.5 py-2.5 text-[10.5px] font-bold tracking-wide text-[#6E7889]">
        <div>실명</div>
        <div>라이엇 ID</div>
        <div className="text-right">ELO</div>
        <div className="text-right">마지막 활동</div>
        <div className="pl-5">계정 연결</div>
      </div>
      {rows.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-[180px_1fr_92px_132px_210px] items-center border-b border-white/[.04] px-4.5 py-2.5 text-[12.5px] hover:bg-[#181E29]"
        >
          <div className="truncate font-semibold">{m.name}</div>
          <div className={`truncate pr-3 font-mono text-[11.5px] ${m.riot === "미등록" ? "text-[#5C6577]" : "text-[#9FB0CC]"}`}>
            {m.riot}
          </div>
          <div className={`text-right font-mono text-[13px] font-bold ${m.elo >= 1600 ? "text-[#F2C75C]" : "text-[#E6EAF2]"}`}>
            {m.elo}
          </div>
          <div
            className={`text-right font-mono text-[11.5px] ${
              m.daysSinceActive !== null && m.daysSinceActive >= 30
                ? "text-[#EE8B8B]"
                : m.daysSinceActive !== null && m.daysSinceActive >= 14
                ? "text-[#F2985C]"
                : "text-[#8A94A6]"
            }`}
          >
            {m.lastActiveLabel}
          </div>
          <div className="flex gap-1.5 pl-5">
            <span
              className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${
                m.discordLinked
                  ? "border-[#5865F2]/30 bg-[#5865F2]/[.13] text-[#8FA9F5]"
                  : "border-white/[.07] bg-white/[.03] text-[#5C6577]"
              }`}
            >
              {m.discordLabel}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${
                m.kakaoLinked
                  ? "border-[#FFC000]/30 bg-[#FFC000]/[.12] text-[#F2C75C]"
                  : "border-white/[.07] bg-white/[.03] text-[#5C6577]"
              }`}
            >
              {m.kakaoLabel}
            </span>
            {m.isHalf && (
              <span className="rounded-md border border-[#ED7D31]/35 bg-[#ED7D31]/[.16] px-2 py-0.5 text-[10.5px] font-extrabold text-[#F2985C]">
                미연결
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
