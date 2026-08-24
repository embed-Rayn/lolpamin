import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { recordMemberActivity } from "./record-member-activity";

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

describe("recordMemberActivity", () => {
  it("creates a half-record Member when the kakaoUserId is new", async () => {
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-999", mentionedAt, rawMessage: "@새회원 안녕" });

    const member = await prisma.member.findUnique({ where: { kakaoUserId: "k-999" } });
    expect(member).not.toBeNull();
    expect(member?.discordUserId).toBeNull();
    expect(member?.elo).toBe(1000);
    expect(member?.lastActiveAt).toEqual(mentionedAt);
  });

  it("updates lastActiveAt on an existing member without touching other fields", async () => {
    const existing = await prisma.member.create({
      data: { kakaoUserId: "k-1", realName: "김도현", elo: 1482, lastActiveAt: new Date("2026-08-01T00:00:00Z") },
    });
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-1", mentionedAt, rawMessage: null });

    const updated = await prisma.member.findUnique({ where: { id: existing.id } });
    expect(updated?.lastActiveAt).toEqual(mentionedAt);
    expect(updated?.realName).toBe("김도현");
    expect(updated?.elo).toBe(1482);
  });

  it("inserts a MentionLog row linked to the member", async () => {
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-2", mentionedAt, rawMessage: "@멘션됨 테스트 메시지" });

    const member = await prisma.member.findUnique({ where: { kakaoUserId: "k-2" } });
    const logs = await prisma.mentionLog.findMany({ where: { memberId: member?.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].mentionedAt).toEqual(mentionedAt);
    expect(logs[0].rawMessage).toBe("@멘션됨 테스트 메시지");
  });
});
