import type { PrismaClient } from "@lolpamin/db";

/**
 * 회원이 참가한 내전 횟수. 되돌린 경기는 세지 않는다 — 참가 기록은 대시보드의 경기
 * 기록에 남아야 해서 지우지 않으므로(cancelGameResult 참고) 세는 쪽에서 걸러야 한다.
 */
export async function getGameCount(prisma: PrismaClient, memberId: string): Promise<number> {
  return prisma.gameParticipant.count({
    where: { memberId, gameResult: { cancelledAt: null } },
  });
}
