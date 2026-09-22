import { AppShell } from "@/components/AppShell";
import { MemberTable } from "@/components/MemberTable";
import { MemberFilters } from "@/components/MemberFilters";
import {
  getMemberListData,
  parseMemberActivityFilter,
  parseMemberFilter,
  parseMemberSort,
  parseSortDirection,
} from "@/lib/queries/members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { filter?: string; activity?: string; q?: string; sort?: string; dir?: string };
}) {
  const filter = parseMemberFilter(searchParams.filter);
  const query = searchParams.q ?? "";
  const sort = parseMemberSort(searchParams.sort);
  const dir = parseSortDirection(searchParams.dir);
  const activity = parseMemberActivityFilter(searchParams.activity);
  const [data, currentAdmin] = await Promise.all([
    getMemberListData(filter, query, sort, dir, "RIFT", activity),
    getCurrentAdmin(),
  ]);
  const isAdmin = currentAdmin !== null;

  return (
    <AppShell activeNav="rift" pageTitle="협곡 MMR 랭킹" pageDesc="협곡 내전 MMR과 전적">
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-6 md:px-7 md:pb-10 md:pt-6">
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberFilters
            activeFilter={filter}
            activity={activity}
            isAdmin={isAdmin}
            query={query}
            sort={sort}
            dir={dir}
            basePath="/rift"
          />
          <MemberTable
            rows={data.rows}
            isAdmin={isAdmin}
            sort={sort}
            dir={dir}
            filter={filter}
            activity={activity}
            query={query}
            basePath="/rift"
          />
        </section>
      </div>
    </AppShell>
  );
}
