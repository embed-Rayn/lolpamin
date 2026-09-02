import type { PrismaClient } from "@lolpamin/db";

export interface DeleteMemberOutput {
  mentionLogs: number;
  gameParticipants: number;
}

export async function deleteMember(
  prisma: PrismaClient,
  memberId: string
): Promise<DeleteMemberOutput> {
  return prisma.$transaction(async (tx) => {
    await tx.member.findUniqueOrThrow({ where: { id: memberId } });

    // 이 회원이 흡수한 묘비들도 함께 지운다. 남겨두면 mergedIntoId가 고아가 된다.
    const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
    const ids = [memberId, ...tombstones.map((t) => t.id)];

    // Neither relation is ON DELETE CASCADE, so the children have to go first.
    // The GameResult rows themselves stay: a past game keeps the participants
    // it still has, and its recorded elo deltas are never recalculated.
    const gameParticipants = await tx.gameParticipant.deleteMany({ where: { memberId: { in: ids } } });
    const mentionLogs = await tx.mentionLog.deleteMany({ where: { memberId: { in: ids } } });
    await tx.member.deleteMany({ where: { id: { in: ids } } });

    return { mentionLogs: mentionLogs.count, gameParticipants: gameParticipants.count };
  });
}
