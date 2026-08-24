import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberRank } from "./get-member-rank";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMemberRank", () => {
  it("returns 1 when no one has a higher elo", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1000 } });
    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });

  it("returns 1 + count of members with a strictly higher elo", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1700 } });
    await prisma.member.create({ data: { discordUserId: "d-2", elo: 1600 } });
    await prisma.member.create({ data: { discordUserId: "d-3", elo: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(3);
  });

  it("ties do not count as higher", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1500 } });
    await prisma.member.create({ data: { discordUserId: "d-2", elo: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });
});
