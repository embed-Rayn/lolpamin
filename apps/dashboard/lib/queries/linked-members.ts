import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@lolpamin/core";

export interface LinkedMemberOption {
  id: string;
  name: string;
  // 서버 별명. 핸들("dohyun_kr")은 디코 아이디라 사람을 알아볼 수 없으므로 별명을 먼저
  // 본다 — queries/members.ts의 displayDiscordName과 같은 규칙이다. 이 명단은 디코가
  // 붙은 회원만 들어오므로 셋 중 하나는 반드시 있다.
  discordName: string;
  mmr: number;
  wins: number;
  losses: number;
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
    orderBy: { mmr: "desc" },
  });

  // 되돌린 경기는 승/패에 넣지 않는다. 참가 기록은 경기 기록에 남아야 해서 지우지
  // 않으므로(cancelGameResult 참고) 세는 쪽에서 걸러야 한다. 빼지 않으면 MMR만
  // 되돌아가고 전적은 그대로여서 같은 화면 안에서 두 숫자가 어긋난다.
  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: members.map((m) => m.id) }, gameResult: { cancelledAt: null } },
    select: { memberId: true, team: true, gameResult: { select: { winner: true } } },
  });

  const record = new Map(members.map((m) => [m.id, { wins: 0, losses: 0 }]));
  for (const p of participations) {
    const tally = record.get(p.memberId);
    if (!tally) continue;
    if (p.team === p.gameResult.winner) tally.wins += 1;
    else tally.losses += 1;
  }

  return members.map((m) => ({
    id: m.id,
    name: getDisplayName(m),
    discordName: m.discordDisplayName ?? m.discordHandle ?? m.discordUserId!,
    mmr: m.mmr,
    ...record.get(m.id)!,
  }));
}
