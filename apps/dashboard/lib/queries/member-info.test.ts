import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/member-info.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — queries/members.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMemberInfoListData, parseMemberInfoSort, parseSortDirection } = await import("./member-info");

async function playGame(options: {
  blue: string[];
  red: string[];
  winner: "BLUE" | "RED";
  mode?: "RIFT" | "ARAM";
  cancelledAt?: Date;
  createdAt?: Date;
}) {
  const game = await prisma.gameResult.create({
    data: {
      playedAt: new Date("2026-09-01"),
      winner: options.winner,
      mode: options.mode ?? "RIFT",
      cancelledAt: options.cancelledAt ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
  for (const memberId of options.blue) {
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId, team: "BLUE", mmrBefore: 1000, mmrAfter: 1000 },
    });
  }
  for (const memberId of options.red) {
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId, team: "RED", mmrBefore: 1000, mmrAfter: 1000 },
    });
  }
  return game;
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseMemberInfoSort / parseSortDirection", () => {
  it("defaults to realName ascending", () => {
    expect(parseMemberInfoSort(undefined)).toBe("realName");
    expect(parseMemberInfoSort("nonsense")).toBe("realName");
    expect(parseSortDirection(undefined)).toBe("asc");
    expect(parseSortDirection("nonsense")).toBe("asc");
  });

  it("accepts the supported values", () => {
    expect(parseMemberInfoSort("riftWinRate")).toBe("riftWinRate");
    expect(parseMemberInfoSort("aramGames")).toBe("aramGames");
    expect(parseMemberInfoSort("tier")).toBe("tier");
    expect(parseSortDirection("desc")).toBe("desc");
  });
});

