import type { PrismaClient } from "@lolpamin/db";

/**
 * 관리자가 마지막 활동일을 손으로 고친다. 카톡 export에 안 잡히는 활동(개인 톡, 디코
 * 음성)을 반영하려는 것이라, import가 나중에 더 새 멘션을 보면 그쪽이 덮어쓴다.
 */
export async function updateMemberLastActive(
  prisma: PrismaClient,
  memberId: string,
  lastActiveAt: Date,
): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { lastActiveAt } });
}
