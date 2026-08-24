import type { Member, PrismaClient } from "@lolpamin/db";

export async function getMemberByDiscordId(
  prisma: PrismaClient,
  discordUserId: string
): Promise<Member | null> {
  return prisma.member.findUnique({ where: { discordUserId } });
}
