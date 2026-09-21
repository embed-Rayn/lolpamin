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
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="flex items-stretch gap-3">
          <div className="grid flex-1 grid-cols-3 divide-x divide-ink/[.07] rounded-xl border border-orange/25 bg-surface">
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">1주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-orange">
                {data.totalInactive}
                <span className="ml-1 text-[15px] font-medium text-faint">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">2주 이상</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-danger-soft">
                {data.longInactiveCount}
                <span className="ml-1 text-[15px] font-medium text-faint">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">전체 회원 중 비율</span>
              <span className="font-mono text-[30px] font-bold tracking-tight">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-[300px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-ink/[.1] bg-surface-2 px-4 py-3.5">
            <div className="text-[12.5px] font-bold text-fg-2">확인용 화면입니다</div>
            <div className="text-[12px] leading-relaxed text-faint">
              자동 발송이나 강제 탈퇴 기능은 없습니다. 관리자는 마지막 활동일을 직접 고칠 수
              있습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
