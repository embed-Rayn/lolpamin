import type { MemberTier, PrismaClient } from "@lolpamin/db";

/** 회원의 최고티어를 저장한다. 참고값이라 팀빌더 점수(산정티어)와 무관하다. */
export async function updateMemberPeakTier(
  prisma: PrismaClient,
  memberId: string,
  peakTier: MemberTier,
): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { peakTier } });
}
