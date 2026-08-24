import type { PrismaClient } from "@lolpamin/db";

export interface RecordMemberActivityParams {
  kakaoUserId: string;
  mentionedAt: Date;
  rawMessage: string | null;
}

export async function recordMemberActivity(
  prisma: PrismaClient,
  params: RecordMemberActivityParams
): Promise<void> {
  const member = await prisma.member.upsert({
    where: { kakaoUserId: params.kakaoUserId },
    create: { kakaoUserId: params.kakaoUserId, lastActiveAt: params.mentionedAt },
    update: { lastActiveAt: params.mentionedAt },
  });

  await prisma.mentionLog.create({
    data: {
      memberId: member.id,
      mentionedAt: params.mentionedAt,
      rawMessage: params.rawMessage,
    },
  });
}
