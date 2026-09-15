import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";
import { absorbMember } from "./absorb-member";
import { releaseMember } from "./release-member";
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

async function playAramGame(
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
    mode: "ARAM",
  });
}

async function aramMmrOf(id: string): Promise<number> {
  const m = await prisma.member.findUniqueOrThrow({ where: { id } });
  return m.aramMmr;
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

  // GameParticipant.memberId가 흡수로 생존자를 가리키게 되면 mmrBefore는 더 이상 그
  // 행의 주인 것이 아니다 — 원주인(흡수당한 회원)의 그 시점 값이다. 되돌리면 생존자의
  // 점수가 남의 값으로 덮인다. cancel-game-result.ts의 absorbedParticipant 가드가 이를 막는다.
  it("refuses to cancel a game whose participation was transferred by absorbMember, and restores it once released", async () => {
    // 카톡만 있는 회원도 리플레이로 확인된 RiotAccount가 있으면 뛸 수 있다(완화된 규칙).
    const kakaoOnly = await prisma.member.create({
      data: { kakaoNickname: "박병준/94/늑구#KR1", mmr: 1000 },
    });
    await prisma.riotAccount.create({
      data: { memberId: kakaoOnly.id, puuid: "puuid-absorb", gameName: "늑구", tagLine: "KR1", lastSeenAt: new Date() },
    });
    const opponent = await createLinkedMember(1000);

    const game = await playGame([kakaoOnly], [opponent], "BLUE");
    const kakaoOnlyMmrAfterGame = await mmrOf(kakaoOnly.id);
    expect(kakaoOnlyMmrAfterGame).not.toBe(1000);

    // 나중에 같은 사람으로 밝혀진 디스코드 쪽 회원에게 흡수시킨다. 참가 기록이
    // survivor에게 옮겨 가지만 mmrBefore/mmrAfter는 kakaoOnly 시절 값 그대로다.
    const survivor = await prisma.member.create({ data: { discordUserId: "d-survivor", mmr: 1000 } });
    await absorbMember(prisma, kakaoOnly.id, survivor.id);
    const survivorMmrAfterAbsorb = await mmrOf(survivor.id);

    await expect(cancelGameResult(prisma, game.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.absorbedParticipant,
    );
    // 거부됐으므로 survivor의 mmr은 남의 값(kakaoOnly의 mmrBefore)으로 덮이지 않는다.
    expect(await mmrOf(survivor.id)).toBe(survivorMmrAfterAbsorb);
    const untouched = await prisma.gameResult.findUniqueOrThrow({ where: { id: game.gameResultId } });
    expect(untouched.cancelledAt).toBeNull();

    // 안내대로 연결을 먼저 끊으면 참가 기록이 원주인에게 돌아가고, 그때는 되돌릴 수 있다 —
    // 이것이 문서화된 복구 경로이고, 실제로 되는지가 이 테스트의 두 번째 절반이다.
    await releaseMember(prisma, kakaoOnly.id);

    await cancelGameResult(prisma, game.gameResultId, null);
    expect(await mmrOf(kakaoOnly.id)).toBe(1000);
    const cancelled = await prisma.gameResult.findUniqueOrThrow({ where: { id: game.gameResultId } });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
  });

  it("reverts aramMmr, not mmr, when cancelling an ARAM game", async () => {
    const blue = await createLinkedMember(1500); // sets rift mmr; aramMmr starts at the 1000 default
    const red = await createLinkedMember(1500);
    const game = await playAramGame([blue], [red], "BLUE");
    expect(await aramMmrOf(blue.id)).not.toBe(1000);

    await cancelGameResult(prisma, game.gameResultId, null);

    expect(await aramMmrOf(blue.id)).toBe(1000);
    expect(await mmrOf(blue.id)).toBe(1500); // untouched rift track
  });

  // 협곡과 칼바람은 서로 다른 레이팅 트랙이다. 더 최근 칼바람 경기가 있다고 해서
  // 더 오래된 협곡 경기를 못 되돌릴 이유가 없다 — 서로의 mmr에 관여하지 않기 때문이다.
  it("does not let a newer game in the other mode block cancelling the latest one in this mode", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const riftGame = await playGame([blue], [red], "BLUE");
    await playAramGame([blue], [red], "RED"); // newer overall, but a different track

    await cancelGameResult(prisma, riftGame.gameResultId, null);

    const row = await prisma.gameResult.findUniqueOrThrow({ where: { id: riftGame.gameResultId } });
    expect(row.cancelledAt).not.toBeNull();
  });

  it("still enforces per-mode LIFO — a newer ARAM game must be cancelled before an older one", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const first = await playAramGame([blue], [red], "BLUE");
    await playAramGame([blue], [red], "RED");

    await expect(cancelGameResult(prisma, first.gameResultId, null)).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.notLatest,
    );
  });
});
