import { AppShell } from "@/components/AppShell";
import { InactiveTable } from "@/components/InactiveTable";
import { getInactiveReportData } from "@/lib/queries/inactive";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function InactivePage() {
  const data = await getInactiveReportData();

  return (
    <AppShell activeNav="inactive" pageTitle="미활동자 리포트" pageDesc="최근 1주간 카톡방 멘션 없는 회원">
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="flex items-stretch gap-3">
          <div className="grid flex-1 grid-cols-3 divide-x divide-white/[.07] rounded-xl border border-[#ED7D31]/25 bg-[#151A24]">
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[11px] font-medium text-[#7A8496]">1주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-[#F2985C]">
                {data.totalInactive}
                <span className="ml-1 text-sm font-medium text-[#7A8496]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[11px] font-medium text-[#7A8496]">2주 이상</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-[#EE8B8B]">
                {data.longInactiveCount}
                <span className="ml-1 text-sm font-medium text-[#7A8496]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[11px] font-medium text-[#7A8496]">전체 회원 중 비율</span>
              <span className="font-mono text-[30px] font-bold tracking-tight">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-[300px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] px-4 py-3.5">
            <div className="text-[11.5px] font-bold text-[#B7C0D0]">확인용 화면입니다</div>
            <div className="text-[10.5px] leading-relaxed text-[#6E7889]">
              자동 발송이나 강제 탈퇴 기능은 없습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} />
      </div>
    </AppShell>
  );
}
