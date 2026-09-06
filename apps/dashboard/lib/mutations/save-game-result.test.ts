import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "./absorb-member";
import { MMR_SETTING_ID } from "../queries/mmr-config";
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

async function createLinkedMember(mmr: number) {
  return prisma.member.create({
    data: { discordUserId: `d-${mmr}-${Math.random()}`, kakaoNickname: `k-${mmr}-${Math.random()}`, mmr },
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
    expect(blueUpdate.mmrAfter).toBe(1523);

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue1.id } });
    expect(refreshed.mmr).toBe(1523);

    // 승리 팀은 +3, 패배 팀도 +1을 받는다 — +20이 +23, -20이 -19가 된다.
    const redUpdate = result.updates.find((u) => u.memberId === red1.id)!;
    expect(redUpdate.mmrAfter).toBe(1481);

    const participants = await prisma.gameParticipant.findMany({ where: { gameResultId: result.gameResultId } });
    expect(participants).toHaveLength(4);
  });

  it("records which admin entered the game", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);

    const result = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T12:00:00Z"),
      blueMemberIds: [blue.id],
      redMemberIds: [red.id],
      winner: "BLUE",
      createdById: "admin-3",
    });

    const row = await prisma.gameResult.findUniqueOrThrow({ where: { id: result.gameResultId } });
    expect(row.createdById).toBe("admin-3");
    expect(row.cancelledAt).toBeNull();
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

  it("accepts the survivor of an absorb as a participant", async () => {
    // 흡수는 "연결 완료"여야 한다. 생존자가 카톡 닉네임을 넘겨받지 못하면 계정 연결을
    // 끝낸 회원이 그대로 내전에서 거부되고, 이 브랜치가 고치려던 "경기 0건"이 남는다.
    const survivor = await prisma.member.create({ data: { discordUserId: "d-a", discordHandle: "h-a" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await absorbMember(prisma, loser.id, survivor.id);
    const other = await createLinkedMember(1500);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(2026, 7, 1),
        winner: "BLUE",
        blueMemberIds: [survivor.id],
        redMemberIds: [other.id],
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

  // 저장된 설정이 있으면 상수 대신 그것으로 계산해야 한다 — 어드민이 바꿔 둔 K값이
  // 프리뷰에만 반영되고 실제 저장은 40으로 되면 화면과 기록이 어긋난다.
  it("uses the saved MMR config instead of the built-in constants", async () => {
    await prisma.mmrSetting.create({ data: { id: MMR_SETTING_ID, k: 20, winPoint: 10, lossPoint: 0 } });
    const blue = await createLinkedMember(1500);
    const red = await createLinkedMember(1500);

    const result = await saveGameResult(prisma, {
      playedAt: new Date("2026-08-23T12:00:00Z"),
      blueMemberIds: [blue.id],
      redMemberIds: [red.id],
      winner: "BLUE",
    });

    // round(20 * 0.5) + 10 = 20, round(20 * -0.5) + 0 = -10
    expect(result.updates.find((u) => u.memberId === blue.id)).toMatchObject({ mmrBefore: 1500, mmrAfter: 1520 });
    expect(result.updates.find((u) => u.memberId === red.id)).toMatchObject({ mmrBefore: 1500, mmrAfter: 1490 });
  });
});
