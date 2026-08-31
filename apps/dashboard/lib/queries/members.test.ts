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
  await prisma.member.create({ data: { realName: "나회원", kakaoNickname: "나회원/95/na#1", elo: 1200 } });
  await prisma.member.create({ data: { realName: "가회원", kakaoNickname: "가회원/95/ga#1", elo: 1500 } });
  await prisma.member.create({ data: { realName: null, kakaoNickname: null, discordUserId: "d-1", elo: 1000 } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseMemberSort / parseSortDirection", () => {
  it("defaults to elo descending", () => {
    expect(parseMemberSort(undefined)).toBe("elo");
    expect(parseMemberSort("nonsense")).toBe("elo");
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
  it("sorts by elo descending by default", async () => {
    const data = await getMemberListData("all", "", "elo", "desc");

    expect(data.rows.map((r) => r.elo)).toEqual([1500, 1200, 1000]);
  });

  it("sorts by elo ascending", async () => {
    const data = await getMemberListData("all", "", "elo", "asc");

    expect(data.rows.map((r) => r.elo)).toEqual([1000, 1200, 1500]);
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

  it("hides a member that was absorbed into another", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({ data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "elo", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].id).toBe(survivor.id);
    expect(data.totalCount).toBe(1);
  });
});
