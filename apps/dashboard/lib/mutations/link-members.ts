import type { Member, PrismaClient } from "@lolpamin/db";
import { mergeMembers } from "@lolpamin/core";

export async function linkMembers(
  prisma: PrismaClient,
  discordSideId: string,
  kakaoSideId: string
): Promise<Member> {
  return prisma.$transaction(async (tx) => {
    const discordSide = await tx.member.findUniqueOrThrow({ where: { id: discordSideId } });
    const kakaoSide = await tx.member.findUniqueOrThrow({ where: { id: kakaoSideId } });

    if (discordSide.kakaoUserId !== null) {
      throw new Error("Discord-side member is already linked to a KakaoTalk account");
    }
    if (kakaoSide.discordUserId !== null) {
      throw new Error("Kakao-side member is already linked to a Discord account");
    }

    const merged = mergeMembers(discordSide, kakaoSide);

    await tx.mentionLog.updateMany({
      where: { memberId: kakaoSideId },
      data: { memberId: discordSideId },
    });
    await tx.gameParticipant.updateMany({
      where: { memberId: kakaoSideId },
      data: { memberId: discordSideId },
    });
    // Delete the kakao-side row before writing its kakaoUserId onto the
    // discord-side row, otherwise the unique constraint on kakaoUserId
    // rejects the update while both rows briefly hold the same value.
    await tx.member.delete({ where: { id: kakaoSideId } });

    const updated = await tx.member.update({
      where: { id: discordSideId },
      data: merged,
    });

    return updated;
  });
}
