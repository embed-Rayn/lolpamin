import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberRealName } from "./update-member-real-name";

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

describe("updateMemberRealName", () => {
  it("stores the trimmed name", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });

    await updateMemberRealName(prisma, member.id, "  유승수  ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.realName).toBe("유승수");
  });

  it("stores null for an empty name", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수" },
    });

    await updateMemberRealName(prisma, member.id, "   ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.realName).toBeNull();
  });

  it("touches nothing but realName", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", mmr: 1400, discordUserId: "d-1" },
    });

    await updateMemberRealName(prisma, member.id, "유승수");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.mmr).toBe(1400);
    expect(updated.discordUserId).toBe("d-1");
    expect(updated.kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("throws for a member that does not exist", async () => {
    await expect(
      updateMemberRealName(prisma, "5f1a1a2e-0000-4000-8000-000000000000", "유승수")
    ).rejects.toThrow();
  });
});
