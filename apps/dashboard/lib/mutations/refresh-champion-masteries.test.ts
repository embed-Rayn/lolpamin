import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { MasteryLookupResult } from "@/lib/riot-api/mastery";
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

async function account(memberId: string | null, puuid: string) {
  return prisma.riotAccount.create({ data: { puuid, memberId, gameName: puuid, tagLine: "KR1", lastSeenAt: new Date() } });
}

async function masteriesOf(puuid: string) {
  const acc = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid }, include: { masteries: true } });
  return acc.masteries.map((m) => [m.championId, m.level, m.points]).sort((a, b) => a[0] - b[0]);
}

describe("refreshChampionMasteries", () => {
  it("replaces an account's stored masteries with the fresh list", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    const result = await refreshChampionMasteries(prisma, lookupFrom({ "p-1": ok([266, 12, 150], [48, 5, 20]) }), noSleep);

    expect(result).toEqual({ refreshed: 1, notFound: 0, unauthorized: false });
    expect(await masteriesOf("p-1")).toEqual([[48, 5, 20], [266, 12, 150]]);
  });

  it("skips accounts confirmed as outsiders", async () => {
    await account(null, "outsider");
    const lookup = lookupFrom({});

    await refreshChampionMasteries(prisma, lookup, noSleep);

    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps the old rows on 404 and counts it", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "gone");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 2, points: 3 } });

    const result = await refreshChampionMasteries(prisma, lookupFrom({}), noSleep);

    expect(result).toEqual({ refreshed: 0, notFound: 1, unauthorized: false });
    expect(await masteriesOf("gone")).toEqual([[1, 2, 3]]);
  });

  it("stops on the first unauthorized and does not use up the day", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const lookup = vi.fn(async () => ({ ok: false, reason: "unauthorized" }) as MasteryLookupResult);

    const result = await refreshChampionMasteries(prisma, lookup, noSleep);

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

    const result = await refreshChampionMasteries(prisma, lookup, noSleep);

    expect(result.refreshed).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(await masteriesOf("p-1")).toEqual([[1, 1, 1]]);
  });

  it("allows one run per 24 hours", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const now = new Date("2026-09-23T12:00:00Z");
    await refreshChampionMasteries(prisma, lookupFrom({ "p-1": ok() }), { ...noSleep, now });

    await expect(
      refreshChampionMasteries(prisma, lookupFrom({}), { ...noSleep, now: new Date("2026-09-24T11:59:00Z") }),
    ).rejects.toThrow(REFRESH_MASTERIES_ERRORS.tooSoon);

    const later = await getMasteryRefreshAvailability(prisma, new Date("2026-09-24T12:00:00Z"));
    expect(later).toEqual({ allowed: true, lastRefreshedAt: now, accountCount: 1 });
  });

  it("drops the masteries with the account", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    await prisma.riotAccount.delete({ where: { id: acc.id } });

    expect(await prisma.championMastery.count()).toBe(0);
  });
});
