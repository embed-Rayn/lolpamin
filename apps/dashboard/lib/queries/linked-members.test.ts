import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "@/lib/mutations/absorb-member";
import { releaseMember } from "@/lib/mutations/release-member";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/linked-members.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — members.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getLinkedMembers } = await import("./linked-members");

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getLinkedMembers", () => {
  it("leaves a discord-only member out of the match pool", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "daehyeok_" } });

    expect(await getLinkedMembers()).toEqual([]);
  });

  // 이 브랜치의 존재 이유: 흡수는 "연결 완료"여야 하고, 연결된 회원만 내전에 나갈 수 있다.
  it("puts the survivor into the match pool right after an absorb", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "daehyeok_" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const pool = await getLinkedMembers();
    expect(pool.map((m) => m.id)).toEqual([survivor.id]);
  });

  it("exposes the discord handle and a zero record for a member who has never played", async () => {
    await prisma.member.create({
      data: { realName: "김도현", discordUserId: "d-1", discordHandle: "dohyun_kr", kakaoUserId: "k-1" },
    });

    const [option] = await getLinkedMembers();

    expect(option.discordHandle).toBe("dohyun_kr");
    expect(option).toMatchObject({ wins: 0, losses: 0 });
  });

  it("counts a win for the side that matches the game winner and a loss for the other", async () => {
    const blue = await prisma.member.create({
      data: { realName: "승자", discordUserId: "d-1", discordHandle: "winner", kakaoUserId: "k-1" },
    });
    const red = await prisma.member.create({
      data: { realName: "패자", discordUserId: "d-2", discordHandle: "loser", kakaoUserId: "k-2" },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date(), winner: "BLUE" } });
    await prisma.gameParticipant.createMany({
      data: [
        { gameResultId: game.id, memberId: blue.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1017 },
        { gameResultId: game.id, memberId: red.id, team: "RED", mmrBefore: 1000, mmrAfter: 985 },
      ],
    });

    const byName = new Map((await getLinkedMembers()).map((o) => [o.name, o]));

    expect(byName.get("승자")).toMatchObject({ wins: 1, losses: 0 });
    expect(byName.get("패자")).toMatchObject({ wins: 0, losses: 1 });
  });

  it("takes the survivor back out of the pool when the link is released", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "daehyeok_" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    expect(await getLinkedMembers()).toEqual([]);
    const survivorAfter = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(survivorAfter.kakaoNickname).toBeNull();
    const loserAfter = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    expect(loserAfter.mergedIntoId).toBeNull();
    expect(loserAfter.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });
});
