import type { PrismaClient } from "@lolpamin/db";

export async function updateMemberNote(
  prisma: PrismaClient,
  memberId: string,
  note: string
): Promise<void> {
  const trimmed = note.trim();
  await prisma.member.update({
    where: { id: memberId },
    data: { note: trimmed.length > 0 ? trimmed : null },
  });
}
