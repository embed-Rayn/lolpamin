import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberRank } from "./get-member-rank";

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

describe("getMemberRank", () => {
  it("returns 1 when no one has a higher mmr", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1000 } });
    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });

  it("returns 1 + count of members with a strictly higher mmr", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1700 } });
    await prisma.member.create({ data: { discordUserId: "d-2", mmr: 1600 } });
    await prisma.member.create({ data: { discordUserId: "d-3", mmr: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(3);
  });

  it("ties do not count as higher", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 1500 } });
    await prisma.member.create({ data: { discordUserId: "d-2", mmr: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });
});

describe("getMemberRank (aramMmr field)", () => {
  it("ranks by aramMmr when the field is aramMmr", async () => {
    // Both members have a high rift mmr (well above the 1200 threshold) but a low aram
    // one (below it) -- if the field were ignored and mmr used instead, the count of
    // members "higher" than 1200 would be 2 instead of 0, so the two paths diverge.
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 5000, aramMmr: 100 } });
    await prisma.member.create({ data: { discordUserId: "d-2", mmr: 5000, aramMmr: 100 } });

    const rank = await getMemberRank(prisma, 1200, "aramMmr");

    expect(rank).toBe(1);
  });

  it("still defaults to the mmr field when none is given", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", mmr: 5000, aramMmr: 100 } });

    const rank = await getMemberRank(prisma, 1200);

    expect(rank).toBe(2);
  });
});
