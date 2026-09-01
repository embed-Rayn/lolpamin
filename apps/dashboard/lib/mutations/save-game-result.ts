import type { PrismaClient, Team } from "@lolpamin/db";
import { calculateTeamMmrChange } from "@lolpamin/core";

export interface SaveGameResultInput {
  playedAt: Date;
  blueMemberIds: string[];
  redMemberIds: string[];
  winner: "BLUE" | "RED";
}

export interface SaveGameResultOutput {
  gameResultId: string;
  updates: Array<{ memberId: string; mmrBefore: number; mmrAfter: number }>;
}

export async function saveGameResult(
  prisma: PrismaClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  const { playedAt, blueMemberIds, redMemberIds, winner } = input;

  const overlap = blueMemberIds.filter((id) => redMemberIds.includes(id));
  if (overlap.length > 0) {
    throw new Error("A participant cannot be on both teams");
  }

  return prisma.$transaction(async (tx) => {
    const allIds = [...blueMemberIds, ...redMemberIds];
    const members = await tx.member.findMany({ where: { id: { in: allIds } } });

    if (members.length !== allIds.length) {
      throw new Error("One or more participants do not exist");
    }
    for (const member of members) {
      if (!member.discordUserId || !member.kakaoUserId) {
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
      data: { playedAt, winner: winner as Team },
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
