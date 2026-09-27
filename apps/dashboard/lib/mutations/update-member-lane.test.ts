import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberLane } from "./update-member-lane";

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

async function lanesOf(id: string) {
  return prisma.member.findUniqueOrThrow({ where: { id }, select: { mainLane: true, subLane: true } });
}

describe("updateMemberLane", () => {
  it("starts every member with no lanes", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    expect(await lanesOf(member.id)).toEqual({ mainLane: null, subLane: null });
  });

  it("stores main and sub lanes independently", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberLane(prisma, member.id, "main", "JUG");
    await updateMemberLane(prisma, member.id, "sub", "SUP");

    expect(await lanesOf(member.id)).toEqual({ mainLane: "JUG", subLane: "SUP" });
  });

  it("clears a lane back to unknown", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mainLane: "TOP", subLane: "MID" },
    });

    await updateMemberLane(prisma, member.id, "sub", null);

    expect(await lanesOf(member.id)).toEqual({ mainLane: "TOP", subLane: null });
  });

  it("empties the other slot when it already holds the chosen lane", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mainLane: "TOP", subLane: "MID" },
    });

    await updateMemberLane(prisma, member.id, "main", "MID");
    expect(await lanesOf(member.id)).toEqual({ mainLane: "MID", subLane: null });

    await updateMemberLane(prisma, member.id, "sub", "MID");
    expect(await lanesOf(member.id)).toEqual({ mainLane: null, subLane: "MID" });
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberLane(prisma, "00000000-0000-0000-0000-000000000000", "main", "TOP"),
    ).rejects.toThrow();
  });
});
