import type { PrismaClient } from "@lolpamin/db";

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
    orderBy: { elo: "desc" },
    take: limit,
  });

  return members.map((m, index) => ({
    rank: index + 1,
    name: m.realName ?? m.discordHandle ?? m.kakaoNickname ?? "이름 미확인",
    elo: m.elo,
  }));
}
