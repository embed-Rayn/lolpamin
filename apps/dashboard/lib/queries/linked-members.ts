import { prisma } from "@/lib/prisma";
import { getCountedGameFilter } from "./counted-games";
import { getDisplayName } from "@lolpamin/core";
import type { MemberTier } from "@lolpamin/db";

export interface LinkedMemberOption {
  id: string;
  name: string;
  // 서버 별명. 핸들("dohyun_kr")은 디코 아이디라 사람을 알아볼 수 없으므로 별명을 먼저
  // 본다 — queries/members.ts의 displayDiscordName과 같은 규칙이다. 리플레이로만 확인된
  // 회원은 디코가 아예 없어 "(디코 없음)"이 된다.
  discordName: string;
  mmr: number;
  wins: number;
  losses: number;
  // 팀짜기 화면이 쓰는 값. 점수는 저장하지 않고 tierScore로 계산한다.
  tier: MemberTier;
  riotId: string | null;
  // 칼바람 트랙. MatchBuilder가 모드 토글에 따라 이쪽과 협곡 값을 오간다.
  aramMmr: number;
  aramWins: number;
  aramLosses: number;
}

export async function getLinkedMembers(): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: {
      mergedIntoId: null,
      OR: [
        {
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
        // saveGameResult와 같은 완화다. 리플레이로 확인된 사람이 수동 입력 화면에서만
        // 안 보이면 두 화면이 서로 다른 회원 목록을 말하게 된다.
        { riotAccounts: { some: {} } },
      ],
    },
    orderBy: { mmr: "desc" },
  });

  // 되돌린 판과 리셋 이전 판은 승/패에 넣지 않는다(getCountedGameFilter 참고). 빼지
  // 않으면 MMR만 움직이고 전적은 그대로여서 같은 화면 안에서 두 숫자가 어긋난다.
  const countedGame = await getCountedGameFilter(prisma);
  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: members.map((m) => m.id) }, gameResult: countedGame },
    select: { memberId: true, team: true, gameResult: { select: { winner: true, mode: true } } },
  });

  const record = new Map(
    members.map((m) => [m.id, { wins: 0, losses: 0, aramWins: 0, aramLosses: 0 }]),
  );
  for (const p of participations) {
    const tally = record.get(p.memberId);
    if (!tally) continue;
    const isWin = p.team === p.gameResult.winner;
    if (p.gameResult.mode === "ARAM") {
      if (isWin) tally.aramWins += 1; else tally.aramLosses += 1;
    } else {
      if (isWin) tally.wins += 1; else tally.losses += 1;
    }
  }

  return members.map((m) => ({
    id: m.id,
    name: getDisplayName(m),
    discordName: m.discordDisplayName ?? m.discordHandle ?? m.discordUserId ?? "(디코 없음)",
    mmr: m.mmr,
    tier: m.tier,
    riotId: m.riotId,
    aramMmr: m.aramMmr,
    ...record.get(m.id)!,
  }));
}
