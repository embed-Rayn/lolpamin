import type { PrismaClient } from "@lolpamin/db";

// cancelGameResult가 의도적으로 던지는 안내 문구. 서버 액션은 이 목록에 있는 메시지만
// 관리자 화면에 그대로 보여준다 — absorbMember와 같은 방침이다.
export const CANCEL_GAME_RESULT_ERRORS = {
  notFound: "경기를 찾을 수 없습니다.",
  alreadyCancelled: "이미 취소된 경기입니다.",
  notLatest: "가장 최근 경기만 되돌릴 수 있습니다. 뒤에 입력된 경기를 먼저 되돌리세요.",
} as const;

/**
 * 가장 최근에 입력된, 아직 살아 있는 경기 한 판을 취소한다.
 *
 * 각 참가자의 mmr을 그 경기의 mmrBefore로 되돌린다 — 재계산하지 않는다. 대상이 「살아
 * 있는 것 중 가장 나중에 입력된 판」이므로 그 참가자들이 이후에 뛴 살아 있는 경기가 없고,
 * 따라서 현재 mmr은 정확히 이 경기의 mmrAfter다. 이후 경기가 있더라도 이미 취소됐다면
 * 그 취소가 자기 몫을 되돌려 놓았으므로 결론은 같다.
 *
 * 「최근」의 기준은 playedAt이 아니라 createdAt이다. mmr은 입력한 순서대로 쌓이므로,
 * 경기 날짜를 과거로 적어 나중에 입력한 판이 있어도 되돌리기는 입력 역순이어야 맞는다.
 *
 * 취소는 되살릴 수 없다. 되살리기를 허용하면 취소가 LIFO가 아니게 되어 위 근거가 무너진다.
 */
export async function cancelGameResult(
  prisma: PrismaClient,
  gameResultId: string,
  adminId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const game = await tx.gameResult.findUnique({
      where: { id: gameResultId },
      include: { participants: true },
    });

    if (!game) throw new Error(CANCEL_GAME_RESULT_ERRORS.notFound);
    if (game.cancelledAt !== null) throw new Error(CANCEL_GAME_RESULT_ERRORS.alreadyCancelled);

    const latest = await tx.gameResult.findFirst({
      where: { cancelledAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest?.id !== game.id) throw new Error(CANCEL_GAME_RESULT_ERRORS.notLatest);

    for (const participant of game.participants) {
      await tx.member.update({
        where: { id: participant.memberId },
        data: { mmr: participant.mmrBefore },
      });
    }

    // 참가 기록은 지우지 않는다. 취소된 뒤에도 누가 뛰었고 점수가 어떻게 움직였는지가
    // 「경기 기록」에 보여야 한다 — 회원 병합이 활동 기록을 옮기지 않는 것과 같은 방침이다.
    await tx.gameResult.update({
      where: { id: game.id },
      data: { cancelledAt: new Date(), cancelledById: adminId },
    });
  });
}
