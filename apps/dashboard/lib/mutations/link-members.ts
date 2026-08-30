import type { Member, PrismaClient } from "@lolpamin/db";
import { mergeMembers, parseKakaoNickname } from "@lolpamin/core";

export async function linkMembers(
  prisma: PrismaClient,
  discordSideId: string,
  kakaoSideId: string
): Promise<Member> {
  return prisma.$transaction(async (tx) => {
    const discordSide = await tx.member.findUniqueOrThrow({ where: { id: discordSideId } });
    const kakaoSide = await tx.member.findUniqueOrThrow({ where: { id: kakaoSideId } });

    if (discordSide.kakaoUserId !== null || discordSide.kakaoNickname !== null) {
      throw new Error("Discord-side member is already linked to a KakaoTalk account");
    }
    if (kakaoSide.discordUserId !== null) {
      throw new Error("Kakao-side member is already linked to a Discord account");
    }

    const merged = mergeMembers(discordSide, kakaoSide);

    // kakaoNickname keeps its original raw value (mergeMembers doesn't touch it) —
    // future kakao-import re-uploads match it exactly, so it must never be rewritten.
    // realName/age here are best-effort extras parsed out of that same raw string.
    const parsedNickname = kakaoSide.kakaoNickname ? parseKakaoNickname(kakaoSide.kakaoNickname) : null;

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
      data: {
        ...merged,
        realName: merged.realName ?? parsedNickname?.realName ?? null,
        age: parsedNickname?.age ?? discordSide.age ?? kakaoSide.age ?? null,
      },
    });

    return updated;
  });
}
