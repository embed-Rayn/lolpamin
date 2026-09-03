import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberRiotId } from "./update-member-riot-id";

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

describe("updateMemberRiotId", () => {
  it("stores the trimmed value", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberRiotId(prisma, member.id, "  늑 구#1003  ");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBe("늑 구#1003");
  });

  it("keeps spaces and hangul inside the id", async () => {
    // 실제 값이 이렇게 생겼다. 형식 검증을 하지 않는 이유이기도 하다.
    const member = await prisma.member.create({ data: { kakaoNickname: "주디/97/judy#KR1" } });

    await updateMemberRiotId(prisma, member.id, "주디#주토피아");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBe("주디#주토피아");
  });

  it("clears the value when given only whitespace", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", riotId: "늑 구#1003" },
    });

    await updateMemberRiotId(prisma, member.id, "   ");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBeNull();
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberRiotId(prisma, "00000000-0000-0000-0000-000000000000", "늑 구#1003"),
    ).rejects.toThrow();
  });
});
