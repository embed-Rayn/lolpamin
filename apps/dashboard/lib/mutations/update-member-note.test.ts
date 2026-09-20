import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberNote } from "./update-member-note";

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

describe("updateMemberNote", () => {
  it("stores the trimmed note", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });

    await updateMemberNote(prisma, member.id, "  휴학 중  ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.note).toBe("휴학 중");
  });

  it("stores null for an empty note", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", note: "휴학 중" },
    });

    await updateMemberNote(prisma, member.id, "   ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.note).toBeNull();
  });

  it("touches nothing but note", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", mmr: 1400, realName: "유승수" },
    });

    await updateMemberNote(prisma, member.id, "메모");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.mmr).toBe(1400);
    expect(updated.realName).toBe("유승수");
  });

  it("throws for a member that does not exist", async () => {
    await expect(
      updateMemberNote(prisma, "5f1a1a2e-0000-4000-8000-000000000000", "메모")
    ).rejects.toThrow();
  });
});
