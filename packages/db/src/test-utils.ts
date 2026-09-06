import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.adminSession.deleteMany();
  await client.admin.deleteMany();
  await client.gameParticipant.deleteMany();
  await client.gameResult.deleteMany();
  await client.mentionLog.deleteMany();
  await client.member.deleteMany();
  await client.ratingReset.deleteMany();
  await client.mmrSetting.deleteMany();
}
