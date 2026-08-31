import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { importDiscordMembers, type DiscordGuildMember } from "./import-discord-members";

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

function guildMember(overrides: Partial<DiscordGuildMember> = {}): DiscordGuildMember {
  return {
    discordUserId: "d-1",
    username: "minjun",
    isBot: false,
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("importDiscordMembers", () => {
  it("creates a half record for an unseen discord account", async () => {
    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toEqual({ created: 1, updated: 0, skippedBots: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordUserId).toBe("d-1");
    expect(member.discordHandle).toBe("minjun");
    expect(member.discordJoinedAt).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(member.kakaoNickname).toBeNull();
    expect(member.elo).toBe(1000);
  });

  it("updates the handle of an account it has seen before", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "old-handle", elo: 1400 },
    });

    const result = await importDiscordMembers(prisma, [guildMember({ username: "new-handle" })]);

    expect(result).toEqual({ created: 0, updated: 1, skippedBots: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordHandle).toBe("new-handle");
    expect(member.elo).toBe(1400);
  });

  it("skips bot accounts", async () => {
    const result = await importDiscordMembers(prisma, [
      guildMember({ discordUserId: "d-bot", username: "MEE6", isBot: true }),
    ]);

    expect(result).toEqual({ created: 0, updated: 0, skippedBots: 1 });
    expect(await prisma.member.count()).toBe(0);
  });

  it("leaves kakao-only members untouched", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수" } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result.created).toBe(1);
    expect(await prisma.member.count()).toBe(2);
    const kakaoOnly = await prisma.member.findFirstOrThrow({ where: { kakaoNickname: { not: null } } });
    expect(kakaoOnly.discordUserId).toBeNull();
  });

  it("does not overwrite a discordJoinedAt that is already recorded", async () => {
    await prisma.member.create({
      data: {
        discordUserId: "d-1",
        discordHandle: "minjun",
        discordJoinedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    await importDiscordMembers(prisma, [guildMember()]);

    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordJoinedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("returns zeroes for an empty list", async () => {
    expect(await importDiscordMembers(prisma, [])).toEqual({ created: 0, updated: 0, skippedBots: 0 });
  });
});
