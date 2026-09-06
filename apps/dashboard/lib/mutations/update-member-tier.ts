import type { MemberTier, PrismaClient } from "@lolpamin/db";

/** 회원의 솔로랭크 티어를 저장한다. 점수는 저장하지 않는다 — 티어에서 계산한다. */
export async function updateMemberTier(
  prisma: PrismaClient,
  memberId: string,
  tier: MemberTier,
): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { tier } });
}
