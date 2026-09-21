import { AppShell } from "@/components/AppShell";
import { MemberTable } from "@/components/MemberTable";
import { MemberFilters } from "@/components/MemberFilters";
import {
  getMemberListData,
  parseMemberFilter,
  parseMemberSort,
  parseSortDirection,
} from "@/lib/queries/members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell이 사이드바 배지를 위해 Postgres를 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function AramPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string; sort?: string; dir?: string };
}) {
  const filter = parseMemberFilter(searchParams.filter);
  const query = searchParams.q ?? "";
  const sort = parseMemberSort(searchParams.sort);
  const dir = parseSortDirection(searchParams.dir);
  const [data, currentAdmin] = await Promise.all([
    getMemberListData(filter, query, sort, dir, "ARAM"),
    getCurrentAdmin(),
  ]);
  const isAdmin = currentAdmin !== null;

  return (
    <AppShell activeNav="aram" pageTitle="칼바람 MMR 랭킹" pageDesc="칼바람 내전 전용 MMR과 전적">
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberFilters activeFilter={filter} query={query} basePath="/aram" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/aram" />
        </section>
      </div>
    </AppShell>
  );
}
