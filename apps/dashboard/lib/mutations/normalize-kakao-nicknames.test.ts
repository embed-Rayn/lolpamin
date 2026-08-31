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

    expect(result.mergedPairs).toEqual([
      {
        survivorId: older.id,
        survivorNickname: "유승수/98/ModCow#KR98",
        loserId: newer.id,
        loserNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        movedMentionLogs: 1,
        movedGameParticipants: 0,
      },
    ]);
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

  it("leaves realName null when the entire kakaoNickname is a note", async () => {
    // "(8시 도착)" normalizes to "" — grouping skips it (there's nothing to merge on),
    // but realName-filling must normalize too, or the raw string (with its slash-free
    // note) would be taken whole as the realName.
    await prisma.member.create({ data: { kakaoNickname: "(8시 도착)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(0);
    expect(result.realNamesFilled).toBe(0);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.kakaoNickname).toBe("(8시 도착)");
    expect(member.realName).toBeNull();
  });

  it("rolls back entirely when two members that would merge are both discord-linked", async () => {
    // Both duplicates are already linked to a discord account by hand. Auto-picking
    // a survivor would silently drop the loser's discordUserId/discordHandle with no
    // trace in the output, so this must fail atomically instead: no merge, no partial
    // write, nothing observable changes.
    const first = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        discordUserId: "d-1",
        discordHandle: "seungsu",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    const second = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98(도착)",
        discordUserId: "d-2",
        discordHandle: "seungsu2",
        createdAt: new Date("2026-08-05T00:00:00Z"),
      },
    });

    await expect(normalizeKakaoNicknames(prisma)).rejects.toThrow();

    expect(await prisma.member.count()).toBe(2);
    const refetchedFirst = await prisma.member.findUniqueOrThrow({ where: { id: first.id } });
    expect(refetchedFirst.kakaoNickname).toBe("유승수/98/ModCow#KR98");
    expect(refetchedFirst.discordUserId).toBe("d-1");
    const refetchedSecond = await prisma.member.findUniqueOrThrow({ where: { id: second.id } });
    expect(refetchedSecond.kakaoNickname).toBe("유승수/98/ModCow#KR98(도착)");
    expect(refetchedSecond.discordUserId).toBe("d-2");
  });

  it("changes nothing on a second run", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)" } });
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });
    await normalizeKakaoNicknames(prisma);
    const afterFirst = await prisma.member.findFirstOrThrow();

    // Give the clock room to move so a stray no-op UPDATE (which Prisma's
    // @updatedAt bumps regardless of whether any field actually changed)
    // would show up as a different timestamp below, not one that merely
    // rounds to the same millisecond.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0, mergedPairs: [] });
    expect(await prisma.member.count()).toBe(1);
    const afterSecond = await prisma.member.findFirstOrThrow();
    expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt);
  });

  it("moves GameParticipant rows to the survivor along with mention logs", async () => {
    const older = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const newer = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-05T00:00:00Z") },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date("2026-08-10T00:00:00Z"), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: newer.id, team: "BLUE", eloBefore: 1000, eloAfter: 1016 },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    const participants = await prisma.gameParticipant.findMany();
    expect(participants).toHaveLength(1);
    expect(participants[0].memberId).toBe(older.id);
    expect(participants[0].gameResultId).toBe(game.id);
  });

  it("rolls back entirely when a merge would collide on the same GameResult", async () => {
    // Both duplicate members played in the same game under their own row —
    // moving the loser's participation onto the survivor would violate the
    // (gameResultId, memberId) unique constraint. The whole normalization
    // runs in one transaction, so this must fail atomically: no merge, no
    // partial write, nothing observable changes.
    const older = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const newer = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-05T00:00:00Z") },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date("2026-08-10T00:00:00Z"), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: older.id, team: "BLUE", eloBefore: 1000, eloAfter: 1016 },
    });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: newer.id, team: "RED", eloBefore: 1000, eloAfter: 984 },
    });

    await expect(normalizeKakaoNicknames(prisma)).rejects.toThrow();

    expect(await prisma.member.count()).toBe(2);
    expect(await prisma.gameParticipant.count()).toBe(2);
    const participants = await prisma.gameParticipant.findMany();
    expect(participants.map((p) => p.memberId).sort()).toEqual([newer.id, older.id].sort());
  });
});
