import type { Prisma, PrismaClient } from "@lolpamin/db";

// 활동 기록은 병합할 때 옮기지 않으므로, 한 회원의 진짜 마지막 활동은 자기 로그와
// 아직 자기에게 붙어 있는 묘비들의 로그를 함께 봐야 나온다.
//
// absorbMember와의 계약: absorbMember는 저장된 lastActiveAt 필드와 자기 MentionLog·경기의
// 최댓값 중 나중 값을 쓰지만, 여기서는 로그와 경기만 보고 다시 계산한다. 두 계산이 같은
// 답을 내는 이유는 lastActiveAt을 갱신하는 두 경로(processKakaoExport, saveReplayImport)가
// 반드시 MentionLog나 GameParticipant를 함께 남기기 때문이다. 흔적 없이 lastActiveAt만
// 직접 쓰는 경로가 생기면 흡수→해제 왕복에서 그 값이 조용히 사라진다 — 그런 경로를
// 추가한다면 여기도 함께 고쳐야 한다.
async function recomputeLastActiveAt(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
  const ids = [memberId, ...tombstones.map((t) => t.id)];
  const latestMention = await tx.mentionLog.aggregate({
    where: { memberId: { in: ids } },
    _max: { mentionedAt: true },
  });
  const latestGame = await tx.gameParticipant.findFirst({
    where: { memberId: { in: ids }, gameResult: { cancelledAt: null } },
    orderBy: { gameResult: { playedAt: "desc" } },
    select: { gameResult: { select: { playedAt: true } } },
  });

  const mention = latestMention._max.mentionedAt;
  const game = latestGame?.gameResult.playedAt ?? null;
  const lastActiveAt = !mention ? game : !game ? mention : mention >= game ? mention : game;

  await tx.member.update({ where: { id: memberId }, data: { lastActiveAt } });
}

// releaseMember가 의도적으로 던지는 안내 문구. 서버 액션은 이 목록에 있는 메시지만
// 관리자 화면에 그대로 보여준다.
export const RELEASE_MEMBER_ERRORS = {
  notATombstone: "흡수되지 않은 회원이라 연결을 끊을 수 없습니다.",
} as const;

/** 흡수를 되돌린다. 묘비를 다시 활성 회원으로 만들고 양쪽 lastActiveAt을 다시 계산한다. */
export async function releaseMember(prisma: PrismaClient, tombstoneId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const tombstone = await tx.member.findUniqueOrThrow({ where: { id: tombstoneId } });
      if (tombstone.mergedIntoId === null) {
        throw new Error(RELEASE_MEMBER_ERRORS.notATombstone);
      }
      const survivorId = tombstone.mergedIntoId;

      await tx.member.update({ where: { id: tombstoneId }, data: { mergedIntoId: null } });

      // 흡수 때 넘어간 경기 기록과 라이엇 계정을 돌려준다. 표식이 이 묘비를 가리키는
      // 행만 가져온다 — 생존자가 직접 쌓은 기록과, 다른 묘비에서 온 기록은 건드리지 않는다.
      // absorbMember와 같은 이유로 두 모델을 배열로 돌리지 않는다(델리게이트 유니언 타입 오류).
      await tx.gameParticipant.updateMany({
        where: { memberId: survivorId, absorbedFromId: tombstoneId },
        data: { memberId: tombstoneId, absorbedFromId: null },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: survivorId, absorbedFromId: tombstoneId },
        data: { memberId: tombstoneId, absorbedFromId: null },
      });

      await recomputeLastActiveAt(tx, tombstoneId);
      await recomputeLastActiveAt(tx, survivorId);
    },
    { timeout: 20000 },
  );
}
