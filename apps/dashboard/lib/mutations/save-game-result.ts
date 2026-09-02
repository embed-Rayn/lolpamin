import type { PrismaClient, Team } from "@lolpamin/db";
import { calculateTeamMmrChange } from "@lolpamin/core";

export interface SaveGameResultInput {
  playedAt: Date;
  blueMemberIds: string[];
  redMemberIds: string[];
  winner: "BLUE" | "RED";
  // 입력한 운영진. 스크립트로 넣는 경로가 생기면 null이 된다.
  createdById?: string | null;
}

export interface SaveGameResultOutput {
  gameResultId: string;
  updates: Array<{ memberId: string; mmrBefore: number; mmrAfter: number }>;
}

export async function saveGameResult(
  prisma: PrismaClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  const { playedAt, blueMemberIds, redMemberIds, winner, createdById = null } = input;

  const overlap = blueMemberIds.filter((id) => redMemberIds.includes(id));
  if (overlap.length > 0) {
    throw new Error("A participant cannot be on both teams");
  }

  return prisma.$transaction(async (tx) => {
    const allIds = [...blueMemberIds, ...redMemberIds];
    // 카톡 닉네임은 흡수해도 묘비에 남으므로(활동 기록을 옮기지 않으려고), 연결 여부를
    // 보려면 묘비의 닉네임도 함께 읽어와야 한다.
    const members = await tx.member.findMany({
      where: { id: { in: allIds } },
      include: { absorbed: { select: { kakaoNickname: true } } },
    });

    if (members.length !== allIds.length) {
      throw new Error("One or more participants do not exist");
    }
    for (const member of members) {
      if (member.mergedIntoId !== null) {
        throw new Error(`Participant ${member.id} was absorbed into another member and cannot play`);
      }
      // kakaoUserId는 이 시스템에서 채워지는 경로가 없다(카톡 봇 폐기). 연결은
      // kakaoNickname으로 이뤄지므로 그것을 연결의 근거로 본다 — 자기 행이든,
      // 흡수해 둔 묘비든.
      const hasKakaoNickname =
        member.kakaoNickname !== null || member.absorbed.some((a) => a.kakaoNickname !== null);
      if (!member.discordUserId || !hasKakaoNickname) {
        throw new Error(`Participant ${member.id} must be fully linked to play in a match`);
      }
    }

    const byId = new Map(members.map((m) => [m.id, m]));
    const { blueDelta, redDelta } = calculateTeamMmrChange({
      blueRatings: blueMemberIds.map((id) => byId.get(id)!.mmr),
      redRatings: redMemberIds.map((id) => byId.get(id)!.mmr),
      winner,
    });

    const gameResult = await tx.gameResult.create({
      data: { playedAt, winner: winner as Team, createdById },
    });

    const updates: SaveGameResultOutput["updates"] = [];

    for (const [team, ids, delta] of [
      ["BLUE", blueMemberIds, blueDelta],
      ["RED", redMemberIds, redDelta],
    ] as const) {
      for (const memberId of ids) {
        const mmrBefore = byId.get(memberId)!.mmr;
        const mmrAfter = mmrBefore + delta;
        await tx.gameParticipant.create({
          data: { gameResultId: gameResult.id, memberId, team: team as Team, mmrBefore, mmrAfter },
        });
        await tx.member.update({ where: { id: memberId }, data: { mmr: mmrAfter } });
        updates.push({ memberId, mmrBefore, mmrAfter });
      }
    }

    return { gameResultId: gameResult.id, updates };
  });
}
