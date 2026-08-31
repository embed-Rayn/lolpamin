import { prisma } from "@/lib/prisma";
import { parseKakaoNickname } from "@lolpamin/core";

export interface PendingDiscordAccount {
  id: string;
  handle: string;
}

export interface PendingKakaoAccount {
  id: string;
  realName: string;
  nicknameTag: string;
}

export async function getPendingDiscordAccounts(): Promise<PendingDiscordAccount[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, kakaoUserId: null, kakaoNickname: null, discordUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, handle: m.discordHandle ?? m.discordUserId! }));
}

// Only members whose kakaoNickname parses as "실명/나이/닉네임#태그" are eligible —
// anything else can't be split into a realName + nicknameTag to display, so it's
// left out of this linking flow rather than shown with a raw, unparsed fallback.
export async function getPendingKakaoAccounts(): Promise<PendingKakaoAccount[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, discordUserId: null, kakaoNickname: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.flatMap((m) => {
    const parsed = parseKakaoNickname(m.kakaoNickname!);
    return parsed ? [{ id: m.id, realName: parsed.realName, nicknameTag: parsed.nicknameTag }] : [];
  });
}
