import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@lolpamin/core";

export interface LinkedMemberOption {
  id: string;
  name: string;
  elo: number;
}

export async function getLinkedMembers(): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: {
      discordUserId: { not: null },
      OR: [{ kakaoUserId: { not: null } }, { kakaoNickname: { not: null } }],
    },
    orderBy: { elo: "desc" },
  });
  return members.map((m) => ({ id: m.id, name: getDisplayName(m), elo: m.elo }));
}
