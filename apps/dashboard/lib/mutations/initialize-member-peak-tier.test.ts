import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { initializeMemberPeakTier } from "./initialize-member-peak-tier";
import { updateMemberPeakTier } from "./update-member-peak-tier";
import { absorbMember } from "./absorb-member";
import type { SoloRankResult } from "../riot-api/solo-rank";
import type { LookupResult } from "../riot-api/account";

if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST required; refusing destructive tests on an unknown database");
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });
beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());
const deps = () => ({ account: vi.fn(async (): Promise<LookupResult> => ({ ok: true, account: { gameName: "test", tagLine: "KR1", puuid: "api-id" } })), rank: vi.fn(async (): Promise<SoloRankResult> => ({ ok: true, tier: "DIAMOND_2" })) });

describe("peak initialization", () => {
  it("preserves manual unranked provenance when members are linked", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d1", peakTierManual: true } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "test", peakTier: "DIAMOND_1", peakTierInitializedAt: new Date() } });
    await absorbMember(prisma, loser.id, survivor.id);
    expect(await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).toMatchObject({ peakTier: "UNRANKED", peakTierManual: true, peakTierInitializedAt: null });
  });
  it("records a successful unranked result once", async () => {
    const m = await prisma.member.create({ data: { riotId: "test#KR1" } });
    const d = deps(); d.rank.mockResolvedValue({ ok: true, tier: "UNRANKED" });
    await initializeMemberPeakTier(prisma, m.id, d);
    expect(await initializeMemberPeakTier(prisma, m.id, d)).toEqual({ skipped: true });
    expect(d.rank).toHaveBeenCalledOnce();
  });
  it("rejects a response after connected accounts change", async () => {
    const m = await prisma.member.create({ data: { riotId: "test#KR1" } });
    const d = deps();
    d.rank.mockImplementation(async () => {
      await prisma.riotAccount.create({ data: { puuid: "new", gameName: "new", tagLine: "KR1", lastSeenAt: new Date(), memberId: m.id } });
      return { ok: true, tier: "GOLD_1" };
    });
    await expect(initializeMemberPeakTier(prisma, m.id, d)).rejects.toThrow("연결 계정이 변경");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).peakTierInitializedAt).toBeNull();
  });
  it("initializes once without changing rated tier or internal MMR", async () => {
    const m = await prisma.member.create({ data: { riotId: "test#KR1", tier: "GOLD_1", mmr: 1450 } });
    const d = deps();
    expect(await initializeMemberPeakTier(prisma, m.id, d)).toEqual({ skipped: false });
    expect(await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ peakTier: "DIAMOND_2", tier: "GOLD_1", mmr: 1450, peakTierManual: false, peakTierInitializedAt: expect.any(Date) });
    expect(await initializeMemberPeakTier(prisma, m.id, d)).toEqual({ skipped: true });
    expect(d.rank).toHaveBeenCalledOnce();
  });
  it("preserves an explicit staff reset to unranked", async () => {
    const m = await prisma.member.create({ data: { riotId: "test#KR1" } });
    await updateMemberPeakTier(prisma, m.id, "UNRANKED");
    const d = deps();
    expect(await initializeMemberPeakTier(prisma, m.id, d)).toEqual({ skipped: true });
    expect(d.rank).not.toHaveBeenCalled();
  });
  it("preserves pre-existing ranked values", async () => {
    const m = await prisma.member.create({ data: { peakTier: "MASTER_400_600" } });
    expect(await initializeMemberPeakTier(prisma, m.id, deps())).toEqual({ skipped: true });
  });
  it("keeps staff edits made during an API request", async () => {
    const m = await prisma.member.create({ data: { riotId: "test#KR1" } });
    const d = deps();
    d.rank.mockImplementation(async () => { await updateMemberPeakTier(prisma, m.id, "MASTER_1000_PLUS"); return { ok: true, tier: "GOLD_1" }; });
    await expect(initializeMemberPeakTier(prisma, m.id, d)).rejects.toThrow("회원 정보가 변경");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).peakTier).toBe("MASTER_1000_PLUS");
  });
  it("does not persist failures or partial multi-account results", async () => {
    const m = await prisma.member.create({ data: {} });
    for (const id of ["a", "b"]) await prisma.riotAccount.create({ data: { puuid: id, apiPuuid: id, gameName: id, tagLine: "KR1", lastSeenAt: new Date(), memberId: m.id } });
    const d = deps();
    d.rank.mockResolvedValueOnce({ ok: true, tier: "GOLD_1" }).mockResolvedValueOnce({ ok: false, reason: "rate_limited" });
    await expect(initializeMemberPeakTier(prisma, m.id, d)).rejects.toThrow("호출 한도");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).peakTierInitializedAt).toBeNull();
  });
  it("selects the highest current solo tier across linked accounts", async () => {
    const m = await prisma.member.create({ data: {} });
    for (const id of ["a", "b"]) await prisma.riotAccount.create({ data: { puuid: id, apiPuuid: id, gameName: id, tagLine: "KR1", lastSeenAt: new Date(), memberId: m.id } });
    const d = deps();
    d.rank.mockResolvedValueOnce({ ok: true, tier: "GOLD_1" }).mockResolvedValueOnce({ ok: true, tier: "DIAMOND_2" });
    await initializeMemberPeakTier(prisma, m.id, d);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).peakTier).toBe("DIAMOND_2");
    expect(d.account).not.toHaveBeenCalled();
  });
});
