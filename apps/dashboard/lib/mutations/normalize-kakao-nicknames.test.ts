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

  it("merges two members that normalize to the same nickname, tombstoning the loser and leaving its activity in place", async () => {
    const older = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        lastActiveAt: new Date("2026-08-10T00:00:00Z"),
        mmr: 1200,
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
    const survivor = await prisma.member.findUniqueOrThrow({ where: { id: older.id } });
    expect(survivor.mergedIntoId).toBeNull();
    expect(survivor.mmr).toBe(1200);
    expect(survivor.lastActiveAt).toEqual(new Date("2026-08-20T00:00:00Z"));
    const loser = await prisma.member.findUniqueOrThrow({ where: { id: newer.id } });
    expect(loser.mergedIntoId).toBe(older.id);
    // 활동기록은 옮기지 않고 묘비(패자) 행에 그대로 남는다.
    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].memberId).toBe(newer.id);

    expect(result.mergedPairs).toEqual([
      {
        survivorId: older.id,
        survivorNickname: "유승수/98/ModCow#KR98",
        loserId: newer.id,
        loserNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        loserMentionLogs: 1,
        loserGameParticipants: 0,
      },
    ]);
  });

  it("carries the loser's tier onto an UNRANKED survivor when merging", async () => {
    const older = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    const newer = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        createdAt: new Date("2026-08-05T00:00:00Z"),
        tier: "DIAMOND_2",
      },
    });

    await normalizeKakaoNicknames(prisma);

    const survivor = await prisma.member.findUniqueOrThrow({ where: { id: older.id } });
    expect(survivor.tier).toBe("DIAMOND_2");
  });

  it("keeps the survivor's own tier when merging, instead of taking the loser's", async () => {
    const older = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        tier: "GOLD_1",
      },
    });
    const newer = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        createdAt: new Date("2026-08-05T00:00:00Z"),
        tier: "DIAMOND_2",
      },
    });

    await normalizeKakaoNicknames(prisma);

    const survivor = await prisma.member.findUniqueOrThrow({ where: { id: older.id } });
    expect(survivor.tier).toBe("GOLD_1");
  });

  it("keeps the linked member as the survivor even when it was created later", async () => {
    const older = await prisma.member.create({
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

    const activeMembers = await prisma.member.findMany({ where: { mergedIntoId: null } });
    expect(activeMembers).toHaveLength(1);
    expect(activeMembers[0].id).toBe(linked.id);
    const tombstone = await prisma.member.findUniqueOrThrow({ where: { id: older.id } });
    expect(tombstone.mergedIntoId).toBe(linked.id);
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
    const afterFirst = await prisma.member.findFirstOrThrow({ where: { mergedIntoId: null } });

    // Give the clock room to move so a stray no-op UPDATE (which Prisma's
    // @updatedAt bumps regardless of whether any field actually changed)
    // would show up as a different timestamp below, not one that merely
    // rounds to the same millisecond.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0, mergedPairs: [], skippedGroups: [] });
    expect(await prisma.member.count({ where: { mergedIntoId: null } })).toBe(1);
    const afterSecond = await prisma.member.findFirstOrThrow({ where: { mergedIntoId: null } });
    expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt);
  });

  it("leaves GameParticipant rows on the tombstoned loser instead of moving them", async () => {
    const older = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const newer = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-05T00:00:00Z") },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date("2026-08-10T00:00:00Z"), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: newer.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1016 },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    expect(result.mergedPairs[0].loserGameParticipants).toBe(1);
    const participants = await prisma.gameParticipant.findMany();
    expect(participants).toHaveLength(1);
    expect(participants[0].memberId).toBe(newer.id);
    expect(participants[0].gameResultId).toBe(game.id);
    const survivor = await prisma.member.findUniqueOrThrow({ where: { id: older.id } });
    expect(survivor.mergedIntoId).toBeNull();
  });

  it("merges even when both duplicates played in the same GameResult, since participant rows stay put", async () => {
    // Before tombstoning, this scenario forced a rollback: moving the loser's
    // participation onto the survivor would have violated the
    // (gameResultId, memberId) unique constraint. Now that GameParticipant
    // rows are never moved, the merge can proceed normally — each row stays
    // under its own (tombstoned or surviving) member.
    const older = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const newer = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-05T00:00:00Z") },
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date("2026-08-10T00:00:00Z"), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: older.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1016 },
    });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: newer.id, team: "RED", mmrBefore: 1000, mmrAfter: 984 },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    expect(result.mergedPairs[0].loserGameParticipants).toBe(1);
    expect(await prisma.member.count()).toBe(2);
    expect(await prisma.gameParticipant.count()).toBe(2);
    const participants = await prisma.gameParticipant.findMany();
    expect(participants.map((p) => p.memberId).sort()).toEqual([newer.id, older.id].sort());
    const loser = await prisma.member.findUniqueOrThrow({ where: { id: newer.id } });
    expect(loser.mergedIntoId).toBe(older.id);
  });

  it("turns the loser into a tombstone instead of deleting it", async () => {
    const first = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    const second = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });
    await prisma.mentionLog.create({
      data: { memberId: second.id, mentionedAt: new Date(2026, 7, 2), rawMessage: "@유대혁" },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    const loser = await prisma.member.findUnique({ where: { id: second.id } });
    expect(loser).not.toBeNull();
    expect(loser?.mergedIntoId).toBe(first.id);
    // 활동기록은 옮기지 않고 묘비에 남는다.
    expect(await prisma.mentionLog.count({ where: { memberId: second.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: first.id } })).toBe(0);
    expect(result.mergedPairs[0].loserMentionLogs).toBe(1);
  });

  it("does not re-merge a tombstone on a second run", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });

    await normalizeKakaoNicknames(prisma);
    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0, mergedPairs: [], skippedGroups: [] });
  });

  it("keeps the kakao account holder as the survivor", async () => {
    // 카톡 계정 ID도 @unique다. 그 값을 쥔 채 묘비가 되면 같은 계정을 다시 가져올 때
    // 제약에 막힌다(불변식 1) — 그래서 먼저 만들어진 쪽보다 우선해서 남긴다.
    const older = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    const holder = await prisma.member.create({
      data: { kakaoUserId: "k-1", kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: holder.id } })).mergedIntoId).toBeNull();
    expect((await prisma.member.findUniqueOrThrow({ where: { id: older.id } })).mergedIntoId).toBe(holder.id);
  });

  it("skips a group that could only be merged by tombstoning a platform account id", async () => {
    const discordSide = await prisma.member.create({
      data: { discordUserId: "d-1", kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    const kakaoSide = await prisma.member.create({
      data: { kakaoUserId: "k-1", kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(0);
    expect(result.mergedPairs).toEqual([]);
    expect(result.skippedGroups).toHaveLength(1);
    expect(result.skippedGroups[0].matchKey).toBe("유대혁/95");
    expect(result.skippedGroups[0].memberIds).toEqual([discordSide.id, kakaoSide.id]);
    // 두 회원 모두 활성인 채로 남아야 한다 — 불변식 1을 깨느니 사람이 정리하게 둔다.
    expect((await prisma.member.findUniqueOrThrow({ where: { id: discordSide.id } })).mergedIntoId).toBeNull();
    expect((await prisma.member.findUniqueOrThrow({ where: { id: kakaoSide.id } })).mergedIntoId).toBeNull();
  });

  // 그룹 기준을 매칭 키로 옮긴 뒤 생긴 능력: 문자열로는 넷이지만 한 사람인 행들.
  it("merges every spelling of one person into a single survivor", async () => {
    const spellings = [
      "박병준/94/늑 구#kr1",
      "박병준/94/늑 구#KR1",
      "박병준/94/늑구#KR1",
      "박병준/94/완전다른롤닉#KR2",
    ];
    for (const kakaoNickname of spellings) {
      await prisma.member.create({ data: { kakaoNickname } });
    }

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(3);
    const active = await prisma.member.findMany({ where: { mergedIntoId: null } });
    expect(active).toHaveLength(1);
    // 생존자는 자기 닉네임을 그대로 들고 간다 — 매칭 키가 화면에 새어 나오면 안 된다.
    expect(active[0].kakaoNickname).toBe("박병준/94/늑 구#kr1");
    expect(active[0].realName).toBe("박병준");
  });

  it("leaves two people who share a birth year apart", async () => {
    await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑구#KR1" } });
    await prisma.member.create({ data: { kakaoNickname: "유성진/94/주유#비매너차단" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(0);
    expect(await prisma.member.count({ where: { mergedIntoId: null } })).toBe(2);
  });

  // 동명이인·동갑은 매칭 키로 구별할 수 없다. 둘 다 디스코드를 붙여 뒀다면 자동 병합이
  // 계정 연결 하나를 조용히 지우게 되므로, 합치지 않고 통째로 롤백하고 사람에게 넘긴다.
  it("refuses to merge two same-name same-year members who both linked discord", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "박병준/94/늑구#KR1", discordUserId: "d-1" },
    });
    await prisma.member.create({
      data: { kakaoNickname: "박병준/94/다른사람#KR9", discordUserId: "d-2" },
    });

    await expect(normalizeKakaoNicknames(prisma)).rejects.toThrow("디스코드 연동이 2명 이상입니다");
    expect(await prisma.member.count({ where: { mergedIntoId: null } })).toBe(2);
  });
});
