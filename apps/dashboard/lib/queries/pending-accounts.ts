import { prisma } from "@/lib/prisma";

export interface PendingDiscordAccount {
  id: string;
  handle: string;
  displayName: string | null;
}

export async function getPendingDiscordAccounts(): Promise<PendingDiscordAccount[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, kakaoUserId: null, kakaoNickname: null, discordUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  // 화면에는 서버 별명(discordDisplayName)을 띄우고 핸들은 그 아래 작게 남긴다.
  // 사람을 알아보는 건 별명이지 "k._.dj" 같은 핸들이 아니다. discordUserId는
  // 표시하지 않고 행의 id로만 쓴다 — 연결·해제는 전부 Member.id로 이뤄진다.
  return members.map((m) => ({
    id: m.id,
    handle: m.discordHandle ?? m.discordUserId!,
    displayName: m.discordDisplayName,
  }));
}
