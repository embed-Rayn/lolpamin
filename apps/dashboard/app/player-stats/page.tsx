import { AppShell } from "@/components/AppShell";
import { PlayerStatsScreen } from "@/components/player-stats/PlayerStatsScreen";
import { prisma } from "@/lib/prisma";
import { getPlayerStats, parsePlayerStatsPeriod } from "@/lib/queries/player-stats";

// AppShell and the stats query both read live rows; without this next build bakes a snapshot.
export const dynamic = "force-dynamic";

export default async function PlayerStatsPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parsePlayerStatsPeriod(searchParams.period);
  const members = await getPlayerStats(prisma, period);

  return (
    <AppShell activeNav="player-stats" pageTitle="플레이어 통계" pageDesc="협곡 내전 · 리플레이로 등록한 판 기준 포지션별 전적">
      {/* key: a period switch remounts the screen so the selection resets with the new data */}
      <PlayerStatsScreen key={period} members={members} period={period} />
    </AppShell>
  );
}
