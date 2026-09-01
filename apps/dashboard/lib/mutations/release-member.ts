import type { Prisma, PrismaClient } from "@lolpamin/db";

// 활동 기록은 병합할 때 옮기지 않으므로, 한 회원의 진짜 마지막 활동은 자기 로그와
// 아직 자기에게 붙어 있는 묘비들의 로그를 함께 봐야 나온다.
//
// absorbMember와의 계약: absorbMember는 저장된 lastActiveAt 필드와 자기 MentionLog의
// 최댓값 중 나중 값을 쓰지만, 여기서는 로그만 보고 다시 계산한다. 두 계산이 같은 답을
// 내는 이유는 processKakaoExport가 lastActiveAt을 갱신할 때 반드시 MentionLog도 함께
// 남기기 때문이다. 로그 없이 lastActiveAt만 직접 쓰는 경로가 생기면 흡수→해제 왕복에서
// 그 값이 조용히 사라진다 — 그런 경로를 추가한다면 여기도 함께 고쳐야 한다.
async function recomputeLastActiveAt(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
  const ids = [memberId, ...tombstones.map((t) => t.id)];
  const latest = await tx.mentionLog.aggregate({
    where: { memberId: { in: ids } },
    _max: { mentionedAt: true },
  });
  await tx.member.update({ where: { id: memberId }, data: { lastActiveAt: latest._max.mentionedAt } });
}

// absorbMember는 생존자의 kakaoNickname이 비어 있을 때만 묘비의 값을 물려받는다.
// 그러니 생존자가 지금 들고 있는 값이 이 묘비의 값과 같을 때만 되돌린다. 값이 다르면
// (개명 경로처럼 생존자가 원래 자기 닉네임을 지킨 경우) 흡수가 만든 값이 아니므로
// 건드리지 않는다. 되돌릴 때는 아직 붙어 있는 다른 묘비의 닉네임을 잇고, 없으면 비운다.
async function recomputeKakaoNickname(
  tx: Prisma.TransactionClient,
  survivorId: string,
  tombstoneNickname: string | null,
): Promise<void> {
  if (tombstoneNickname === null) return;
  const survivor = await tx.member.findUniqueOrThrow({ where: { id: survivorId } });
  if (survivor.kakaoNickname !== tombstoneNickname) return;

  const remaining = await tx.member.findFirst({
    where: { mergedIntoId: survivorId, kakaoNickname: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  await tx.member.update({
    where: { id: survivorId },
    data: { kakaoNickname: remaining?.kakaoNickname ?? null },
  });
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

      await recomputeLastActiveAt(tx, tombstoneId);
      await recomputeLastActiveAt(tx, survivorId);
      await recomputeKakaoNickname(tx, survivorId, tombstone.kakaoNickname);
    },
    { timeout: 20000 },
  );
}
