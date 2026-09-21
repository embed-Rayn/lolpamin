import { AppShell } from "@/components/AppShell";
import { MemberInfoSearch } from "@/components/MemberInfoSearch";
import { MemberInfoTable } from "@/components/MemberInfoTable";
import {
  getMemberInfoListData,
  parseMemberInfoSort,
  parseSortDirection,
} from "@/lib/queries/member-info";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell과 명부 조회 모두 살아 있는 DB 행을 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function MemberInfoPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; dir?: string };
}) {
  const query = searchParams.q ?? "";
  const sort = parseMemberInfoSort(searchParams.sort);
  const dir = parseSortDirection(searchParams.dir);
  const [rows, currentAdmin] = await Promise.all([
    getMemberInfoListData(query, sort, dir),
    getCurrentAdmin(),
  ]);

  return (
    <AppShell activeNav="member-info" pageTitle="회원 정보" pageDesc="회원 명부 · 협곡/칼바람 전적과 티어">
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberInfoSearch query={query} />
          <MemberInfoTable rows={rows} isAdmin={currentAdmin !== null} sort={sort} dir={dir} query={query} />
        </section>
      </div>
    </AppShell>
  );
}
