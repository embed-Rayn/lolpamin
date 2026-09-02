import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/members.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — current-admin.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMemberListData, parseMemberSort, parseSortDirection } = await import("./members");

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.member.create({ data: { realName: "나회원", kakaoNickname: "나회원/95/na#1", mmr: 1200 } });
  await prisma.member.create({ data: { realName: "가회원", kakaoNickname: "가회원/95/ga#1", mmr: 1500 } });
  await prisma.member.create({ data: { realName: null, kakaoNickname: null, discordUserId: "d-1", mmr: 1000 } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseMemberSort / parseSortDirection", () => {
  it("defaults to mmr descending", () => {
    expect(parseMemberSort(undefined)).toBe("mmr");
    expect(parseMemberSort("nonsense")).toBe("mmr");
    expect(parseSortDirection(undefined)).toBe("desc");
    expect(parseSortDirection("nonsense")).toBe("desc");
  });

  it("accepts the supported values", () => {
    expect(parseMemberSort("realName")).toBe("realName");
    expect(parseMemberSort("kakaoNickname")).toBe("kakaoNickname");
    expect(parseSortDirection("asc")).toBe("asc");
  });
});

describe("getMemberListData sorting", () => {
  it("sorts by mmr descending by default", async () => {
    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows.map((r) => r.mmr)).toEqual([1500, 1200, 1000]);
  });

  it("sorts by mmr ascending", async () => {
    const data = await getMemberListData("all", "", "mmr", "asc");

    expect(data.rows.map((r) => r.mmr)).toEqual([1000, 1200, 1500]);
  });

  it("sorts by realName and puts members without one last in both directions", async () => {
    const ascending = await getMemberListData("all", "", "realName", "asc");
    expect(ascending.rows.map((r) => r.realName)).toEqual(["가회원", "나회원", "-"]);

    const descending = await getMemberListData("all", "", "realName", "desc");
    expect(descending.rows.map((r) => r.realName)).toEqual(["나회원", "가회원", "-"]);
  });

  it("sorts by kakao nickname", async () => {
    const data = await getMemberListData("all", "", "kakaoNickname", "asc");

    expect(data.rows.map((r) => r.kakaoNickname)).toEqual(["가회원/95/ga#1", "나회원/95/na#1", "-"]);
  });

  // 삭제 확인창은 이 숫자를 그대로 보여준다. 묘비 몫을 빼먹으면 "0건"이라 안내하고
  // 실제로는 묘비의 기록까지 지운다 — 관리자가 잘못된 정보로 승인하게 된다.
  it("counts the activity of the tombstones it absorbed in the delete confirmation numbers", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", kakaoNickname: "닉" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });
    await prisma.mentionLog.createMany({
      data: [
        { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@옛닉" },
        { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 2), rawMessage: "@옛닉" },
      ],
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date(2026, 7, 3), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: tombstone.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1016 },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].mentionCount).toBe(2);
    expect(data.rows[0].gameCount).toBe(1);
    expect(data.rows[0].aliasCount).toBe(1);
  });

  it("hides a member that was absorbed into another", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({ data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].id).toBe(survivor.id);
    expect(data.totalCount).toBe(1);
  });
});

describe("getMemberListData 디코 닉네임 표시", () => {
  it("연결된 회원은 핸들이 아니라 서버 별명을 보여준다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: {
        realName: "손민준",
        kakaoNickname: "손민준/99/fukcin216",
        discordUserId: "d-linked",
        discordHandle: "minjun8983",
        discordDisplayName: "손민준/fukcin216#7980/정글제외 무관",
      },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].discordName).toBe("손민준/fukcin216#7980/정글제외 무관");
  });

  it("카톡과 연결되지 않은 디스코드 계정은 디코 칸을 비운다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { discordUserId: "d-alone", discordHandle: "baegseungho5754", discordDisplayName: "백승호/98/탑원딜할래여#kr2" },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].discordName).toBe("-");
  });

  it("흡수로 연결한 회원도 디코 칸이 채워진다 — 카톡 닉네임은 묘비에 있다", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-surv", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].discordName).toBe("유대혁/95/유대혁#KR1/sup");
    expect(data.rows[0].kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("화면에 안 뜨는 디스코드 계정도 검색으로는 찾을 수 있다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { discordUserId: "d-alone", discordHandle: "baegseungho5754", discordDisplayName: "백승호/98/탑원딜할래여#kr2" },
    });

    const byDisplayName = await getMemberListData("all", "백승호", "mmr", "desc");
    const byHandle = await getMemberListData("all", "baegseungho", "mmr", "desc");

    expect(byDisplayName.rows).toHaveLength(1);
    expect(byHandle.rows).toHaveLength(1);
    expect(byDisplayName.rows[0].discordName).toBe("-");
  });
});
