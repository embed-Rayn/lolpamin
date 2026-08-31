import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "./absorb-member";
import { releaseMember } from "./release-member";

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

describe("releaseMember", () => {
  it("makes the tombstone an active member again", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    expect(after.mergedIntoId).toBeNull();
    expect(after.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("recomputes both sides' lastActiveAt from their own mention logs", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "닉" } });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: new Date(2026, 7, 20), rawMessage: "@닉" },
    });
    await absorbMember(prisma, loser.id, survivor.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 20)
    );

    await releaseMember(prisma, loser.id);

    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toBeNull();
    expect((await prisma.member.findUniqueOrThrow({ where: { id: loser.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 20)
    );
  });

  it("keeps the survivor's activity that came from a tombstone it still holds", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const kept = await prisma.member.create({ data: { kakaoNickname: "남는닉" } });
    const released = await prisma.member.create({ data: { kakaoNickname: "떼는닉" } });
    await prisma.mentionLog.create({
      data: { memberId: kept.id, mentionedAt: new Date(2026, 7, 10), rawMessage: "@남는닉" },
    });
    await prisma.mentionLog.create({
      data: { memberId: released.id, mentionedAt: new Date(2026, 7, 20), rawMessage: "@떼는닉" },
    });
    await absorbMember(prisma, kept.id, survivor.id);
    await absorbMember(prisma, released.id, survivor.id);

    await releaseMember(prisma, released.id);

    // 떼어낸 쪽의 활동은 사라지고, 아직 붙어 있는 묘비의 활동은 남아야 한다.
    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 10)
    );
  });

  it("refuses a member that is not a tombstone", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "닉" } });

    await expect(releaseMember(prisma, member.id)).rejects.toThrow();
  });

  it("keeps a repointed cluster on the ultimate survivor after releasing the middle tombstone", async () => {
    const top = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const mid = await prisma.member.create({ data: { kakaoNickname: "mid" } });
    const t1 = await prisma.member.create({ data: { kakaoNickname: "t1" } });
    await prisma.mentionLog.create({
      data: { memberId: t1.id, mentionedAt: new Date(2026, 7, 5), rawMessage: "@t1" },
    });
    await absorbMember(prisma, t1.id, mid.id);
    await absorbMember(prisma, mid.id, top.id);

    await releaseMember(prisma, mid.id);

    // t1 was never mid's to take back — the earlier absorb repointed it straight at top.
    const afterT1 = await prisma.member.findUniqueOrThrow({ where: { id: t1.id } });
    expect(afterT1.mergedIntoId).toBe(top.id);

    const afterMid = await prisma.member.findUniqueOrThrow({ where: { id: mid.id } });
    expect(afterMid.mergedIntoId).toBeNull();
    expect(afterMid.lastActiveAt).toBeNull();

    const afterTop = await prisma.member.findUniqueOrThrow({ where: { id: top.id } });
    expect(afterTop.lastActiveAt).toEqual(new Date(2026, 7, 5));
  });
});
