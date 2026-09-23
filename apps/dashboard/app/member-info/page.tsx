import { AppShell } from "@/components/AppShell";
import { MemberInfoSearch } from "@/components/MemberInfoSearch";
import { MemberInfoTable } from "@/components/MemberInfoTable";
import { StatCard } from "@/components/StatCard";
import {
  getMemberInfoListData,
  getMemberInfoSummary,
  parseMemberInfoSort,
  parseSortDirection,
} from "@/lib/queries/member-info";

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
  const [rows, summary] = await Promise.all([getMemberInfoListData(query, sort, dir), getMemberInfoSummary()]);

  return (
    <AppShell activeNav="member-info" pageTitle="회원 정보" pageDesc="회원 명부 · 협곡/칼바람 전적과 티어 · 모스트 챔피언">
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-6 md:px-7 md:pb-10 md:pt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
          <StatCard
            label="전체 회원"
            value={summary.totalCount}
            unit="명"
            colorClassName="text-fg"
            icon="users"
            description="함께하는 소중한 멤버들입니다."
          />
          <StatCard
            label="평균 협곡 MMR"
            value={summary.averageRiftMmr}
            unit="점"
            colorClassName="text-accent-soft"
            icon="swords"
            description="협곡의 평균 실력 지표입니다."
          />
          <StatCard
            label="평균 칼바람 MMR"
            value={summary.averageAramMmr}
            unit="점"
            colorClassName="text-orange"
            icon="snowflake"
            iconClassName="text-orange"
            tileClassName="bg-orange/[.12]"
            description="칼바람의 평균 실력 지표입니다."
          />
        </div>
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberInfoSearch query={query} sort={sort} dir={dir} />
          <MemberInfoTable rows={rows} sort={sort} dir={dir} query={query} />
        </section>
      </div>
    </AppShell>
  );
}
