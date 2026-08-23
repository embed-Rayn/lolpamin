import { prisma } from "@/lib/prisma";

export interface LinkedMemberOption {
  id: string;
  name: string;
  elo: number;
}

export async function getLinkedMembers(): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: { discordUserId: { not: null }, kakaoUserId: { not: null } },
    orderBy: { elo: "desc" },
  });
  return members.map((m) => ({ id: m.id, name: m.realName ?? m.discordHandle ?? "이름 미확인", elo: m.elo }));
}
