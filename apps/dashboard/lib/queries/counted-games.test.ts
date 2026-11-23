import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getBaselineGameFilter, getCountedGameFilter } from "./counted-games";

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

describe("getCountedGameFilter", () => {
  it("restricts to live internal games when there is no reset", async () => {
    expect(await getCountedGameFilter(prisma)).toEqual({ cancelledAt: null, kind: "INTERNAL" });
  });

  it("adds the reset baseline", async () => {
    const resetAt = new Date("2026-09-02T00:00:00Z");
    await prisma.ratingReset.create({ data: { kind: "SOFT", memberCount: 1, resetAt } });

    expect(await getCountedGameFilter(prisma)).toEqual({
      cancelledAt: null,
      kind: "INTERNAL",
      createdAt: { gt: resetAt },
    });
  });
});

describe("getBaselineGameFilter", () => {
  it("has no kind restriction", async () => {
    const filter = await getBaselineGameFilter(prisma);

    expect(filter).toEqual({ cancelledAt: null });
    expect("kind" in filter).toBe(false);
  });

  it("adds the reset baseline", async () => {
    const resetAt = new Date("2026-09-02T00:00:00Z");
    await prisma.ratingReset.create({ data: { kind: "HARD", memberCount: 1, resetAt } });

    expect(await getBaselineGameFilter(prisma)).toEqual({ cancelledAt: null, createdAt: { gt: resetAt } });
  });
});
