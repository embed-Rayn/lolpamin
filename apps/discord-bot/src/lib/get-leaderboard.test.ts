import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getLeaderboard } from "./get-leaderboard";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

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
});
