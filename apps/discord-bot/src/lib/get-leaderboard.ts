import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  mmr: number;
}

export async function getLeaderboard(
  prisma: PrismaClient,
  limit: number
): Promise<LeaderboardEntry[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    orderBy: [{ mmr: "desc" }, { id: "asc" }],
    take: limit,
  });

  let rank = 0;
  let previousMmr: number | null = null;

  return members.map((m, index) => {
    if (m.mmr !== previousMmr) {
      rank = index + 1;
      previousMmr = m.mmr;
    }
    return { rank, name: getDisplayName(m), mmr: m.mmr };
  });
}
