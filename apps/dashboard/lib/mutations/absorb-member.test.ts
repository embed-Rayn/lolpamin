import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "./absorb-member";

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

describe("absorbMember", () => {
  it("marks the loser as merged without deleting it", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "daehyeok_" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUnique({ where: { id: loser.id } });
    expect(after?.mergedIntoId).toBe(survivor.id);
    expect(after?.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("leaves the loser's mention logs on the loser", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@유대혁" },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    expect(await prisma.mentionLog.count({ where: { memberId: loser.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);
  });

  it("fills the survivor's blank fields and keeps its elo", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", elo: 1200 } });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁", age: 95, riotId: "유대혁#KR1", elo: 900 },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.realName).toBe("유대혁");
    expect(after.age).toBe(95);
    expect(after.riotId).toBe("유대혁#KR1");
    expect(after.elo).toBe(1200);
  });

  it("does not overwrite a field the survivor already has", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", realName: "사람이 고친 이름" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.realName).toBe("사람이 고친 이름");
  });

  it("moves the survivor's lastActiveAt forward to the later of the two", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", lastActiveAt: new Date(2026, 7, 1) },
    });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: new Date(2026, 7, 20) },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.lastActiveAt).toEqual(new Date(2026, 7, 20));
  });

  it("hands the survivor the loser's kakao nickname so the link counts as complete", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("keeps the survivor's own kakao nickname when it already has one", async () => {
    // 개명 경로: 이미 연결된 회원이 새 닉네임 행을 흡수해도 화면에는 예전 닉네임이
    // 남는다. 의도된 결과다 — absorb-member.ts의 주석 참고.
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", kakaoNickname: "예전닉" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "새닉" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.kakaoNickname).toBe("예전닉");
  });

  it("points at the ultimate survivor when the target is itself a tombstone", async () => {
    const top = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const middle = await prisma.member.create({ data: { kakaoNickname: "옛닉" } });
    await absorbMember(prisma, middle.id, top.id);

    const newest = await prisma.member.create({ data: { kakaoNickname: "새닉" } });
    await absorbMember(prisma, newest.id, middle.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: newest.id } });
    expect(after.mergedIntoId).toBe(top.id);
  });

  it("refuses a loser that is already a tombstone", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "옛닉" } });
    await absorbMember(prisma, loser.id, survivor.id);

    await expect(absorbMember(prisma, loser.id, survivor.id)).rejects.toThrow();
  });

  it("refuses a loser that holds a discord account", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { discordUserId: "d-2", kakaoNickname: "닉" } });

    await expect(absorbMember(prisma, loser.id, survivor.id)).rejects.toThrow();

    const after = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    expect(after.mergedIntoId).toBeNull();
  });

  it("refuses to absorb a member into itself", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "닉" } });

    await expect(absorbMember(prisma, member.id, member.id)).rejects.toThrow();
  });

  it("repoints tombstones already held by the loser to the new survivor", async () => {
    const top = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const mid = await prisma.member.create({ data: { kakaoNickname: "mid" } });
    const t1 = await prisma.member.create({ data: { kakaoNickname: "t1" } });
    await absorbMember(prisma, t1.id, mid.id);

    await absorbMember(prisma, mid.id, top.id);

    const afterT1 = await prisma.member.findUniqueOrThrow({ where: { id: t1.id } });
    const afterMid = await prisma.member.findUniqueOrThrow({ where: { id: mid.id } });
    expect(afterT1.mergedIntoId).toBe(top.id);
    expect(afterMid.mergedIntoId).toBe(top.id);

    const active = await prisma.member.findMany({ where: { mergedIntoId: null } });
    expect(active.map((m) => m.id)).toEqual([top.id]);
  });
});
