import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { MasteryLookupResult } from "@/lib/riot-api/mastery";
import type { LookupResult } from "@/lib/riot-api/account";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";
import {
  getMasteryRefreshAvailability,
  refreshChampionMasteries,
  REFRESH_MASTERIES_ERRORS,
} from "./refresh-champion-masteries";

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

const ok = (...rows: Array<[number, number, number]>): MasteryLookupResult => ({
  ok: true,
  masteries: rows.map(([championId, level, points]) => ({ championId, level, points })),
});

function lookupFrom(table: Record<string, MasteryLookupResult>) {
  return vi.fn(async (puuid: string) => table[puuid] ?? { ok: false, reason: "not_found" as const });
}

// The API PUUID is already known unless a test says otherwise — most tests are about the
// mastery lookup, not about filling it.
async function account(memberId: string | null, puuid: string, apiPuuid: string | null = puuid) {
  return prisma.riotAccount.create({
    data: { puuid, apiPuuid, memberId, gameName: puuid, tagLine: "KR1", lastSeenAt: new Date() },
  });
}

// gameName → API PUUID. Missing names answer 404.
function byRiotIdFrom(table: Record<string, string>) {
  return vi.fn(
    async (gameName: string, tagLine: string): Promise<LookupResult> =>
      table[gameName]
        ? { ok: true, account: { puuid: table[gameName], gameName, tagLine } }
        : { ok: false, reason: "not_found" },
  );
}

const noByRiotId = byRiotIdFrom({});

async function masteriesOf(puuid: string) {
  const acc = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid }, include: { masteries: true } });
  return acc.masteries.map((m) => [m.championId, m.level, m.points]).sort((a, b) => a[0] - b[0]);
}

