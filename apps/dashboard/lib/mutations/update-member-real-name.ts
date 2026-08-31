import type { PrismaClient } from "@lolpamin/db";

export async function updateMemberRealName(
  prisma: PrismaClient,
  memberId: string,
  realName: string
): Promise<void> {
  const trimmed = realName.trim();
  await prisma.member.update({
    where: { id: memberId },
    data: { realName: trimmed.length > 0 ? trimmed : null },
  });
}
