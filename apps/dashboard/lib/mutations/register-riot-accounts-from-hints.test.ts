import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { LookupResult } from "@/lib/riot-api/account";
import { countRiotLookupTargets, registerRiotAccountsFromHints } from "./register-riot-accounts-from-hints";

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

const noSleep = { sleep: async () => {} };

// gameName#tagLine → 결과. 목록에 없으면 404.
function lookupFrom(table: Record<string, LookupResult>) {
  return vi.fn(async (gameName: string, tagLine: string) => {
    return table[`${gameName}#${tagLine}`] ?? { ok: false, reason: "not_found" as const };
  });
}

const found = (puuid: string, gameName: string, tagLine: string): LookupResult => ({
  ok: true,
  account: { puuid, gameName, tagLine },
});

describe("registerRiotAccountsFromHints", () => {
  it("reads the discord hint, the kakao hint and Member.riotId", async () => {
    const byDiscord = await prisma.member.create({
      data: { realName: "가", discordUserId: "d-1", discordDisplayName: "가/디코닉#D1/탑" },
    });
    const byKakao = await prisma.member.create({
      data: { realName: "나", discordUserId: "d-2", discordDisplayName: "나", kakaoNickname: "나/95/카톡닉2#K2" },
    });
    const byRiotId = await prisma.member.create({
      data: { realName: "다", discordUserId: "d-3", riotId: "손닉3#R3" },
    });
    const lookup = lookupFrom({
      "디코닉#D1": found("p-1", "디코닉", "D1"),
      "카톡닉2#K2": found("p-2", "카톡닉2", "K2"),
      "손닉3#R3": found("p-3", "손닉3", "R3"),
    });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 3, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false });
    expect(lookup).toHaveBeenCalledTimes(3);
    const rows = await prisma.riotAccount.findMany({ orderBy: { puuid: "asc" } });
    expect(rows.map((r) => [r.puuid, r.memberId])).toEqual([
      ["p-1", byDiscord.id],
      ["p-2", byKakao.id],
      ["p-3", byRiotId.id],
    ]);
  });

  it("registers every distinct riot id one member wrote across their nicknames", async () => {
    const member = await prisma.member.create({
      data: {
        realName: "가",
        discordUserId: "d-1",
        discordDisplayName: "가/본계정#KR1/탑",
        kakaoNickname: "가/95/부계정#KR2",
        riotId: "세번째#KR3",
      },
    });
    const lookup = lookupFrom({
      "본계정#KR1": found("p-1", "본계정", "KR1"),
      "부계정#KR2": found("p-2", "부계정", "KR2"),
      "세번째#KR3": found("p-3", "세번째", "KR3"),
    });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 3, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false });
    const rows = await prisma.riotAccount.findMany({ where: { memberId: member.id }, orderBy: { puuid: "asc" } });
    expect(rows.map((r) => r.puuid)).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("collects a second riot id for a member who already has an account", async () => {
    const member = await prisma.member.create({
      data: { realName: "가", discordUserId: "d-1", discordDisplayName: "가/본계정#KR1/탑", riotId: "부계정#KR2" },
    });
    await prisma.riotAccount.create({
      data: { puuid: "p-1", memberId: member.id, gameName: "본계정", tagLine: "kr1", lastSeenAt: new Date() },
    });
    const lookup = lookupFrom({ "부계정#KR2": found("p-2", "부계정", "KR2") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.registered).toBe(1);
    // 이미 등록된 본계정은 대소문자만 다를 뿐 같은 ID다 — 호출을 쓰지 않는다.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await prisma.riotAccount.count({ where: { memberId: member.id } })).toBe(2);
  });

  it("counts one registration when two spellings resolve to the same puuid", async () => {
    await prisma.member.create({
      data: { realName: "가", discordUserId: "d-1", discordDisplayName: "가/옛이름#KR1/탑", riotId: "새이름#KR1" },
    });
    const lookup = lookupFrom({
      "옛이름#KR1": found("p-1", "새이름", "KR1"),
      "새이름#KR1": found("p-1", "새이름", "KR1"),
    });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.registered).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(await prisma.riotAccount.count()).toBe(1);
  });

  it("reads the kakao hint through a survivor's tombstone", async () => {
    const survivor = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "가/95/묘비닉#T1", mergedIntoId: survivor.id } });
    const lookup = lookupFrom({ "묘비닉#T1": found("p-1", "묘비닉", "T1") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.registered).toBe(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).memberId).toBe(survivor.id);
  });

  it("skips members whose hints are all registered already and members without any hint", async () => {
    const has = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "닉#1" } });
    await prisma.riotAccount.create({
      data: { puuid: "p-existing", memberId: has.id, gameName: "닉", tagLine: "1", lastSeenAt: new Date() },
    });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", discordDisplayName: "나" } });
    const lookup = lookupFrom({ "닉#1": found("p-existing", "닉", "1") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 0, notFound: 0, conflicts: 0, skipped: 2, unauthorized: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores tombstones as members", async () => {
    const survivor = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "가/95/닉#1", mergedIntoId: survivor.id, riotId: "닉#1" } });
    const lookup = lookupFrom({ "닉#1": found("p-1", "닉", "1") });

    await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    // 묘비는 대상이 아니지만 그 카톡 닉네임은 생존자의 힌트로 쓰였다.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).memberId).toBe(survivor.id);
  });

  it("counts not-found and conflicts without stopping", async () => {
    const owner = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.riotAccount.create({
      data: { puuid: "p-taken", memberId: owner.id, gameName: "가닉", tagLine: "1", lastSeenAt: new Date() },
    });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "다", discordUserId: "d-3", riotId: "없는닉#9" } });
    await prisma.member.create({ data: { realName: "라", discordUserId: "d-4", riotId: "라닉#4" } });
    const lookup = lookupFrom({ "가닉#1": found("p-taken", "가닉", "1"), "라닉#4": found("p-4", "라닉", "4") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    // owner는 힌트가 없어 skipped다 — 나(충돌), 다(못 찾음), 라(등록)가 차례로 집계된다.
    expect(result).toEqual({ registered: 1, notFound: 1, conflicts: 1, skipped: 1, unauthorized: false });
  });

  it("stops at the first unauthorized response", async () => {
    await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "나닉#2" } });
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "unauthorized" }));

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.unauthorized).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("retries rate_limited once after sleeping, then stops if it repeats", async () => {
    await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "나닉#2" } });
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "rate_limited" }));
    const sleep = vi.fn(async () => {});

    const result = await registerRiotAccountsFromHints(prisma, lookup, { sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(result.registered).toBe(0);
  });
});

describe("countRiotLookupTargets", () => {
  it("counts active members holding a riot id that is not registered yet", async () => {
    // 힌트가 이미 등록된 계정과 같다 — 조회할 것이 없다.
    const settled = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "x#1" } });
    await prisma.riotAccount.create({
      data: { puuid: "p", memberId: settled.id, gameName: "x", tagLine: "1", lastSeenAt: new Date() },
    });
    // 계정이 하나 있지만 디코 별명에 다른 ID가 더 있다 — 대상이다.
    const hasMore = await prisma.member.create({
      data: { realName: "나", discordUserId: "d-2", discordDisplayName: "나/부계정#2/탑" },
    });
    await prisma.riotAccount.create({
      data: { puuid: "p2", memberId: hasMore.id, gameName: "본계정", tagLine: "1", lastSeenAt: new Date() },
    });
    const survivor = await prisma.member.create({ data: { realName: "다", discordUserId: "d-3" } });
    await prisma.member.create({ data: { kakaoNickname: "다/95/y#1", mergedIntoId: survivor.id } });

    expect(await countRiotLookupTargets(prisma)).toBe(2);
  });
});
