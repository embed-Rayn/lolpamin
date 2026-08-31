import type { Prisma, PrismaClient } from "@lolpamin/db";

// 활동 기록은 병합할 때 옮기지 않으므로, 한 회원의 진짜 마지막 활동은 자기 로그와
// 아직 자기에게 붙어 있는 묘비들의 로그를 함께 봐야 나온다.
async function recomputeLastActiveAt(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
  const ids = [memberId, ...tombstones.map((t) => t.id)];
  const latest = await tx.mentionLog.aggregate({
    where: { memberId: { in: ids } },
    _max: { mentionedAt: true },
  });
  await tx.member.update({ where: { id: memberId }, data: { lastActiveAt: latest._max.mentionedAt } });
}

/** 흡수를 되돌린다. 묘비를 다시 활성 회원으로 만들고 양쪽 lastActiveAt을 다시 계산한다. */
export async function releaseMember(prisma: PrismaClient, tombstoneId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const tombstone = await tx.member.findUniqueOrThrow({ where: { id: tombstoneId } });
      if (tombstone.mergedIntoId === null) {
        throw new Error("흡수되지 않은 회원이라 연결을 끊을 수 없습니다.");
      }
      const survivorId = tombstone.mergedIntoId;

      await tx.member.update({ where: { id: tombstoneId }, data: { mergedIntoId: null } });

      await recomputeLastActiveAt(tx, tombstoneId);
      await recomputeLastActiveAt(tx, survivorId);
    },
    { timeout: 20000 },
  );
}
