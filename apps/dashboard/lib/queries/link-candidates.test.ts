import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/link-candidates.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — members.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getKakaoAccountsWithCandidates, getMembersWithAliases } = await import("./link-candidates");

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getKakaoAccountsWithCandidates", () => {
  it("ranks the matching discord account first and marks it sole", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({
      data: { discordUserId: "d-2", discordHandle: "na_yeoni", discordDisplayName: "김나연/주디#주토피아/미드정글" },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
    expect(account.candidates[0].handle).toBe("daehyeok_");
    expect(account.candidates[0].reasons).toEqual(["실명일치", "게임닉일치"]);
    expect(account.candidates[0].isSole).toBe(true);
  });

  it("offers an already-linked member as a candidate for a renamed nickname", async () => {
    // 닉네임을 바꾼 사람은 "미연결 디스코드"가 아니라 "이미 연결된 회원"에 붙어야 한다.
    await prisma.member.create({
      data: {
        discordUserId: "d-1",
        discordHandle: "daehyeok_",
        discordDisplayName: "유대혁/95/유대혁#KR1/sup",
        kakaoNickname: "유대혁/95/유대혁#KR1",
      },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR2", realName: "유대혁" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.candidates[0].handle).toBe("daehyeok_");
    expect(account.candidates[0].kind).toBe("linked");
  });

  it("leaves the candidate list empty when nothing scores", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "someone", discordDisplayName: "전혀다른사람" },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.candidates).toEqual([]);
  });

  it("skips absorbed accounts on both sides", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({ data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id } });

    expect(await getKakaoAccountsWithCandidates()).toEqual([]);
  });
});

describe("getMembersWithAliases", () => {
  it("lists each active member's absorbed nicknames", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/옛닉#KR1", mergedIntoId: survivor.id },
    });
    await prisma.member.create({ data: { discordUserId: "d-2", discordHandle: "alone" } });

    const rows = await getMembersWithAliases();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(survivor.id);
    expect(rows[0].aliases).toEqual([{ id: tombstone.id, kakaoNickname: "유대혁/95/옛닉#KR1" }]);
  });
});
