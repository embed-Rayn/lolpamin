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

    // Neither relation is ON DELETE CASCADE, so the children have to go first.
    // The GameResult rows themselves stay: a past game keeps the participants
    // it still has, and its recorded elo deltas are never recalculated.
    const gameParticipants = await tx.gameParticipant.deleteMany({ where: { memberId } });
    const mentionLogs = await tx.mentionLog.deleteMany({ where: { memberId } });
    await tx.member.delete({ where: { id: memberId } });

    return { mentionLogs: mentionLogs.count, gameParticipants: gameParticipants.count };
  });
}
