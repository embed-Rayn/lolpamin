import type { PrismaClient } from "@lolpamin/db";
import { ratingField } from "../rating-field";

// cancelGameResult가 의도적으로 던지는 안내 문구. 서버 액션은 이 목록에 있는 메시지만
// 관리자 화면에 그대로 보여준다 — absorbMember와 같은 방침이다.
export const CANCEL_GAME_RESULT_ERRORS = {
  notFound: "경기를 찾을 수 없습니다.",
  alreadyCancelled: "이미 취소된 경기입니다.",
  notLatest: "가장 최근 경기만 되돌릴 수 있습니다. 뒤에 입력된 경기를 먼저 되돌리세요.",
  beforeReset: "리셋 이후에 입력된 경기만 되돌릴 수 있습니다.",
  absorbedParticipant: "병합된 회원의 기록이 있는 경기입니다. 연결을 먼저 해제한 뒤 되돌리세요.",
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
 *
 * 마지막 리셋보다 먼저 입력된 경기는 되돌릴 수 없다. 그 판의 mmrBefore는 리셋 전 값이라
 * 되돌리면 참가자만 옛 점수로 되살아난다(resetAllRatings 참고). 리셋이 「가장 최근 판」의
 * 앞을 끊으므로, 리셋 직후에는 되돌릴 수 있는 경기가 하나도 없는 것이 맞다.
 *
 * 흡수로 이 경기의 참가 기록이 생존자에게 넘어와 있으면(GameParticipant.absorbedFromId)
 * 마찬가지로 되돌릴 수 없다. absorbMember는 참가 기록을 생존자에게 옮기지만 mmrBefore는
 * 원주인의 그 시점 점수다 — memberId(지금은 생존자)와 mmrBefore(원주인의 값)가 더 이상
 * 같은 사람의 것이 아니므로 "현재 mmr은 정확히 이 경기의 mmrAfter다"라는 전제가 깨진다.
 * 그대로 되돌리면 생존자의 점수가 남의 값으로 덮인다. 연결을 먼저 해제하면(releaseMember)
 * 참가 기록이 원주인에게 돌아가고, 그때는 다시 되돌릴 수 있다.
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
      where: { cancelledAt: null, mode: game.mode },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest?.id !== game.id) throw new Error(CANCEL_GAME_RESULT_ERRORS.notLatest);

    const latestReset = await tx.ratingReset.findFirst({
      orderBy: { resetAt: "desc" },
      select: { resetAt: true },
    });
    if (latestReset && game.createdAt <= latestReset.resetAt) {
      throw new Error(CANCEL_GAME_RESULT_ERRORS.beforeReset);
    }

    // 흡수로 넘어온 참가 기록이 있으면 mmrBefore가 그 행의 현재 주인(생존자)이 아니라
    // 원주인의 점수다. 그대로 되돌리면 생존자의 점수가 남의 값으로 덮인다.
    // 안내대로 연결을 먼저 끊으면 참가 기록이 원주인에게 돌아가고, 그때는 되돌릴 수 있다.
    if (game.participants.some((p) => p.absorbedFromId !== null)) {
      throw new Error(CANCEL_GAME_RESULT_ERRORS.absorbedParticipant);
    }

    const field = ratingField(game.mode);
    for (const participant of game.participants) {
      await tx.member.update({
        where: { id: participant.memberId },
        data: { [field]: participant.mmrBefore },
      });
    }

    // 참가 기록은 지우지 않는다. 취소된 뒤에도 누가 뛰었고 점수가 어떻게 움직였는지가
    // 「경기 기록」에 보여야 한다. 회원 병합은 참가 기록을 생존자에게 옮기지만(absorbMember)
    // 그것과는 다른 얘기다 — 취소는 옮겨진 기록의 존재 자체를 막지 않고, 위의
    // absorbedParticipant 가드가 「옮겨진 기록이 있는 경기」만 애초에 걸러낸다.
    //
    // replayKey도 함께 비운다. 유니크 제약이 취소 여부를 보지 않아 값을 남겨 두면 같은
    // 리플레이 파일을 다시 올릴 수 없다 — 리플레이를 취소하는 가장 흔한 이유가 매칭을
    // 잘못 지정한 경우인데, 그러면 재업로드가 막혀 이 기능이 없애려던 수기 입력으로
    // 되돌아간다.
    await tx.gameResult.update({
      where: { id: game.id },
      data: { cancelledAt: new Date(), cancelledById: adminId, replayKey: null },
    });
  });
}
