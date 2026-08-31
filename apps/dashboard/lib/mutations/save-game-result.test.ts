import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";

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

async function createLinkedMember(elo: number) {
  return prisma.member.create({
    data: { discordUserId: `d-${elo}-${Math.random()}`, kakaoNickname: `k-${elo}-${Math.random()}`, elo },
  });
}

describe("saveGameResult", () => {
  it("updates each participant's elo and records a GameResult with participants", async () => {
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
    expect(blueUpdate.eloBefore).toBe(1500);
    expect(blueUpdate.eloAfter).toBe(1516);

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue1.id } });
    expect(refreshed.elo).toBe(1516);

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

  it("accepts a member linked by discord id and kakao nickname", async () => {
    // kakaoUserId를 채우는 경로가 시스템에 없다. 카톡 봇이 폐기되면서 사라졌고,
    // 연결은 kakaoNickname으로 이뤄진다. 그것을 요구하면 아무도 경기에 못 들어간다.
    const members = await Promise.all(
      Array.from({ length: 2 }, (_, i) =>
        prisma.member.create({
          data: { discordUserId: `d-${i}`, discordHandle: `h-${i}`, kakaoNickname: `닉-${i}` },
        })
      )
    );

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(2026, 7, 1),
        winner: "BLUE",
        blueMemberIds: [members[0].id],
        redMemberIds: [members[1].id],
      })
    ).resolves.toBeDefined();
  });

  it("refuses an absorbed member as a participant", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-a", kakaoNickname: "닉-a" },
    });
    const other = await prisma.member.create({
      data: { discordUserId: "d-b", kakaoNickname: "닉-b" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(2026, 7, 1),
        winner: "BLUE",
        blueMemberIds: [tombstone.id],
        redMemberIds: [other.id],
      })
    ).rejects.toThrow();
  });
});
