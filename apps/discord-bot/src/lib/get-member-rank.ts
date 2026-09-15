import type { PrismaClient } from "@lolpamin/db";

export async function getMemberRank(
  prisma: PrismaClient,
  mmr: number,
  field: "mmr" | "aramMmr" = "mmr",
): Promise<number> {
  const higherCount = await prisma.member.count({ where: { [field]: { gt: mmr }, mergedIntoId: null } });
  return higherCount + 1;
}
