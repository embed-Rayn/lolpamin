import type { PrismaClient } from "@lolpamin/db";

export async function getMemberRank(prisma: PrismaClient, mmr: number): Promise<number> {
  const higherCount = await prisma.member.count({ where: { mmr: { gt: mmr } } });
  return higherCount + 1;
}
