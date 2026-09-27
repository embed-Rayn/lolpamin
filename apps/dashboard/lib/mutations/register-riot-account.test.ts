import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { registerRiotAccount, removeRiotAccount, REGISTER_RIOT_ACCOUNT_ERRORS } from "./register-riot-account";

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

const ACCOUNT = { puuid: "puuid-1", gameName: "늑 구", tagLine: "KR1" };

async function member(realName: string) {
  return prisma.member.create({ data: { realName, kakaoNickname: `${realName}/95/x#1` } });
}

describe("registerRiotAccount", () => {
  it("creates the row for a new puuid", async () => {
    const m = await member("가");

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(m.id);
    expect(row.gameName).toBe("늑 구");
    expect(row.tagLine).toBe("KR1");
  });

  it("refreshes the name on the same member's existing row", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({
      data: { ...ACCOUNT, gameName: "옛닉", memberId: m.id, lastSeenAt: new Date("2026-01-01") },
    });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.gameName).toBe("늑 구");
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(new Date("2026-01-01").getTime());
    expect(await prisma.riotAccount.count()).toBe(1);
  });

  it("attaches a confirmed-outsider row (memberId null) to the member", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: null, lastSeenAt: new Date() } });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(m.id);
  });

  it("refuses when another member owns the puuid, naming that member", async () => {
    const owner = await member("가");
    const other = await member("나");
    await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: owner.id, lastSeenAt: new Date() } });

    await expect(registerRiotAccount(prisma, other.id, ACCOUNT)).rejects.toThrow(
      REGISTER_RIOT_ACCOUNT_ERRORS.ownedByOther("가"),
    );

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(owner.id);
  });

  it("refuses a member that does not exist", async () => {
    await expect(
      registerRiotAccount(prisma, "00000000-0000-0000-0000-000000000000", ACCOUNT),
    ).rejects.toThrow(REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing);
    expect(await prisma.riotAccount.count()).toBe(0);
  });

  it("clears absorbedFromId when the owner changes from null to a member", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({
      data: { ...ACCOUNT, memberId: null, absorbedFromId: "stale-tombstone", lastSeenAt: new Date() },
    });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.absorbedFromId).toBeNull();
  });
});

describe("removeRiotAccount", () => {
  it("deletes the row", async () => {
    const m = await member("가");
    const row = await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: m.id, lastSeenAt: new Date() } });

    await removeRiotAccount(prisma, row.id);

    expect(await prisma.riotAccount.count()).toBe(0);
  });

  it("ignores an id that no longer exists", async () => {
    await expect(removeRiotAccount(prisma, "00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
  });
});