describe("refreshChampionMasteries", () => {
  it("replaces an account's stored masteries with the fresh list", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    const result = await refreshChampionMasteries(prisma, noByRiotId, lookupFrom({ "p-1": ok([266, 12, 150], [48, 5, 20]) }), noSleep);

    expect(result).toEqual({ refreshed: 1, notFound: 0, failed: 0, duplicates: 0, unauthorized: false });
    expect(await masteriesOf("p-1")).toEqual([[48, 5, 20], [266, 12, 150]]);
  });

  it("skips accounts confirmed as outsiders", async () => {
    await account(null, "outsider");
    const lookup = lookupFrom({});

    await refreshChampionMasteries(prisma, noByRiotId, lookup, noSleep);

    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps the old rows on 404 and counts it", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "gone");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 2, points: 3 } });

    const result = await refreshChampionMasteries(prisma, noByRiotId, lookupFrom({}), noSleep);

    expect(result).toEqual({ refreshed: 0, notFound: 1, failed: 0, duplicates: 0, unauthorized: false });
    expect(await masteriesOf("gone")).toEqual([[1, 2, 3]]);
  });

  it("stops on the first unauthorized and does not use up the day", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const lookup = vi.fn(async () => ({ ok: false, reason: "unauthorized" }) as MasteryLookupResult);

    const result = await refreshChampionMasteries(prisma, noByRiotId, lookup, noSleep);

    expect(result.unauthorized).toBe(true);
    const setting = await prisma.siteSetting.findUnique({ where: { id: SITE_SETTING_ID } });
    expect(setting?.masteryRefreshedAt ?? null).toBeNull();
  });

  it("retries a rate limit once, then stops and keeps what it already wrote", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    await new Promise((r) => setTimeout(r, 5));
    await account(m.id, "p-2");
    const lookup = vi.fn(async (puuid: string) =>
      puuid === "p-1" ? ok([1, 1, 1]) : ({ ok: false, reason: "rate_limited" } as MasteryLookupResult),
    );

    const result = await refreshChampionMasteries(prisma, noByRiotId, lookup, noSleep);

    expect(result.refreshed).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(await masteriesOf("p-1")).toEqual([[1, 1, 1]]);
  });

  it("allows one run per 24 hours", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const now = new Date("2026-09-23T12:00:00Z");
    await refreshChampionMasteries(prisma, noByRiotId, lookupFrom({ "p-1": ok() }), { ...noSleep, now });

    await expect(
      refreshChampionMasteries(prisma, noByRiotId, lookupFrom({}), { ...noSleep, now: new Date("2026-09-24T11:59:00Z") }),
    ).rejects.toThrow(REFRESH_MASTERIES_ERRORS.tooSoon);

    const later = await getMasteryRefreshAvailability(prisma, new Date("2026-09-24T12:00:00Z"));
    expect(later).toEqual({ allowed: true, lastRefreshedAt: now, accountCount: 1 });
  });

  it("fills a missing API PUUID from the Riot ID once and reuses it", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "replay-uuid", null);
    const byRiotId = byRiotIdFrom({ "replay-uuid": "enc-1" });
    const lookup = lookupFrom({ "enc-1": ok([266, 7, 100]) });
    const now = new Date("2026-09-23T12:00:00Z");

    const result = await refreshChampionMasteries(prisma, byRiotId, lookup, { ...noSleep, now });

    expect(result.refreshed).toBe(1);
    expect(await masteriesOf("replay-uuid")).toEqual([[266, 7, 100]]);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "replay-uuid" } })).apiPuuid).toBe("enc-1");

    byRiotId.mockClear();
    await refreshChampionMasteries(prisma, byRiotId, lookup, { ...noSleep, now: new Date("2026-09-24T12:00:00Z") });
    expect(byRiotId).not.toHaveBeenCalled();
  });

  it("re-resolves an API PUUID this key cannot decrypt", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1", "other-app");
    const lookup = lookupFrom({ "other-app": { ok: false, reason: "invalid_id" }, "enc-1": ok([1, 1, 1]) });

    const result = await refreshChampionMasteries(prisma, byRiotIdFrom({ "p-1": "enc-1" }), lookup, noSleep);

    expect(result.refreshed).toBe(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).apiPuuid).toBe("enc-1");
  });

  it("counts an account whose Riot ID no longer resolves as not found, without calling the mastery API", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "renamed", null);
    const lookup = lookupFrom({});

    const result = await refreshChampionMasteries(prisma, noByRiotId, lookup, noSleep);

    expect(result).toEqual({ refreshed: 0, notFound: 1, failed: 0, duplicates: 0, unauthorized: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("counts a PUUID that still cannot be decrypted as failed and does not spend the day", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1", "other-app");
    const lookup = vi.fn(async () => ({ ok: false, reason: "invalid_id" }) as MasteryLookupResult);

    const result = await refreshChampionMasteries(prisma, byRiotIdFrom({ "p-1": "still-bad" }), lookup, noSleep);

    expect(result).toEqual({ refreshed: 0, notFound: 0, failed: 1, duplicates: 0, unauthorized: false });
    expect((await getMasteryRefreshAvailability(prisma)).allowed).toBe(true);
  });

  it("stores one Riot account's masteries once when two rows resolve to the same API PUUID", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "replay-uuid", null);
    await new Promise((r) => setTimeout(r, 5));
    const lookupRow = await account(m.id, "old-lookup-puuid", null);
    await prisma.championMastery.create({ data: { riotAccountId: lookupRow.id, championId: 9, level: 1, points: 1 } });
    const byRiotId = byRiotIdFrom({ "replay-uuid": "enc-1", "old-lookup-puuid": "enc-1" });

    const result = await refreshChampionMasteries(prisma, byRiotId, lookupFrom({ "enc-1": ok([1, 1, 50]) }), noSleep);

    expect(result.refreshed).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(await masteriesOf("replay-uuid")).toEqual([[1, 1, 50]]);
    expect(await masteriesOf("old-lookup-puuid")).toEqual([]);
  });

  it("drops the masteries with the account", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    await prisma.riotAccount.delete({ where: { id: acc.id } });

    expect(await prisma.championMastery.count()).toBe(0);
  });
});
