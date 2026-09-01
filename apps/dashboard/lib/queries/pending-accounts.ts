import { prisma } from "@/lib/prisma";

export interface PendingDiscordAccount {
  id: string;
  handle: string;
}

export async function getPendingDiscordAccounts(): Promise<PendingDiscordAccount[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, kakaoUserId: null, kakaoNickname: null, discordUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, handle: m.discordHandle ?? m.discordUserId! }));
}
