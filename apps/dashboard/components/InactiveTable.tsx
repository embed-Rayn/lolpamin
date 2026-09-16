import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";
import { InactiveLastActiveCell } from "./InactiveLastActiveCell";

// 경과일 바는 남는 폭을 다 먹지 않는다 — 마지막 활동 칸에 date input이 들어가면서
// 바가 짧아져야 행이 한 줄에 남는다.
const COLUMNS = "grid-cols-[186px_164px_minmax(0,1fr)_170px_146px]";

export function InactiveTable({ rows, isAdmin }: { rows: InactiveRow[]; isAdmin: boolean }) {
  const maxDays = Math.max(30, ...rows.map((r) => r.daysSinceActive));

  return (
    <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-3">
        <h2 className="m-0 text-[14.5px] font-bold">미활동 회원 · 경과일 순</h2>
        <span className="text-[12px] text-[#6E7889]">카카오톡 오픈채팅 @멘션 수집 기준</span>
      </div>
      <div className={`grid ${COLUMNS} border-b border-white/[.06] bg-[#12161F] px-5 py-2.5 text-[12px] font-bold text-[#6E7889]`}>
        <div>실명</div>
        <div>카톡 닉네임</div>
        <div>경과일</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">MMR / 최근 내전</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`grid ${COLUMNS} items-center border-b border-white/[.04] px-5 py-3 hover:bg-[#181E29]`}>
          <div className="text-[13.5px] font-semibold">{r.name}</div>
          <div className="text-[13px] text-[#8A94A6]">{r.kakaoNickname}</div>
          <div className="flex items-center gap-2.5 pr-6">
            <div className="h-2 max-w-[220px] flex-1 overflow-hidden rounded-full bg-[#1E2534]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((r.daysSinceActive / maxDays) * 100))}%`,
                  background: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C",
                }}
              />
            </div>
            <span
              className="w-16 text-right font-mono text-[14px] font-bold"
              style={{ color: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C" }}
            >
              {r.daysSinceActive}일
            </span>
          </div>
          <div className="pl-4">
            <InactiveLastActiveCell memberId={r.id} lastActiveDate={r.lastActiveDate} isAdmin={isAdmin} />
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[13px] font-bold">{r.mmr}</span>
            <span className="text-[12px] text-[#6E7889]">내전 {r.gameCount}회</span>
          </div>
        </div>
      ))}
    </section>
  );
}
