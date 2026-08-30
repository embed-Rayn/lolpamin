import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  elo: number;
}

export async function getLeaderboard(
  prisma: PrismaClient,
  limit: number
): Promise<LeaderboardEntry[]> {
  const members = await prisma.member.findMany({
    orderBy: [{ elo: "desc" }, { id: "asc" }],
    take: limit,
  });

  let rank = 0;
  let previousElo: number | null = null;

  return members.map((m, index) => {
    if (m.elo !== previousElo) {
      rank = index + 1;
      previousElo = m.elo;
    }
    return { rank, name: getDisplayName(m), elo: m.elo };
  });
}
