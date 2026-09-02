import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "@/lib/mutations/save-game-result";
import { cancelGameResult } from "@/lib/mutations/cancel-game-result";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/game-history.ts는 앱 싱글턴 prisma를 임포트한다 — members.test.ts와 같은 방식.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getGameHistory } = await import("./game-history");

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
    data: { realName, discordUserId: `d-${seq}`, kakaoNickname: `k-${seq}`, mmr },
  });
}

async function playGame(
  blue: { id: string }[],
  red: { id: string }[],
  winner: "BLUE" | "RED",
  createdById: string | null = null,
) {
  return saveGameResult(prisma, {
    playedAt: new Date("2026-09-01T12:00:00Z"),
    blueMemberIds: blue.map((m) => m.id),
    redMemberIds: red.map((m) => m.id),
    winner,
    createdById,
  });
}

describe("getGameHistory", () => {
  it("returns nothing when no game has been played", async () => {
    expect(await getGameHistory()).toEqual([]);
  });

  it("lists games newest entered first", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const first = await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");

    const rows = await getGameHistory();

    expect(rows.map((r) => r.id)).toEqual([second.gameResultId, first.gameResultId]);
  });

  it("splits participants into winners and losers with their mmr movement", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");

    const [row] = await getGameHistory();

    expect(row.winner).toBe("BLUE");
    expect(row.winners).toEqual([{ name: "블루", mmrBefore: 1000, mmrAfter: 1017, delta: 17 }]);
    expect(row.losers).toEqual([{ name: "레드", mmrBefore: 1000, mmrAfter: 985, delta: -15 }]);
  });

  // 되돌리기 버튼은 딱 한 판에만 붙어야 한다 — cancelGameResult가 그것만 받아들인다.
  it("marks only the latest live game as cancellable", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");

    const rows = await getGameHistory();

    expect(rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([second.gameResultId]);
  });

  it("hands the cancellable flag to the previous game once the latest is cancelled", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const first = await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");
    await cancelGameResult(prisma, second.gameResultId, null);

    const rows = await getGameHistory();

    expect(rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([first.gameResultId]);
  });

  it("keeps a cancelled game in the list and shows it as cancelled", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const game = await playGame([blue], [red], "BLUE");
    await cancelGameResult(prisma, game.gameResultId, null);

    const [row] = await getGameHistory();

    expect(row.isCancelled).toBe(true);
    expect(row.canCancel).toBe(false);
    expect(row.winners).toHaveLength(1);
  });

  it("names the admins who entered and cancelled the game", async () => {
    const entered = await prisma.admin.create({
      data: { username: "admin", passwordHash: "x" },
    });
    const cancelled = await prisma.admin.create({
      data: { username: "sujin", passwordHash: "x" },
    });
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const game = await playGame([blue], [red], "BLUE", entered.id);
    await cancelGameResult(prisma, game.gameResultId, cancelled.id);

    const [row] = await getGameHistory();

    expect(row.createdByLabel).toBe("admin");
    expect(row.cancelledByLabel).toBe("sujin");
  });

  // adminId는 FK가 아니다 — 관리자가 지워져도 "누가 했는지"는 남아야 한다.
  it("reads a deleted admin as 삭제된 관리자 and a scripted entry as 스크립트", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE", "gone-admin-id");
    await playGame([blue], [red], "RED", null);

    const [scripted, deleted] = await getGameHistory();

    expect(scripted.createdByLabel).toBe("스크립트");
    expect(deleted.createdByLabel).toBe("삭제된 관리자");
  });

  it("falls back to the discord nickname when a participant has no real name", async () => {
    seq += 1;
    const blue = await prisma.member.create({
      data: {
        discordUserId: `d-${seq}`,
        kakaoNickname: `k-${seq}`,
        discordDisplayName: "유대혁/95/유대혁#KR1",
        mmr: 1000,
      },
    });
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");

    const [row] = await getGameHistory();

    expect(row.winners[0].name).toBe("유대혁/95/유대혁#KR1");
  });
});
