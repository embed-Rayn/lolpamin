import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { linkMembers } from "./link-members";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("linkMembers", () => {
  it("merges a discord-only half member with a kakao-only half member into one row", async () => {
    const discordSide = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "minjae0", mmr: 1390 },
    });
    const kakaoSide = await prisma.member.create({
      data: { kakaoUserId: "k-1", kakaoNickname: "재현정글", lastActiveAt: new Date("2026-08-20T00:00:00Z") },
    });

    const merged = await linkMembers(prisma, discordSide.id, kakaoSide.id);

    expect(merged.discordUserId).toBe("d-1");
    expect(merged.kakaoUserId).toBe("k-1");
    expect(merged.mmr).toBe(1390);

    const remaining = await prisma.member.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(discordSide.id);
  });

  it("throws if the discord-side member already has a kakaoUserId", async () => {
    const alreadyFull = await prisma.member.create({
      data: { discordUserId: "d-2", kakaoUserId: "k-2" },
    });
    const kakaoSide = await prisma.member.create({ data: { kakaoUserId: "k-3" } });

    await expect(linkMembers(prisma, alreadyFull.id, kakaoSide.id)).rejects.toThrow(
      "already linked"
    );
  });

  it("throws if the kakao-side member already has a discordUserId", async () => {
    const discordSide = await prisma.member.create({ data: { discordUserId: "d-3" } });
    const alreadyFull = await prisma.member.create({
      data: { discordUserId: "d-4", kakaoUserId: "k-4" },
    });

    await expect(linkMembers(prisma, discordSide.id, alreadyFull.id)).rejects.toThrow(
      "already linked"
    );
  });

  it("throws if the discord-side member already has a kakaoNickname (no kakaoUserId)", async () => {
    const alreadyLinkedViaNickname = await prisma.member.create({
      data: { discordUserId: "d-5", kakaoNickname: "기존닉네임#1234" },
    });
    const kakaoSide = await prisma.member.create({ data: { kakaoUserId: "k-5" } });

    await expect(linkMembers(prisma, alreadyLinkedViaNickname.id, kakaoSide.id)).rejects.toThrow(
      "already linked"
    );
  });

  it("backfills realName and age by parsing a realName/age/nicknameTag-formatted kakaoNickname", async () => {
    const discordSide = await prisma.member.create({ data: { discordUserId: "d-6" } });
    const kakaoSide = await prisma.member.create({
      data: { kakaoNickname: "이서준/96/뚜비뚜밥#뚜비얌" },
    });

    const merged = await linkMembers(prisma, discordSide.id, kakaoSide.id);

    expect(merged.realName).toBe("이서준");
    expect(merged.age).toBe(96);
    expect(merged.kakaoNickname).toBe("이서준/96/뚜비뚜밥#뚜비얌");
  });

  it("does not overwrite an already-set realName with the parsed one", async () => {
    const discordSide = await prisma.member.create({
      data: { discordUserId: "d-7", realName: "기존이름" },
    });
    const kakaoSide = await prisma.member.create({
      data: { kakaoNickname: "이서준/96/뚜비뚜밥#뚜비얌" },
    });

    const merged = await linkMembers(prisma, discordSide.id, kakaoSide.id);

    expect(merged.realName).toBe("기존이름");
    expect(merged.age).toBe(96);
  });

  it("leaves realName and age untouched when kakaoNickname doesn't match the realName/age/nicknameTag format", async () => {
    const discordSide = await prisma.member.create({ data: { discordUserId: "d-8" } });
    const kakaoSide = await prisma.member.create({ data: { kakaoNickname: "올빼미" } });

    const merged = await linkMembers(prisma, discordSide.id, kakaoSide.id);

    expect(merged.realName).toBeNull();
    expect(merged.age).toBeNull();
    expect(merged.kakaoNickname).toBe("올빼미");
  });
});
