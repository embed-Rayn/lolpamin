import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type Team } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getLinkedMembers } from "./linked-members";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

let seq = 0;
async function createLinkedMember(realName: string, mmr: number) {
  seq += 1;
  return prisma.member.create({
    data: {
      realName,
      discordUserId: `d-${seq}`,
      discordHandle: `${realName}.handle`,
      kakaoUserId: `k-${seq}`,
      mmr,
    },
  });
}

async function playGame(blueId: string, redId: string, winner: Team) {
  const game = await prisma.gameResult.create({ data: { playedAt: new Date(), winner } });
  await prisma.gameParticipant.createMany({
    data: [
      { gameResultId: game.id, memberId: blueId, team: "BLUE", mmrBefore: 1000, mmrAfter: 1017 },
      { gameResultId: game.id, memberId: redId, team: "RED", mmrBefore: 1000, mmrAfter: 985 },
    ],
  });
}

describe("getLinkedMembers", () => {
  it("exposes the discord handle alongside the display name", async () => {
    await createLinkedMember("김도현", 1200);

    const [option] = await getLinkedMembers(prisma);

    expect(option.name).toBe("김도현");
    expect(option.discordHandle).toBe("김도현.handle");
  });

  it("counts a win for the member whose team matches the game winner", async () => {
    const winnerMember = await createLinkedMember("승자", 1200);
    const loserMember = await createLinkedMember("패자", 1100);
    await playGame(winnerMember.id, loserMember.id, "BLUE");

    const byName = new Map((await getLinkedMembers(prisma)).map((o) => [o.name, o]));

    expect(byName.get("승자")).toMatchObject({ wins: 1, losses: 0 });
    expect(byName.get("패자")).toMatchObject({ wins: 0, losses: 1 });
  });

  it("accumulates wins and losses across several games", async () => {
    const a = await createLinkedMember("에이", 1200);
    const b = await createLinkedMember("비", 1100);
    await playGame(a.id, b.id, "BLUE");
    await playGame(a.id, b.id, "RED");
    await playGame(b.id, a.id, "BLUE");

    const byName = new Map((await getLinkedMembers(prisma)).map((o) => [o.name, o]));

    expect(byName.get("에이")).toMatchObject({ wins: 1, losses: 2 });
    expect(byName.get("비")).toMatchObject({ wins: 2, losses: 1 });
  });

  it("reports zero wins and losses for a member who has never played", async () => {
    await createLinkedMember("무경기", 1000);

    const [option] = await getLinkedMembers(prisma);

    expect(option).toMatchObject({ wins: 0, losses: 0 });
  });
});
