import { prisma } from "@/lib/prisma";

export interface PendingDiscordAccount {
  id: string;
  handle: string;
}

export interface PendingKakaoAccount {
  id: string;
  nickname: string;
}

export async function getPendingDiscordAccounts(): Promise<PendingDiscordAccount[]> {
  const members = await prisma.member.findMany({
    where: { kakaoUserId: null, kakaoNickname: null, discordUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, handle: m.discordHandle ?? m.discordUserId! }));
}

export async function getPendingKakaoAccounts(): Promise<PendingKakaoAccount[]> {
  const members = await prisma.member.findMany({
    where: { discordUserId: null, OR: [{ kakaoUserId: { not: null } }, { kakaoNickname: { not: null } }] },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, nickname: m.kakaoNickname ?? m.kakaoUserId! }));
}
