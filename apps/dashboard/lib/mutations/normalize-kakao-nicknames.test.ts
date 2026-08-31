import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { normalizeKakaoNicknames } from "./normalize-kakao-nicknames";

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

describe("normalizeKakaoNicknames", () => {
  it("strips notes from nicknames that have no duplicate", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.normalized).toBe(1);
    expect(result.merged).toBe(0);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("merges two members that normalize to the same nickname, moving their activity", async () => {
    const older = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        lastActiveAt: new Date("2026-08-10T00:00:00Z"),
        elo: 1200,
      },
    });
    const newer = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        createdAt: new Date("2026-08-05T00:00:00Z"),
        lastActiveAt: new Date("2026-08-20T00:00:00Z"),
      },
    });
    await prisma.mentionLog.create({ data: { memberId: newer.id, mentionedAt: new Date("2026-08-20T00:00:00Z") } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(older.id);
    expect(members[0].elo).toBe(1200);
    expect(members[0].lastActiveAt).toEqual(new Date("2026-08-20T00:00:00Z"));
    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].memberId).toBe(older.id);
  });

  it("keeps the linked member as the survivor even when it was created later", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const linked = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        discordUserId: "d-1",
        createdAt: new Date("2026-08-05T00:00:00Z"),
      },
    });

    await normalizeKakaoNicknames(prisma);

    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(linked.id);
  });

  it("fills a blank realName from the normalized nickname", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.realNamesFilled).toBe(1);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수");
  });

  it("leaves an existing realName alone", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수(부계정)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.realNamesFilled).toBe(0);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수(부계정)");
  });

  it("changes nothing on a second run", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)" } });
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });
    await normalizeKakaoNicknames(prisma);

    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0 });
    expect(await prisma.member.count()).toBe(1);
  });
});
