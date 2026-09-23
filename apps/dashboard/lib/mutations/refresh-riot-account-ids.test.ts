import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { LookupResult } from "@/lib/riot-api/account";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";
import {
  getRiotIdRefreshAvailability,
  refreshRiotAccountIds,
  REFRESH_RIOT_IDS_ERRORS,
} from "./refresh-riot-account-ids";

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

const found = (puuid: string, gameName: string, tagLine: string): LookupResult => ({
  ok: true,
  account: { puuid, gameName, tagLine },
});

// puuid → 결과. 목록에 없으면 404.
function lookupFrom(table: Record<string, LookupResult>) {
  return vi.fn(async (puuid: string) => table[puuid] ?? { ok: false, reason: "not_found" as const });
}

async function member(realName: string, discordUserId: string) {
  return prisma.member.create({ data: { realName, discordUserId } });
}

// The API PUUID is already known unless a test says otherwise.
async function account(
  memberId: string | null,
  puuid: string,
  gameName: string,
  tagLine: string,
  apiPuuid: string | null = puuid,
) {
  return prisma.riotAccount.create({
    data: { puuid, apiPuuid, memberId, gameName, tagLine, lastSeenAt: new Date() },
  });
}

// "이름#태그" → API PUUID. Missing names answer 404.
function byRiotIdFrom(table: Record<string, string>) {
  return vi.fn(async (gameName: string, tagLine: string): Promise<LookupResult> => {
    const puuid = table[`${gameName}#${tagLine}`];
    return puuid ? found(puuid, gameName, tagLine) : { ok: false, reason: "not_found" };
  });
}

const noByRiotId = byRiotIdFrom({});

describe("refreshRiotAccountIds", () => {
  it("rewrites the stored riot id when the player renamed", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "옛이름", "KR1");
    const lookup = lookupFrom({ "p-1": found("p-1", "새이름", "KR2") });

    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookup, noSleep);

    expect(result).toEqual({ updated: 1, unchanged: 0, notFound: 0, failed: 0, unauthorized: false });
    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } });
    expect([row.gameName, row.tagLine]).toEqual(["새이름", "KR2"]);
  });

  it("counts an identical answer as unchanged and writes nothing", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "그대로", "KR1");
    const lookup = lookupFrom({ "p-1": found("p-1", "그대로", "KR1") });

    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookup, noSleep);

    expect(result).toEqual({ updated: 0, unchanged: 1, notFound: 0, failed: 0, unauthorized: false });
    const after = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } });
    expect([after.gameName, after.tagLine]).toEqual(["그대로", "KR1"]);
  });

  it("keeps the row on 404 and counts it", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "gone", "사라짐", "KR1");

    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookupFrom({}), noSleep);

    expect(result).toEqual({ updated: 0, unchanged: 0, notFound: 1, failed: 0, unauthorized: false });
    expect(await prisma.riotAccount.count({ where: { puuid: "gone" } })).toBe(1);
  });

  it("leaves accounts confirmed as outsiders alone", async () => {
    await account(null, "p-outsider", "외부인", "KR1");
    const lookup = lookupFrom({ "p-outsider": found("p-outsider", "바뀐이름", "KR9") });

    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookup, noSleep);

    expect(lookup).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it("refuses a second run inside an hour", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "옛이름", "KR1");
    const lookup = lookupFrom({ "p-1": found("p-1", "새이름", "KR1") });
    const start = new Date("2026-09-23T01:00:00.000Z");

    await refreshRiotAccountIds(prisma, noByRiotId, lookup, { ...noSleep, now: start });
    lookup.mockClear();

    const tooSoon = new Date(start.getTime() + 59 * 60 * 1000);
    await expect(refreshRiotAccountIds(prisma, noByRiotId, lookup, { ...noSleep, now: tooSoon })).rejects.toThrow(
      REFRESH_RIOT_IDS_ERRORS.tooSoon,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows the next run once an hour has passed", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "이름", "KR1");
    const lookup = lookupFrom({ "p-1": found("p-1", "이름", "KR1") });
    const start = new Date("2026-09-23T01:00:00.000Z");

    await refreshRiotAccountIds(prisma, noByRiotId, lookup, { ...noSleep, now: start });
    const later = new Date(start.getTime() + 60 * 60 * 1000);
    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookup, { ...noSleep, now: later });

    expect(result.unchanged).toBe(1);
    const row = await prisma.siteSetting.findUniqueOrThrow({ where: { id: SITE_SETTING_ID } });
    expect(row.riotIdRefreshedAt).toEqual(later);
  });

  it("does not spend the day when the key is dead", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "이름", "KR1");
    const dead = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "unauthorized" }));

    const result = await refreshRiotAccountIds(prisma, noByRiotId, dead, noSleep);

    expect(result.unauthorized).toBe(true);
    expect((await getRiotIdRefreshAvailability(prisma)).allowed).toBe(true);
  });

  it("does not spend the day when there is nothing to refresh", async () => {
    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookupFrom({}), noSleep);

    expect(result).toEqual({ updated: 0, unchanged: 0, notFound: 0, failed: 0, unauthorized: false });
    expect((await getRiotIdRefreshAvailability(prisma)).allowed).toBe(true);
  });

  it("retries a rate limit once, then stops but keeps what it already fixed", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "옛이름", "KR1");
    await account(m.id, "p-2", "둘째", "KR1");
    const sleep = vi.fn(async () => {});
    const lookup = vi
      .fn(async (_puuid: string): Promise<LookupResult> => ({ ok: false, reason: "rate_limited" }))
      .mockResolvedValueOnce(found("p-1", "새이름", "KR1"));

    const result = await refreshRiotAccountIds(prisma, noByRiotId, lookup, { sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(result.updated).toBe(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).gameName).toBe("새이름");
  });
});

