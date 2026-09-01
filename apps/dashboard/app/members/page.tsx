import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { MemberTable } from "@/components/MemberTable";
import { MemberFilters } from "@/components/MemberFilters";
import { getMemberListData, type MemberFilter } from "@/lib/queries/members";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  const filter = (searchParams.filter ?? "all") as MemberFilter;
  const query = searchParams.q ?? "";
  const data = await getMemberListData(filter, query);

  return (
    <AppShell activeNav="members" pageTitle="회원 관리" pageDesc="전체 회원 조회 및 검색">
      <div className="flex flex-col gap-5.5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="전체 회원" value={data.totalCount} unit="명" colorClassName="text-[#E6EAF2]" />
          <StatCard label="미연결(반쪽) 회원" value={data.halfCount} unit="명" colorClassName="text-[#F2985C]" />
          <StatCard label="미배정 계정" value={data.unassignedCount} unit="건" colorClassName="text-[#F2C75C]" />
          <StatCard label="평균 MMR" value={data.averageMmr} unit="점" colorClassName="text-[#8FB4F5]" />
        </div>
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberFilters activeFilter={filter} query={query} />
          <MemberTable rows={data.rows} />
        </section>
      </div>
    </AppShell>
  );
}
