import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { LookupResult } from "@/lib/riot-api/account";
import type { SoloRankLookupResult } from "@/lib/riot-api/league";
import { getPeakTierRefreshAvailability, refreshPeakTiers, REFRESH_PEAK_TIERS_ERRORS } from "./refresh-peak-tiers";

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

// Missing PUUIDs are unranked.
function rankFrom(table: Record<string, SoloRankLookupResult>) {
  return vi.fn(async (puuid: string) => table[puuid] ?? ({ ok: true, tier: null } as SoloRankLookupResult));
}

function byRiotIdFrom(table: Record<string, string>) {
  return vi.fn(
    async (gameName: string, tagLine: string): Promise<LookupResult> =>
      table[gameName]
        ? { ok: true, account: { puuid: table[gameName], gameName, tagLine } }
        : { ok: false, reason: "not_found" },
  );
}

const noByRiotId = byRiotIdFrom({});

async function account(memberId: string | null, puuid: string, apiPuuid: string | null = puuid) {
  return prisma.riotAccount.create({
    data: { puuid, apiPuuid, memberId, gameName: puuid, tagLine: "KR1", lastSeenAt: new Date() },
  });
}

async function peakOf(id: string) {
  return (await prisma.member.findUniqueOrThrow({ where: { id } })).peakTier;
}

describe("refreshPeakTiers", () => {
  it("raises the peak tier when the current solo rank is higher", async () => {
    const m = await prisma.member.create({ data: { realName: "가", peakTier: "GOLD_2" } });
    await account(m.id, "p-1");

    const result = await refreshPeakTiers(prisma, noByRiotId, rankFrom({ "p-1": { ok: true, tier: "PLATINUM_4" } }), noSleep);

    expect(result).toEqual({ raised: 1, unchanged: 0, notFound: 0, failed: 0, unauthorized: false });
    expect(await peakOf(m.id)).toBe("PLATINUM_4");
  });

  it("never lowers it, and leaves an equal one alone", async () => {
    const high = await prisma.member.create({ data: { realName: "가", peakTier: "DIAMOND_2" } });
    const same = await prisma.member.create({ data: { realName: "나", peakTier: "GOLD_1" } });
    await account(high.id, "p-1");
    await account(same.id, "p-2");
    const rank = rankFrom({ "p-1": { ok: true, tier: "GOLD_1" }, "p-2": { ok: true, tier: "GOLD_1" } });

    const result = await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(result.raised).toBe(0);
    expect(result.unchanged).toBe(2);
    expect(await peakOf(high.id)).toBe("DIAMOND_2");
    expect(await peakOf(same.id)).toBe("GOLD_1");
  });

  it("keeps the stored tier for an unranked account", async () => {
    const m = await prisma.member.create({ data: { realName: "가", peakTier: "DIAMOND_1" } });
    await account(m.id, "p-1");

    const result = await refreshPeakTiers(prisma, noByRiotId, rankFrom({}), noSleep);

    expect(result.unchanged).toBe(1);
    expect(await peakOf(m.id)).toBe("DIAMOND_1");
  });

  it("takes the highest of a member's accounts", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "main");
    await account(m.id, "smurf");
    const rank = rankFrom({ main: { ok: true, tier: "EMERALD_3" }, smurf: { ok: true, tier: "DIAMOND_4" } });

    const result = await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(result.raised).toBe(1);
    expect(await peakOf(m.id)).toBe("DIAMOND_4");
  });

  it("skips accounts confirmed as outsiders", async () => {
    await account(null, "outsider");
    const rank = rankFrom({});

    await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(rank).not.toHaveBeenCalled();
  });

  it("asks once per Riot account when two rows share its API PUUID", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "replay-uuid", "enc-1");
    await account(m.id, "old-lookup-puuid", "enc-1");
    const rank = rankFrom({ "enc-1": { ok: true, tier: "SILVER_1" } });

    await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(rank).toHaveBeenCalledTimes(1);
    expect(await peakOf(m.id)).toBe("SILVER_1");
  });

  it("fills a missing API PUUID from the Riot ID", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "replay-uuid", null);

    await refreshPeakTiers(
      prisma,
      byRiotIdFrom({ "replay-uuid": "enc-1" }),
      rankFrom({ "enc-1": { ok: true, tier: "GOLD_4" } }),
      noSleep,
    );

    expect(await peakOf(m.id)).toBe("GOLD_4");
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "replay-uuid" } })).apiPuuid).toBe("enc-1");
  });

  it("counts not-found and failed lookups without touching the tier or the hour", async () => {
    const a = await prisma.member.create({ data: { realName: "가" } });
    const b = await prisma.member.create({ data: { realName: "나" } });
    await account(a.id, "gone");
    await account(b.id, "flaky");
    const rank = rankFrom({ gone: { ok: false, reason: "not_found" }, flaky: { ok: false, reason: "unavailable" } });

    const result = await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(result).toEqual({ raised: 0, unchanged: 0, notFound: 1, failed: 1, unauthorized: false });
    expect((await getPeakTierRefreshAvailability(prisma)).allowed).toBe(true);
  });

  it("stops on unauthorized, keeps what it already read, and does not use up the hour", async () => {
    const a = await prisma.member.create({ data: { realName: "가" } });
    await account(a.id, "p-1");
    await new Promise((r) => setTimeout(r, 5));
    const b = await prisma.member.create({ data: { realName: "나" } });
    await account(b.id, "p-2");
    const rank = rankFrom({ "p-1": { ok: true, tier: "GOLD_1" }, "p-2": { ok: false, reason: "unauthorized" } });

    const result = await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(result.unauthorized).toBe(true);
    expect(await peakOf(a.id)).toBe("GOLD_1");
    expect((await getPeakTierRefreshAvailability(prisma)).allowed).toBe(true);
  });

  it("retries a rate limit once", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const rank = vi
      .fn<(puuid: string) => Promise<SoloRankLookupResult>>()
      .mockResolvedValueOnce({ ok: false, reason: "rate_limited" })
      .mockResolvedValueOnce({ ok: true, tier: "BRONZE_1" });

    await refreshPeakTiers(prisma, noByRiotId, rank, noSleep);

    expect(rank).toHaveBeenCalledTimes(2);
    expect(await peakOf(m.id)).toBe("BRONZE_1");
  });

  it("allows one run per hour", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const now = new Date("2026-10-08T12:00:00Z");
    await refreshPeakTiers(prisma, noByRiotId, rankFrom({}), { ...noSleep, now });

    await expect(
      refreshPeakTiers(prisma, noByRiotId, rankFrom({}), { ...noSleep, now: new Date("2026-10-08T12:59:00Z") }),
    ).rejects.toThrow(REFRESH_PEAK_TIERS_ERRORS.tooSoon);

    const later = await getPeakTierRefreshAvailability(prisma, new Date("2026-10-08T13:00:00Z"));
    expect(later).toEqual({ allowed: true, lastRefreshedAt: now, accountCount: 1 });
  });
});
