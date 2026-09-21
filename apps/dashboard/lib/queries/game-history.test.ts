import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { calculateTeamMmrChange } from "@lolpamin/core";
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

const { getGameHistory, parseGameHistoryMode, parseGameHistoryPage } = await import("./game-history");

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
  mode: "RIFT" | "ARAM" = "RIFT",
) {
  return saveGameResult(prisma, {
    playedAt: new Date("2026-09-01T12:00:00Z"),
    blueMemberIds: blue.map((m) => m.id),
    redMemberIds: red.map((m) => m.id),
    winner,
    createdById,
    mode,
  });
}

describe("getGameHistory", () => {
  it("returns nothing when no game has been played", async () => {
    expect((await getGameHistory()).rows).toEqual([]);
  });

  it("lists games newest entered first", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const first = await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");

    const { rows } = await getGameHistory();

    expect(rows.map((r) => r.id)).toEqual([second.gameResultId, first.gameResultId]);
  });

  it("splits participants into winners and losers with their mmr movement", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");

    const [row] = (await getGameHistory()).rows;

    // The size of the swing is mmr.test.ts's job; this test is about the split.
    // Derive it rather than freezing it — the K and bonus change rotted the
    // literals once already.
    const { blueDelta, redDelta } = calculateTeamMmrChange({
      blueRatings: [1000],
      redRatings: [1000],
      winner: "BLUE",
    });

    expect(row.winner).toBe("BLUE");
    expect(row.winners).toEqual([
      { name: "블루", mmrBefore: 1000, mmrAfter: 1000 + blueDelta, delta: blueDelta },
    ]);
    expect(row.losers).toEqual([
      { name: "레드", mmrBefore: 1000, mmrAfter: 1000 + redDelta, delta: redDelta },
    ]);
  });

  // 되돌리기 버튼은 딱 한 판에만 붙어야 한다 — cancelGameResult가 그것만 받아들인다.
  it("marks only the latest live game as cancellable", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");

    const { rows } = await getGameHistory();

    expect(rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([second.gameResultId]);
  });

  it("hands the cancellable flag to the previous game once the latest is cancelled", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const first = await playGame([blue], [red], "BLUE");
    const second = await playGame([blue], [red], "RED");
    await cancelGameResult(prisma, second.gameResultId, null);

    const { rows } = await getGameHistory();

    expect(rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([first.gameResultId]);
  });

  it("keeps a cancelled game in the list and shows it as cancelled", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const game = await playGame([blue], [red], "BLUE");
    await cancelGameResult(prisma, game.gameResultId, null);

    const [row] = (await getGameHistory()).rows;

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

    const [row] = (await getGameHistory()).rows;

    expect(row.createdByLabel).toBe("admin");
    expect(row.cancelledByLabel).toBe("sujin");
  });

  // adminId는 FK가 아니다 — 관리자가 지워져도 "누가 했는지"는 남아야 한다.
  it("reads a deleted admin as 삭제된 관리자 and a scripted entry as 스크립트", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE", "gone-admin-id");
    await playGame([blue], [red], "RED", null);

    const [scripted, deleted] = (await getGameHistory()).rows;

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

    const [row] = (await getGameHistory()).rows;

    expect(row.winners[0].name).toBe("유대혁/95/유대혁#KR1");
  });
});

