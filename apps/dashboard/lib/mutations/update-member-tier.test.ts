import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberTier } from "./update-member-tier";

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

describe("updateMemberTier", () => {
  it("starts every member at unranked", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    expect(member.tier).toBe("UNRANKED");
  });

  it("stores the chosen tier", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberTier(prisma, member.id, "EMERALD_2");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tier).toBe("EMERALD_2");
  });

  it("can be moved back down to unranked", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", tier: "DIAMOND_1" },
    });

    await updateMemberTier(prisma, member.id, "UNRANKED");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tier).toBe("UNRANKED");
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberTier(prisma, "00000000-0000-0000-0000-000000000000", "GOLD_3"),
    ).rejects.toThrow();
  });
});
