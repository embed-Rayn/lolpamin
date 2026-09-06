import type { PrismaClient, RatingResetKind } from "@lolpamin/db";
import { applyHardReset, applySoftReset } from "@lolpamin/core";

export interface ResetRatingsResult {
  count: number;
  resetAt: Date;
}

export interface ResetRatingsOptions {
  kind: RatingResetKind;
  adminId: string | null;
}

/**
 * 분기 리셋. SOFT는 활성 회원의 mmr을 기준값 쪽으로 절반 수축시키고, HARD는 전원을
 * 기준값에 세운다. 어느 쪽이든 RatingReset 한 행을 남기고, 그 resetAt이 판/승/패
 * 집계의 새 기준선이 된다 — 전적은 저장된 값이 아니라 GameParticipant를 세어 만들므로
 * 「0/0/0」은 참가 기록을 지우는 대신 기준선 이후 경기만 세는 것으로 만든다.
 * (queries/counted-games.ts 참고. 경기 기록 화면에는 과거 경기가 그대로 남는다.)
 *
 * 묘비(mergedIntoId != null)는 건드리지 않는다 — 묘비의 mmr은 화면 어디에도 쓰이지
 * 않는 흡수 당시의 잔재이고, 해제하면 그 값이 다시 살아나므로 리셋 대상이 아니다.
 * 이미 기록된 GameParticipant의 mmrBefore/mmrAfter도 그대로 둔다: 그건 그 경기
 * 시점의 사실이라 나중에 다시 계산되지 않는다.
 */
export async function resetAllRatings(
  prisma: PrismaClient,
  { kind, adminId }: ResetRatingsOptions
): Promise<ResetRatingsResult> {
  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({
      where: { mergedIntoId: null },
      select: { id: true, mmr: true },
    });

    if (kind === "HARD") {
      // 목표값이 하나라 한 문장으로 끝난다. 값이 이미 같은 행까지 덮어써도 결과는 같다.
      await tx.member.updateMany({ where: { mergedIntoId: null }, data: { mmr: applyHardReset() } });
    } else {
      for (const member of members) {
        const mmr = applySoftReset(member.mmr);
        if (mmr === member.mmr) continue;
        await tx.member.update({ where: { id: member.id }, data: { mmr } });
      }
    }

    // 기준선은 이 트랜잭션 시각이다. 뒤에 입력되는 경기만 새 전적에 들어간다.
    const reset = await tx.ratingReset.create({
      data: { kind, memberCount: members.length, createdById: adminId },
      select: { resetAt: true },
    });

    return { count: members.length, resetAt: reset.resetAt };
  });
}
