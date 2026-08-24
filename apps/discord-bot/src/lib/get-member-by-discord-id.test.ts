import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberByDiscordId } from "./get-member-by-discord-id";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMemberByDiscordId", () => {
  it("returns the member matching the given discordUserId", async () => {
    const created = await prisma.member.create({
      data: { discordUserId: "d-123", kakaoUserId: "k-123", realName: "김도현", elo: 1500 },
    });

    const found = await getMemberByDiscordId(prisma, "d-123");

    expect(found?.id).toBe(created.id);
    expect(found?.realName).toBe("김도현");
  });

  it("returns null when no member has that discordUserId", async () => {
    const found = await getMemberByDiscordId(prisma, "does-not-exist");
    expect(found).toBeNull();
  });
});
