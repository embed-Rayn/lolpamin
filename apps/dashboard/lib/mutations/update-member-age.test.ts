import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberAge } from "./update-member-age";

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

describe("updateMemberAge", () => {
  it("stores the two-digit birth year", async () => {
    const member = await prisma.member.create({ data: { realName: "가" } });

    await updateMemberAge(prisma, member.id, 94);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.age).toBe(94);
  });

  it("clears to null", async () => {
    const member = await prisma.member.create({ data: { realName: "가", age: 94 } });

    await updateMemberAge(prisma, member.id, null);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.age).toBeNull();
  });

  it("throws when the member does not exist", async () => {
    await expect(updateMemberAge(prisma, "00000000-0000-0000-0000-000000000000", 94)).rejects.toThrow();
  });
});
