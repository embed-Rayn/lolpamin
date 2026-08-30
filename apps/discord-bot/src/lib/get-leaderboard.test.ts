import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getLeaderboard } from "./get-leaderboard";

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

describe("getLeaderboard", () => {
  it("returns members ordered by elo descending with 1-indexed rank", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", realName: "낮음", elo: 1200 } });
    await prisma.member.create({ data: { discordUserId: "d-2", realName: "높음", elo: 1800 } });
    await prisma.member.create({ data: { discordUserId: "d-3", realName: "중간", elo: 1500 } });

    const result = await getLeaderboard(prisma, 10);

    expect(result).toEqual([
      { rank: 1, name: "높음", elo: 1800 },
      { rank: 2, name: "중간", elo: 1500 },
      { rank: 3, name: "낮음", elo: 1200 },
    ]);
  });

  it("respects the limit", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", realName: "A", elo: 1000 } });
    await prisma.member.create({ data: { discordUserId: "d-2", realName: "B", elo: 1100 } });
    await prisma.member.create({ data: { discordUserId: "d-3", realName: "C", elo: 1200 } });

    const result = await getLeaderboard(prisma, 2);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("C");
    expect(result[1].name).toBe("B");
  });

  it("falls back to discordHandle then kakaoNickname when realName is missing", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "handle_only", elo: 1000 } });

    const result = await getLeaderboard(prisma, 10);

    expect(result[0].name).toBe("handle_only");
  });

  it("gives tied members the same competition rank, matching getMemberRank's definition", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", realName: "공동1위-A", elo: 1500 } });
    await prisma.member.create({ data: { discordUserId: "d-2", realName: "공동1위-B", elo: 1500 } });
    await prisma.member.create({ data: { discordUserId: "d-3", realName: "3위", elo: 1400 } });

    const result = await getLeaderboard(prisma, 10);

    expect(result.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("orders tied members deterministically by id", async () => {
    const a = await prisma.member.create({ data: { discordUserId: "d-1", realName: "A", elo: 1500 } });
    const b = await prisma.member.create({ data: { discordUserId: "d-2", realName: "B", elo: 1500 } });
    const [first, second] = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1));

    const result = await getLeaderboard(prisma, 10);

    expect(result.map((e) => e.name)).toEqual([first.realName, second.realName]);
  });
});