describe("refreshRiotAccountIds — API PUUID", () => {
  it("fills a missing API PUUID from the stored Riot ID and keeps it", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "replay-uuid", "이름", "KR1", null);
    const lookup = lookupFrom({ "enc-1": found("enc-1", "이름", "KR1") });

    const result = await refreshRiotAccountIds(prisma, byRiotIdFrom({ "이름#KR1": "enc-1" }), lookup, noSleep);

    expect(result).toEqual({ updated: 0, unchanged: 1, notFound: 0, failed: 0, unauthorized: false });
    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "replay-uuid" } });
    expect(row.apiPuuid).toBe("enc-1");
  });

  it("re-resolves an API PUUID this key cannot decrypt, then reads the current name", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "옛이름", "KR1", "other-app");
    const lookup = lookupFrom({
      "other-app": { ok: false, reason: "invalid_id" },
      "enc-1": found("enc-1", "옛이름", "KR1"),
    });

    const result = await refreshRiotAccountIds(prisma, byRiotIdFrom({ "옛이름#KR1": "enc-1" }), lookup, noSleep);

    expect(result.unchanged).toBe(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).apiPuuid).toBe("enc-1");
  });

  it("counts a PUUID that still cannot be decrypted as failed and does not spend the day", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "이름", "KR1", "other-app");
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "invalid_id" }));

    const result = await refreshRiotAccountIds(prisma, byRiotIdFrom({ "이름#KR1": "still-bad" }), lookup, noSleep);

    expect(result).toEqual({ updated: 0, unchanged: 0, notFound: 0, failed: 1, unauthorized: false });
    expect((await getRiotIdRefreshAvailability(prisma)).allowed).toBe(true);
  });
});

describe("getRiotIdRefreshAvailability", () => {
  it("reports the member-linked account count and no cooldown before the first run", async () => {
    const m = await member("가", "d-1");
    await account(m.id, "p-1", "이름", "KR1");
    await account(null, "p-2", "외부인", "KR1");

    expect(await getRiotIdRefreshAvailability(prisma)).toEqual({
      allowed: true,
      lastRefreshedAt: null,
      accountCount: 1,
    });
  });
});
