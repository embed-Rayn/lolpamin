import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export function InactiveTable({ rows }: { rows: InactiveRow[] }) {
  const maxDays = Math.max(60, ...rows.map((r) => r.daysSinceActive));

  return (
    <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-4.5 py-3">
        <h2 className="m-0 text-[13.5px] font-bold">미활동 회원 · 경과일 순</h2>
        <span className="text-[11px] text-[#6E7889]">카카오톡 오픈채팅 @멘션 수집 기준</span>
      </div>
      <div className="grid grid-cols-[170px_150px_1fr_110px_130px] border-b border-white/[.06] bg-[#12161F] px-4.5 py-2.5 text-[10.5px] font-bold text-[#6E7889]">
        <div>실명</div>
        <div>카톡 닉네임</div>
        <div>경과일</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">MMR / 최근 내전</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[170px_150px_1fr_110px_130px] items-center border-b border-white/[.04] px-4.5 py-3 hover:bg-[#181E29]">
          <div className="text-[12.5px] font-semibold">{r.name}</div>
          <div className="text-xs text-[#8A94A6]">{r.kakaoNickname}</div>
          <div className="flex items-center gap-2.5 pr-6">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1E2534]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((r.daysSinceActive / maxDays) * 100))}%`,
                  background: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C",
                }}
              />
            </div>
            <span
              className="w-14 text-right font-mono text-[13px] font-bold"
              style={{ color: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C" }}
            >
              {r.daysSinceActive}일
            </span>
          </div>
          <div className="text-right font-mono text-[11.5px] text-[#7A8496]">{r.lastActiveDate}</div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-xs font-bold">{r.mmr}</span>
            <span className="text-[10.5px] text-[#6E7889]">내전 {r.gameCount}회</span>
          </div>
        </div>
      ))}
    </section>
  );
}
