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

describe("updateMemberLane", () => {
  it("stores the primary lane", async () => {
    const member = await prisma.member.create({ data: { realName: "유승수" } });

    await updateMemberLane(prisma, member.id, "primary", "JUNGLE");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.primaryLane).toBe("JUNGLE");
    expect(updated.secondaryLane).toBeNull();
  });

  it("stores the secondary lane without touching the primary one", async () => {
    const member = await prisma.member.create({ data: { realName: "유승수", primaryLane: "TOP" } });

    await updateMemberLane(prisma, member.id, "secondary", "SUPPORT");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.primaryLane).toBe("TOP");
    expect(updated.secondaryLane).toBe("SUPPORT");
  });

  // 드롭다운의 "미지정"을 고르면 null이 온다 — 한번 고른 라인을 다시 비울 수 있어야 한다.
  it("clears a lane back to null", async () => {
    const member = await prisma.member.create({ data: { realName: "유승수", primaryLane: "MID" } });

    await updateMemberLane(prisma, member.id, "primary", null);

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.primaryLane).toBeNull();
  });

  // 주/부가 같아도 막지 않는다. 한 라인만 서는 사람에게 억지로 다른 라인을 적게 하는 것보다
  // 그대로 두는 편이 정직하다.
  it("allows the same lane in both slots", async () => {
    const member = await prisma.member.create({ data: { realName: "원딜만" } });

    await updateMemberLane(prisma, member.id, "primary", "ADC");
    await updateMemberLane(prisma, member.id, "secondary", "ADC");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect([updated.primaryLane, updated.secondaryLane]).toEqual(["ADC", "ADC"]);
  });

  it("throws for a member that does not exist", async () => {
    await expect(
      updateMemberLane(prisma, "5f1a1a2e-0000-4000-8000-000000000000", "primary", "TOP")
    ).rejects.toThrow();
  });
});
