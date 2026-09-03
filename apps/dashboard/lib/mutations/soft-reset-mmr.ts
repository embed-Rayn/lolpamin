import type { PrismaClient } from "@lolpamin/db";
import { applySoftReset } from "@lolpamin/core";

export interface SoftResetResult {
  count: number;
}

/**
 * 분기 소프트 리셋. 활성 회원의 mmr을 기준값 쪽으로 절반 수축시킨다.
 *
 * 묘비(mergedIntoId != null)는 건드리지 않는다 — 묘비의 mmr은 화면 어디에도 쓰이지
 * 않는 흡수 당시의 잔재이고, 해제하면 그 값이 다시 살아나므로 리셋 대상이 아니다.
 * 이미 기록된 GameParticipant의 mmrBefore/mmrAfter도 그대로 둔다: 그건 그 경기
 * 시점의 사실이라 나중에 다시 계산되지 않는다.
 */
export async function softResetAllMmr(prisma: PrismaClient): Promise<SoftResetResult> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    select: { id: true, mmr: true },
  });

  const changes = members
    .map((member) => ({ id: member.id, mmr: applySoftReset(member.mmr) }))
    .filter((change, index) => change.mmr !== members[index].mmr);

  if (changes.length > 0) {
    await prisma.$transaction(
      changes.map((change) => prisma.member.update({ where: { id: change.id }, data: { mmr: change.mmr } })),
    );
  }

  return { count: members.length };
}
