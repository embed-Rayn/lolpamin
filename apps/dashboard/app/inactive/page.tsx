import { AppShell } from "@/components/AppShell";
import { InactiveTable } from "@/components/InactiveTable";
import { getInactiveReportData } from "@/lib/queries/inactive";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function InactivePage() {
  const [data, currentAdmin] = await Promise.all([getInactiveReportData(), getCurrentAdmin()]);
  const isAdmin = currentAdmin !== null;

  return (
    <AppShell activeNav="inactive" pageTitle="미활동자 리포트" pageDesc="최근 1주간 카톡방 멘션 없는 회원">
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-5 md:px-7 md:pb-10 md:pt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div className="grid flex-1 grid-cols-3 divide-x divide-ink/[.07] rounded-xl border border-orange/25 bg-surface">
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">1주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[22px] font-bold tracking-tight text-orange md:text-[30px]">
                {data.totalInactive}
                <span className="ml-1 text-[13px] font-medium text-faint md:text-[15px]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">2주 이상</span>
              <span className="font-mono text-[22px] font-bold tracking-tight text-danger-soft md:text-[30px]">
                {data.longInactiveCount}
                <span className="ml-1 text-[13px] font-medium text-faint md:text-[15px]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">전체 회원 중 비율</span>
              <span className="font-mono text-[22px] font-bold tracking-tight md:text-[30px]">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-full flex-col justify-center gap-1.5 rounded-xl border border-dashed border-ink/[.1] bg-surface-2 px-4 py-3.5 md:w-[300px]">
            <div className="text-[12px] leading-relaxed text-faint">
              이 페이지는 <span className="font-bold text-fg-2">미활동 회원 확인용 화면입니다.</span> 자동 알림
              발송 및 강제 탈퇴 기능은 제공하지 않으며, 마지막 활동일은 관리자가 직접 수정할 수 있습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
