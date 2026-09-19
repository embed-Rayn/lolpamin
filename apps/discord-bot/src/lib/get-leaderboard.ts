import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  mmr: number;
}

export async function getLeaderboard(
  prisma: PrismaClient,
  limit: number,
  field: "mmr" | "aramMmr" = "mmr"
): Promise<LeaderboardEntry[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    orderBy: [{ [field]: "desc" }, { id: "asc" }],
    take: limit,
  });

  let rank = 0;
  let previousMmr: number | null = null;

  return members.map((m, index) => {
    const value = m[field];
    if (value !== previousMmr) {
      rank = index + 1;
      previousMmr = value;
    }
    return { rank, name: getDisplayName(m), mmr: value };
  });
}
