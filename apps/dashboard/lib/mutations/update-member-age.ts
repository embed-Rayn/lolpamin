import type { PrismaClient } from "@lolpamin/db";

/**
 * 출생연도 두 자리(모임 표기)를 저장한다. 입력 검증은 parseBirthYearInput이 먼저 한다.
 * null이면 화면은 카톡 닉네임에서 읽은 출생연도로 돌아간다.
 */
export async function updateMemberAge(prisma: PrismaClient, memberId: string, age: number | null): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { age } });
}
