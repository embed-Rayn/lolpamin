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

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string; sort?: string; dir?: string };
}) {
  const filter = parseMemberFilter(searchParams.filter);
  const query = searchParams.q ?? "";
  const sort = parseMemberSort(searchParams.sort);
  const dir = parseSortDirection(searchParams.dir);
  const [data, currentAdmin] = await Promise.all([
    getMemberListData(filter, query, sort, dir),
    getCurrentAdmin(),
  ]);
  const isAdmin = currentAdmin !== null;

  return (
    <AppShell activeNav="rift" pageTitle="협곡 MMR 랭킹" pageDesc="협곡 내전 MMR과 전적">
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberFilters activeFilter={filter} query={query} basePath="/rift" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/rift" />
        </section>
      </div>
    </AppShell>
  );
}
