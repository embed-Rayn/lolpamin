import type { PrismaClient } from "@lolpamin/db";

/**
 * 회원이 참가한 내전 횟수. 되돌린 판과 마지막 리셋 이전에 입력된 판은 세지 않는다 —
 * 참가 기록은 대시보드의 경기 기록에 남아야 해서 어느 쪽도 지우지 않으므로
 * (cancelGameResult, resetAllRatings 참고) 세는 쪽에서 걸러야 한다.
 *
 * 같은 규칙이 apps/dashboard/lib/queries/counted-games.ts에도 있다. 봇은 대시보드의
 * lib을 가져다 쓸 수 없어서 조건을 여기서 다시 세운다.
 */
export async function getGameCount(prisma: PrismaClient, memberId: string): Promise<number> {
  const latestReset = await prisma.ratingReset.findFirst({
    orderBy: { resetAt: "desc" },
    select: { resetAt: true },
  });

  return prisma.gameParticipant.count({
    where: {
      memberId,
      gameResult: {
        cancelledAt: null,
        ...(latestReset ? { createdAt: { gt: latestReset.resetAt } } : {}),
      },
    },
  });
}
