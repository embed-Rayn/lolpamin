import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DailyRefreshButton } from "@/components/DailyRefreshButton";
import { MemberAdminTable } from "@/components/MemberAdminTable";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getMemberAdminRows, parseMemberAdminDirection, parseMemberAdminSort } from "@/lib/queries/member-admin";

// AppShell과 회원 조회 모두 살아 있는 DB 행을 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function MemberAdminPage({
  searchParams,
}: {
  searchParams: { sort?: string; dir?: string };
}) {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const sort = parseMemberAdminSort(searchParams.sort);
  const dir = parseMemberAdminDirection(searchParams.dir);
  const rows = await getMemberAdminRows(prisma, sort, dir);

  return (
    <AppShell activeNav="member-admin" pageTitle="회원 관리" pageDesc="회원 명부 편집 · 티어 · 라인 · 활동" desktopOnly>
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <DailyRefreshButton kind="riotIds" />
          <DailyRefreshButton kind="masteries" />
        </div>
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberAdminTable rows={rows} sort={sort} dir={dir} />
        </section>
      </div>
    </AppShell>
  );
}
