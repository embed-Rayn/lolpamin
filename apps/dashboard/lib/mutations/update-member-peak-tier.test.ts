import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberPeakTier } from "./update-member-peak-tier";

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

describe("updateMemberPeakTier", () => {
  it("starts every member at unranked", async () => {
    const member = await prisma.member.create({ data: { realName: "가" } });
    expect(member.peakTier).toBe("UNRANKED");
  });

  it("stores the peak tier without touching the rated tier", async () => {
    const member = await prisma.member.create({ data: { realName: "가", tier: "GOLD_2" } });

    await updateMemberPeakTier(prisma, member.id, "DIAMOND_1");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.peakTier).toBe("DIAMOND_1");
    expect(after.tier).toBe("GOLD_2");
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberPeakTier(prisma, "00000000-0000-0000-0000-000000000000", "GOLD_3"),
    ).rejects.toThrow();
  });
});
