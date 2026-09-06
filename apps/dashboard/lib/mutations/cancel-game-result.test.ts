import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";
import { CANCEL_GAME_RESULT_ERRORS, cancelGameResult } from "./cancel-game-result";

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
async function createLinkedMember(mmr: number) {
  seq += 1;
  return prisma.member.create({
    data: { discordUserId: `d-${seq}`, kakaoNickname: `k-${seq}`, mmr },
  });
}

async function playGame(
  blue: { id: string }[],
  red: { id: string }[],
  winner: "BLUE" | "RED",
  playedAt = new Date("2026-09-01T12:00:00Z"),
) {
  return saveGameResult(prisma, {
    playedAt,
    blueMemberIds: blue.map((m) => m.id),
    redMemberIds: red.map((m) => m.id),
    winner,
  });
}

async function mmrOf(id: string): Promise<number> {
  const m = await prisma.member.findUniqueOrThrow({ where: { id } });
  return m.mmr;
}

describe("cancelGameResult", () => {
  it("puts every participant's mmr back to what it was before the game", async () => {
    const blue = await createLinkedMember(1500);
    const red = await createLinkedMember(1500);
    const game = await playGame([blue], [red], "BLUE");
    expect(await mmrOf(blue.id)).not.toBe(1500);

    await cancelGameResult(prisma, game.gameResultId, null);

    expect(await mmrOf(blue.id)).toBe(1500);
    expect(await mmrOf(red.id)).toBe(1500);
  });

  // 스택에서 하나씩 빼는 것과 같다: 한 판을 물리면 그 앞 판이 대상이 된다.
  it("unwinds two games back to the starting point when cancelled in reverse order", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const first = await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");

    await cancelGameResult(prisma, second.gameResultId, null);
    await cancelGameResult(prisma, first.gameResultId, null);

    expect(await mmrOf(blue.id)).toBe(1000);
    expect(await mmrOf(red.id)).toBe(1000);
  });

  it("refuses anything but the latest live game and leaves the data untouched", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const first = await playGame([blue], [red], "BLUE");
    await playGame([blue], [red], "RED");
    const before = await mmrOf(blue.id);

    await expect(cancelGameResult(prisma, first.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.notLatest,
    );

    expect(await mmrOf(blue.id)).toBe(before);
    const untouched = await prisma.gameResult.findUniqueOrThrow({ where: { id: first.gameResultId } });
    expect(untouched.cancelledAt).toBeNull();
  });

  it("refuses a game that is already cancelled", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const game = await playGame([blue], [red], "BLUE");
    await cancelGameResult(prisma, game.gameResultId, null);

    await expect(cancelGameResult(prisma, game.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.alreadyCancelled,
    );
  });

  it("refuses a game id that does not exist", async () => {
    await expect(
      cancelGameResult(prisma, "00000000-0000-0000-0000-000000000000", null),
    ).rejects.toThrow(CANCEL_GAME_RESULT_ERRORS.notFound);
  });

  // 「최근」은 playedAt이 아니라 createdAt이다. MMR은 입력한 순서대로 쌓이므로,
  // 경기 날짜를 과거로 적어 나중에 입력한 판이 먼저 빠져야 계산이 맞는다.
  it("treats the last game entered as the latest even when its playedAt is older", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    await playGame([blue], [red], "BLUE", new Date("2026-09-02T12:00:00Z"));
    const backdated = await playGame([blue], [red], "RED", new Date("2026-08-01T12:00:00Z"));

    await cancelGameResult(prisma, backdated.gameResultId, null);

    const row = await prisma.gameResult.findUniqueOrThrow({ where: { id: backdated.gameResultId } });
    expect(row.cancelledAt).not.toBeNull();
  });

  // 참가자가 겹치지 않아도 LIFO를 지킨다. 겹치지 않으면 되돌려도 안전해 보이지만,
  // 예외를 두면 "무엇이 되돌릴 수 있는 판인가"가 사람마다 달라진다.
  it("keeps the LIFO rule even when two games share no participants", async () => {
    const a1 = await createLinkedMember(1000);
    const a2 = await createLinkedMember(1000);
    const b1 = await createLinkedMember(1000);
    const b2 = await createLinkedMember(1000);
    const first = await playGame([a1], [a2], "BLUE");
    await playGame([b1], [b2], "BLUE");

    await expect(cancelGameResult(prisma, first.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.notLatest,
    );
  });

  it("keeps the participation rows so a cancelled game still shows who played", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const game = await playGame([blue], [red], "BLUE");

    await cancelGameResult(prisma, game.gameResultId, null);

    const participants = await prisma.gameParticipant.findMany({
      where: { gameResultId: game.gameResultId },
    });
    expect(participants).toHaveLength(2);
  });

  it("records who cancelled it and when", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const game = await playGame([blue], [red], "BLUE");

    await cancelGameResult(prisma, game.gameResultId, "admin-7");

    const row = await prisma.gameResult.findUniqueOrThrow({ where: { id: game.gameResultId } });
    expect(row.cancelledById).toBe("admin-7");
    expect(row.cancelledAt).toBeInstanceOf(Date);
  });

  // 리셋 이전 판의 mmrBefore는 리셋 전 값이다. 되돌리면 참가자만 옛 점수로 되살아난다.
  it("refuses a game entered before the last reset", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const game = await playGame([blue], [red], "BLUE");

    const { resetAllRatings } = await import("./reset-ratings");
    await resetAllRatings(prisma, { kind: "HARD", adminId: null });

    await expect(cancelGameResult(prisma, game.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.beforeReset,
    );
    expect(await mmrOf(blue.id)).toBe(1000);
  });

  it("still allows a game entered after the last reset", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);

    const { resetAllRatings } = await import("./reset-ratings");
    await resetAllRatings(prisma, { kind: "HARD", adminId: null });

    const game = await playGame([blue], [red], "BLUE");
    await cancelGameResult(prisma, game.gameResultId, null);

    expect(await mmrOf(blue.id)).toBe(1000);
    const row = await prisma.gameResult.findUniqueOrThrow({ where: { id: game.gameResultId } });
    expect(row.cancelledAt).toBeInstanceOf(Date);
  });
});