describe("getGameHistory mode filter", () => {
  it("defaults to every mode and narrows to one on request", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const rift = await playGame([blue], [red], "BLUE", null, "RIFT");
    const aram = await playGame([blue], [red], "RED", null, "ARAM");

    const all = await getGameHistory();
    const riftOnly = await getGameHistory({ mode: "RIFT" });
    const aramOnly = await getGameHistory({ mode: "ARAM" });

    expect(all.rows.map((r) => r.id)).toEqual([aram.gameResultId, rift.gameResultId]);
    expect(all.rows.map((r) => r.mode)).toEqual(["ARAM", "RIFT"]);
    expect(riftOnly.rows.map((r) => r.id)).toEqual([rift.gameResultId]);
    expect(aramOnly.rows.map((r) => r.id)).toEqual([aram.gameResultId]);
    expect(riftOnly).toMatchObject({ totalCount: 1, liveCount: 1 });
  });

  // cancelGameResult는 모드별 최신 판을 받아들인다. 전체 최신 판만 표시하면 협곡 판 뒤에
  // 입력된 칼바람 판이 있을 때 협곡 최신 판이 되돌리기 불가로 보인다.
  it("marks the latest live game of each mode as cancellable", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE", null, "RIFT");
    const latestRift = await playGame([blue], [red], "RED", null, "RIFT");
    const latestAram = await playGame([blue], [red], "BLUE", null, "ARAM");

    const all = await getGameHistory();
    const riftOnly = await getGameHistory({ mode: "RIFT" });

    expect(all.rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([
      latestAram.gameResultId,
      latestRift.gameResultId,
    ]);
    expect(riftOnly.rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([latestRift.gameResultId]);
  });

  it("parses the mode and page from the URL leniently", () => {
    expect(parseGameHistoryMode(undefined)).toBe("all");
    expect(parseGameHistoryMode("RIFT")).toBe("RIFT");
    expect(parseGameHistoryMode("nonsense")).toBe("all");
    expect(parseGameHistoryPage(undefined)).toBe(1);
    expect(parseGameHistoryPage("3")).toBe(3);
    expect(parseGameHistoryPage("0")).toBe(1);
    expect(parseGameHistoryPage("1.5")).toBe(1);
    expect(parseGameHistoryPage("abc")).toBe(1);
  });
});

describe("getGameHistory pagination", () => {
  async function playMany(count: number, mode: "RIFT" | "ARAM" = "RIFT") {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      ids.push((await playGame([blue], [red], "BLUE", null, mode)).gameResultId);
    }
    return ids;
  }

  it("serves 20 games per page, newest first, and reports the page count", async () => {
    const ids = await playMany(23);
    const newestFirst = [...ids].reverse();

    const first = await getGameHistory({ page: 1 });
    const second = await getGameHistory({ page: 2 });

    expect(first).toMatchObject({ page: 1, pageCount: 2, totalCount: 23, liveCount: 23 });
    expect(first.rows.map((r) => r.id)).toEqual(newestFirst.slice(0, 20));
    expect(second.rows.map((r) => r.id)).toEqual(newestFirst.slice(20));
  });

  it("clamps a page past the end to the last page", async () => {
    await playMany(3);

    const result = await getGameHistory({ page: 9 });

    expect(result.page).toBe(1);
    expect(result.rows).toHaveLength(3);
  });

  it("counts pages within the chosen mode only", async () => {
    await playMany(21, "RIFT");
    await playMany(2, "ARAM");

    expect((await getGameHistory()).pageCount).toBe(2);
    expect((await getGameHistory({ mode: "RIFT" })).pageCount).toBe(2);
    expect((await getGameHistory({ mode: "ARAM" })).pageCount).toBe(1);
  });

  // 쪽을 나눠도 되돌리기 대상은 전체에서 찾는다. 1쪽만 보고 정하면 2쪽 이후에는 아무 판도
  // 못 되돌리는 것처럼 보이고, 반대로 2쪽 첫 판이 "최신"으로 잘못 찍힌다.
  it("keeps the cancellable flag on the overall latest game, not the page's first", async () => {
    const ids = await playMany(21);
    const latest = ids[ids.length - 1];

    const second = await getGameHistory({ page: 2 });
    const first = await getGameHistory({ page: 1 });

    expect(second.rows.some((r) => r.canCancel)).toBe(false);
    expect(first.rows.filter((r) => r.canCancel).map((r) => r.id)).toEqual([latest]);
  });
});
