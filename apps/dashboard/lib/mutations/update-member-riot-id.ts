import type { PrismaClient } from "@lolpamin/db";

/**
 * 회원의 Riot ID를 저장한다. 빈 값은 null로 지운다 — updateMemberRealName과 같은 방침이다.
 *
 * 형식 검증은 하지 않는다. 실제 값이 "늑 구#1003", "주디#주토피아"처럼 공백과 한글을
 * 담고 있고, 라이엇의 실제 규칙보다 우리가 아는 규칙이 좁을 위험이 더 크다.
 */
export async function updateMemberRiotId(
  prisma: PrismaClient,
  memberId: string,
  riotId: string,
): Promise<void> {
  const trimmed = riotId.trim();
  await prisma.member.update({
    where: { id: memberId },
    data: { riotId: trimmed.length > 0 ? trimmed : null },
  });
}
