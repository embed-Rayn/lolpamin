import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";

export interface LinkedMemberOption {
  id: string;
  name: string;
  discordHandle: string | null;
  mmr: number;
  wins: number;
  losses: number;
}

export async function getLinkedMembers(prisma: PrismaClient): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: {
      discordUserId: { not: null },
      OR: [{ kakaoUserId: { not: null } }, { kakaoNickname: { not: null } }],
    },
    orderBy: { mmr: "desc" },
  });

  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: members.map((m) => m.id) } },
    select: { memberId: true, team: true, gameResult: { select: { winner: true } } },
  });

  const record = new Map(members.map((m) => [m.id, { wins: 0, losses: 0 }]));
  for (const p of participations) {
    const tally = record.get(p.memberId);
    if (!tally) continue;
    if (p.team === p.gameResult.winner) tally.wins += 1;
    else tally.losses += 1;
  }

  return members.map((m) => ({
    id: m.id,
    name: getDisplayName(m),
    discordHandle: m.discordHandle,
    mmr: m.mmr,
    ...record.get(m.id)!,
  }));
}
