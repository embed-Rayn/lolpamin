import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@lolpamin/core";

export interface LinkedMemberOption {
  id: string;
  name: string;
  elo: number;
}

export async function getLinkedMembers(): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: {
      mergedIntoId: null,
      discordUserId: { not: null },
      // 카톡 닉네임은 흡수해도 생존자에게 복사하지 않고 묘비에 남는다(활동 기록을
      // 옮기지 않으려고). 그러니 아직 붙어 있는 묘비가 닉네임을 들고 있으면 그 회원도
      // 연결이 끝난 것으로 본다.
      OR: [
        { kakaoUserId: { not: null } },
        { kakaoNickname: { not: null } },
        { absorbed: { some: { kakaoNickname: { not: null } } } },
      ],
    },
    orderBy: { elo: "desc" },
  });
  return members.map((m) => ({ id: m.id, name: getDisplayName(m), elo: m.elo }));
}
