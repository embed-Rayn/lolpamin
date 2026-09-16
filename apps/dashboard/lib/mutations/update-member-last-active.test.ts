import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberLastActive } from "./update-member-last-active";

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

describe("updateMemberLastActive", () => {
  it("stores the given date as the member's last activity", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: new Date(2026, 0, 1) },
    });

    await updateMemberLastActive(prisma, member.id, new Date(2026, 8, 1));

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.lastActiveAt).toEqual(new Date(2026, 8, 1));
  });

  it("fills in a member that never had one", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    expect(member.lastActiveAt).toBeNull();

    await updateMemberLastActive(prisma, member.id, new Date(2026, 8, 1));

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.lastActiveAt).toEqual(new Date(2026, 8, 1));
  });
});