describe("getMemberInfoListData records", () => {
  it("keeps 협곡 and 칼바람 records apart", async () => {
    const winner = await prisma.member.create({ data: { realName: "이긴사람" } });
    const loser = await prisma.member.create({ data: { realName: "진사람" } });

    await playGame({ blue: [winner.id], red: [loser.id], winner: "BLUE", mode: "RIFT" });
    await playGame({ blue: [winner.id], red: [loser.id], winner: "RED", mode: "ARAM" });
    await playGame({ blue: [winner.id], red: [loser.id], winner: "RED", mode: "ARAM" });

    const rows = await getMemberInfoListData("");
    const row = rows.find((r) => r.realName === "이긴사람")!;

    expect(row.rift).toMatchObject({ games: 1, wins: 1, losses: 0, winRate: 100 });
    expect(row.aram).toMatchObject({ games: 2, wins: 0, losses: 2, winRate: 0 });
  });

  it("reports a null win rate for a member with no games", async () => {
    await prisma.member.create({ data: { realName: "무경기" } });

    const [row] = await getMemberInfoListData("");

    expect(row.rift).toMatchObject({ games: 0, wins: 0, losses: 0, winRate: null });
    expect(row.aram.winRate).toBeNull();
  });

  it("rounds the win rate", async () => {
    const member = await prisma.member.create({ data: { realName: "삼분의일" } });
    const other = await prisma.member.create({ data: { realName: "상대" } });
    await playGame({ blue: [member.id], red: [other.id], winner: "BLUE" });
    await playGame({ blue: [member.id], red: [other.id], winner: "RED" });
    await playGame({ blue: [member.id], red: [other.id], winner: "RED" });

    const rows = await getMemberInfoListData("");

    expect(rows.find((r) => r.realName === "삼분의일")!.rift.winRate).toBe(33);
  });

  // 되돌린 판과 리셋 이전 판을 빼는 규칙은 협곡 MMR 랭킹·디스코드 봇과 같아야 한다.
  // 화면마다 같은 회원의 판수가 다르게 보이면 어느 쪽이 맞는지 아무도 모른다.
  it("excludes cancelled games", async () => {
    const member = await prisma.member.create({ data: { realName: "취소" } });
    const other = await prisma.member.create({ data: { realName: "상대" } });
    await playGame({ blue: [member.id], red: [other.id], winner: "BLUE" });
    await playGame({ blue: [member.id], red: [other.id], winner: "BLUE", cancelledAt: new Date() });

    const rows = await getMemberInfoListData("");

    expect(rows.find((r) => r.realName === "취소")!.rift.games).toBe(1);
  });

  it("excludes games recorded at or before the newest rating reset", async () => {
    const member = await prisma.member.create({ data: { realName: "리셋" } });
    const other = await prisma.member.create({ data: { realName: "상대" } });
    await playGame({
      blue: [member.id],
      red: [other.id],
      winner: "BLUE",
      createdAt: new Date("2026-08-01"),
    });
    await prisma.ratingReset.create({
      data: { resetAt: new Date("2026-08-15"), kind: "SOFT", memberCount: 2 },
    });
    await playGame({
      blue: [member.id],
      red: [other.id],
      winner: "BLUE",
      createdAt: new Date("2026-09-01"),
    });

    const rows = await getMemberInfoListData("");

    expect(rows.find((r) => r.realName === "리셋")!.rift.games).toBe(1);
  });

  // 병합 전에 쌓인 참가 기록은 묘비 쪽에 남아 있을 수 있다. 생존자 자기 행만 세면
  // 연결을 끝낸 회원의 전적이 통째로 사라진다.
  it("credits a tombstone's games to the survivor", async () => {
    const survivor = await prisma.member.create({ data: { realName: "생존자", discordUserId: "d-1" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉/94/old#KR1", mergedIntoId: survivor.id },
    });
    const other = await prisma.member.create({ data: { realName: "상대" } });
    await playGame({ blue: [tombstone.id], red: [other.id], winner: "BLUE" });

    const rows = await getMemberInfoListData("");

    expect(rows.find((r) => r.realName === "생존자")!.rift).toMatchObject({ games: 1, wins: 1 });
    // 묘비 자체는 목록에 나오지 않는다.
    expect(rows.some((r) => r.kakaoNickname === "옛닉/94/old#KR1" && r.realName === "-")).toBe(false);
  });
});

describe("getMemberInfoListData search", () => {
  beforeEach(async () => {
    const survivor = await prisma.member.create({
      data: { realName: "박병준", kakaoNickname: "박병준/94/늑구#KR1" },
    });
    await prisma.member.create({
      data: { kakaoNickname: "박병준/94/옛닉#KR1", mergedIntoId: survivor.id },
    });
    await prisma.member.create({ data: { realName: "유승수", kakaoNickname: "유승수/98/ModCow#KR98" } });
  });

  it("matches on the real name", async () => {
    const rows = await getMemberInfoListData("유승수");

    expect(rows.map((r) => r.realName)).toEqual(["유승수"]);
  });

  it("matches on the current kakao nickname, ignoring case", async () => {
    const rows = await getMemberInfoListData("modcow");

    expect(rows.map((r) => r.realName)).toEqual(["유승수"]);
  });

  // 닉네임을 바꾼 회원을 옛 이름으로 찾는 일이 잦다 — 카톡 대화에 남은 이름이 그것이다.
  it("matches on a tombstone's nickname", async () => {
    const rows = await getMemberInfoListData("옛닉");

    expect(rows.map((r) => r.realName)).toEqual(["박병준"]);
  });

  it("returns everyone for an empty query", async () => {
    const rows = await getMemberInfoListData("   ");

    expect(rows).toHaveLength(2);
  });
});

describe("getMemberInfoListData sorting", () => {
  beforeEach(async () => {
    const ga = await prisma.member.create({ data: { realName: "가회원", tier: "GOLD_1" } });
    const na = await prisma.member.create({ data: { realName: "나회원", tier: "DIAMOND_4" } });
    await prisma.member.create({ data: { kakaoNickname: null, discordUserId: "d-no-name" } });

    // 가회원: 협곡 2판 1승, 나회원: 협곡 1판 1승(승률 100)
    await playGame({ blue: [ga.id], red: [na.id], winner: "BLUE" });
    await playGame({ blue: [na.id], red: [ga.id], winner: "BLUE" });
    await playGame({ blue: [na.id], red: [ga.id], winner: "BLUE" });
  });

  it("sorts by realName and keeps members without one last in both directions", async () => {
    const ascending = await getMemberInfoListData("", "realName", "asc");
    expect(ascending.map((r) => r.realName)).toEqual(["가회원", "나회원", "-"]);

    const descending = await getMemberInfoListData("", "realName", "desc");
    expect(descending.map((r) => r.realName)).toEqual(["나회원", "가회원", "-"]);
  });

  it("sorts by tier score, not enum declaration order", async () => {
    const descending = await getMemberInfoListData("", "tier", "desc");

    expect(descending.map((r) => r.tier)).toEqual(["DIAMOND_4", "GOLD_1", "UNRANKED"]);
  });

  it("sorts by 협곡 판수", async () => {
    const descending = await getMemberInfoListData("", "riftGames", "desc");

    expect(descending.map((r) => r.rift.games)).toEqual([3, 3, 0]);
  });

  it("sorts by 협곡 승률 and keeps members without games last in both directions", async () => {
    const descending = await getMemberInfoListData("", "riftWinRate", "desc");
    expect(descending.map((r) => r.rift.winRate)).toEqual([67, 33, null]);

    const ascending = await getMemberInfoListData("", "riftWinRate", "asc");
    expect(ascending.map((r) => r.rift.winRate)).toEqual([33, 67, null]);
  });

  it("sorts by 칼바람 승률 with every member lacking ARAM games kept last", async () => {
    const rows = await getMemberInfoListData("", "aramWinRate", "desc");

    expect(rows.every((r) => r.aram.winRate === null)).toBe(true);
    expect(rows).toHaveLength(3);
  });
});
