import type { PrismaClient } from "@lolpamin/db";

export async function getMemberRank(prisma: PrismaClient, elo: number): Promise<number> {
  const higherCount = await prisma.member.count({ where: { elo: { gt: elo }, mergedIntoId: null } });
  return higherCount + 1;
}
