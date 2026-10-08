import { seoulYearRange } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { ChampionStatsScreen } from "@/components/champion-stats/ChampionStatsScreen";
import { prisma } from "@/lib/prisma";
import { getChampionStats, parseChampionStatsMode } from "@/lib/queries/champion-stats";
import { parsePlayerStatsPeriod } from "@/lib/queries/player-stats";

// AppShell and the stats query both read live rows; without this next build bakes a snapshot.
export const dynamic = "force-dynamic";

export default async function ChampionStatsPage({ searchParams }: { searchParams: { mode?: string; period?: string } }) {
  const mode = parseChampionStatsMode(searchParams.mode);
  const period = parsePlayerStatsPeriod(searchParams.period);
  const now = new Date();
  const data = await getChampionStats(prisma, period, mode, now);

  return (
    <AppShell activeNav="champion-stats" pageTitle="챔피언 통계" pageDesc="회원 내전 · 리플레이로 등록한 판 기준 챔피언별 전적">
      {/* key: a mode or period switch remounts the screen so the selection resets with the new data */}
      <ChampionStatsScreen key={`${mode}:${period}`} data={data} mode={mode} period={period} year={seoulYearRange(now).year} />
    </AppShell>
  );
}
