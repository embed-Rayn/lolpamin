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
    displayName: null,
    isBot: false,
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("importDiscordMembers", () => {
  it("creates a half record for an unseen discord account", async () => {
    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toEqual({ created: 1, updated: 0, skippedBots: 0, removed: 0, detached: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordUserId).toBe("d-1");
    expect(member.discordHandle).toBe("minjun");
    expect(member.discordJoinedAt).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(member.kakaoNickname).toBeNull();
    expect(member.mmr).toBe(1000);
  });

  it("updates the handle of an account it has seen before", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "old-handle", mmr: 1400 },
    });

    const result = await importDiscordMembers(prisma, [guildMember({ username: "new-handle" })]);

    expect(result).toEqual({ created: 0, updated: 1, skippedBots: 0, removed: 0, detached: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordHandle).toBe("new-handle");
    expect(member.mmr).toBe(1400);
  });

  it("skips bot accounts", async () => {
    const result = await importDiscordMembers(prisma, [
      guildMember({ discordUserId: "d-bot", username: "MEE6", isBot: true }),
    ]);

    expect(result).toEqual({ created: 0, updated: 0, skippedBots: 1, removed: 0, detached: 0 });
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

  it("returns zeroes for an empty list and prunes nothing", async () => {
    await prisma.member.create({ data: { discordUserId: "d-gone" } });

    expect(await importDiscordMembers(prisma, [])).toEqual({ created: 0, updated: 0, skippedBots: 0, removed: 0, detached: 0 });
    expect(await prisma.member.count()).toBe(1);
  });

  it("stores the discord display name on a newly created member", async () => {
    await importDiscordMembers(prisma, [
      { discordUserId: "d-1", username: "daehyeok_", displayName: "유대혁/95/유대혁#KR1/sup", isBot: false, joinedAt: null },
    ]);

    const member = await prisma.member.findUnique({ where: { discordUserId: "d-1" } });
    expect(member?.discordHandle).toBe("daehyeok_");
    expect(member?.discordDisplayName).toBe("유대혁/95/유대혁#KR1/sup");
  });

  it("refreshes the display name of an existing member", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "옛이름" },
    });

    await importDiscordMembers(prisma, [
      { discordUserId: "d-1", username: "daehyeok_", displayName: "새이름", isBot: false, joinedAt: null },
    ]);

    const member = await prisma.member.findUnique({ where: { discordUserId: "d-1" } });
    expect(member?.discordDisplayName).toBe("새이름");
  });
});

describe("importDiscordMembers — accounts no longer in the guild", () => {
  it("deletes a discord-only half that holds nothing else", async () => {
    await prisma.member.create({ data: { discordUserId: "d-gone", discordHandle: "kicked" } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result.removed).toBe(1);
    expect(await prisma.member.findUnique({ where: { discordUserId: "d-gone" } })).toBeNull();
  });

  it("detaches the discord side of a member with a record, keeping the record", async () => {
    const member = await prisma.member.create({
      data: { discordUserId: "d-gone", discordHandle: "kicked", discordDisplayName: "권진현", kakaoNickname: "권진현/90/x#1" },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date(), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: member.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1023 },
    });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toMatchObject({ removed: 0, detached: 1 });
    const kept = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(kept.discordUserId).toBeNull();
    expect(kept.discordHandle).toBeNull();
    expect(kept.discordDisplayName).toBeNull();
    expect(kept.kakaoNickname).toBe("권진현/90/x#1");
    expect(await prisma.gameParticipant.count({ where: { memberId: member.id } })).toBe(1);
  });

  it("keeps a discord-only row an admin has written on", async () => {
    await prisma.member.create({ data: { discordUserId: "d-gone", realName: "홍길동" } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toMatchObject({ removed: 0, detached: 1 });
    expect(await prisma.member.count({ where: { realName: "홍길동" } })).toBe(1);
  });

  it("keeps a discord-only row whose tombstone carries the kakao side", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-gone" } });
    await prisma.member.create({ data: { kakaoNickname: "권진현/90/x#1", mergedIntoId: survivor.id } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toMatchObject({ removed: 0, detached: 1 });
    expect(await prisma.member.count()).toBe(3);
  });

  it("leaves rows still in the guild alone", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1" } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toMatchObject({ updated: 1, removed: 0, detached: 0 });
  });
});
