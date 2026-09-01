import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLinkedMember(mmr: number) {
  return prisma.member.create({
    data: { discordUserId: `d-${mmr}-${Math.random()}`, kakaoUserId: `k-${mmr}-${Math.random()}`, mmr },
  });
}

describe("saveGameResult", () => {
  it("updates each participant's mmr and records a GameResult with participants", async () => {
    const blue1 = await createLinkedMember(1500);
    const blue2 = await createLinkedMember(1500);
    const red1 = await createLinkedMember(1500);
    const red2 = await createLinkedMember(1500);

    const result = await saveGameResult(prisma, {
      playedAt: new Date("2026-08-23T12:00:00Z"),
      blueMemberIds: [blue1.id, blue2.id],
      redMemberIds: [red1.id, red2.id],
      winner: "BLUE",
    });

    expect(result.updates).toHaveLength(4);
    const blueUpdate = result.updates.find((u) => u.memberId === blue1.id)!;
    expect(blueUpdate.mmrBefore).toBe(1500);
    expect(blueUpdate.mmrAfter).toBe(1517);

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue1.id } });
    expect(refreshed.mmr).toBe(1517);

    // The losing team still gains the participation point, so -16 lands at -15.
    const redUpdate = result.updates.find((u) => u.memberId === red1.id)!;
    expect(redUpdate.mmrAfter).toBe(1485);

    const participants = await prisma.gameParticipant.findMany({ where: { gameResultId: result.gameResultId } });
    expect(participants).toHaveLength(4);
  });

  it("rejects a participant who is not fully linked", async () => {
    const halfMember = await prisma.member.create({ data: { discordUserId: "d-half" } });
    const red1 = await createLinkedMember(1500);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(),
        blueMemberIds: [halfMember.id],
        redMemberIds: [red1.id],
        winner: "RED",
      })
    ).rejects.toThrow("must be fully linked");
  });

  it("rejects a participant listed on both teams", async () => {
    const dup = await createLinkedMember(1500);
    const red1 = await createLinkedMember(1500);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(),
        blueMemberIds: [dup.id],
        redMemberIds: [dup.id, red1.id],
        winner: "BLUE",
      })
    ).rejects.toThrow("cannot be on both teams");
  });
});
