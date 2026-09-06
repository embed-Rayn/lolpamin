import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { processKakaoExport } from "./process-export";
import { absorbMember } from "@/lib/mutations/absorb-member";
import { releaseMember } from "@/lib/mutations/release-member";

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

const FIRST_UPLOAD = [
  "게임구인방 님과 카카오톡 대화",
  "저장한 날짜 : 2026-08-29 22:58:30",
  "--------------- 2026년 8월 29일 토요일 ---------------",
  "[김민준/94/늑 대#1003] [오전 9:00] @이서준/96/뚜비뚜밥#뚜비얌",
  "[김민준/94/늑 대#1003] [오전 9:05] @박지현/95/사육사#1003",
].join("\n");

describe("processKakaoExport", () => {
  it("creates half-record Members for unseen nicknames and logs their activity", async () => {
    const result = await processKakaoExport(prisma, FIRST_UPLOAD);

    expect(result).toEqual({ newMembers: 2, activityUpdates: 0, skippedAsAlreadyProcessed: 0 });

    const members = await prisma.member.findMany({ orderBy: { kakaoNickname: "asc" } });
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.kakaoNickname).sort()).toEqual([
      "박지현/95/사육사#1003",
      "이서준/96/뚜비뚜밥#뚜비얌",
    ]);
    expect(members.every((m) => m.discordUserId === null)).toBe(true);

    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(2);
  });

  it("updates lastActiveAt for an existing member matched by exact kakaoNickname, without touching other fields", async () => {
    const existing = await prisma.member.create({
      data: {
        kakaoNickname: "이서준/96/뚜비뚜밥#뚜비얌",
        realName: "이서준",
        mmr: 1200,
        lastActiveAt: new Date("2026-08-01T00:00:00Z"),
      },
    });

    const result = await processKakaoExport(prisma, FIRST_UPLOAD);

    expect(result).toEqual({ newMembers: 1, activityUpdates: 1, skippedAsAlreadyProcessed: 0 });

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: existing.id } });
    expect(refreshed.mmr).toBe(1200);
    expect(refreshed.realName).toBe("이서준");
    expect(refreshed.lastActiveAt).toEqual(new Date(2026, 7, 29, 9, 0));
  });

  it("skips mentions at or before the existing watermark on a second, overlapping upload", async () => {
    await processKakaoExport(prisma, FIRST_UPLOAD);

    const secondUpload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-08-29 23:00:00",
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:00] @이서준/96/뚜비뚜밥#뚜비얌",
      "[김민준/94/늑 대#1003] [오전 9:10] @박지현/95/사육사#1003",
    ].join("\n");

    const result = await processKakaoExport(prisma, secondUpload);

    expect(result).toEqual({ newMembers: 0, activityUpdates: 1, skippedAsAlreadyProcessed: 1 });

    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(3);

    const parkJihyun = await prisma.member.findFirstOrThrow({ where: { kakaoNickname: "박지현/95/사육사#1003" } });
    expect(parkJihyun.lastActiveAt).toEqual(new Date(2026, 7, 29, 9, 10));
  });

  it("skips a mention at exactly the prior watermark timestamp", async () => {
    // First upload establishes watermark at 오전 9:05
    const firstResult = await processKakaoExport(prisma, FIRST_UPLOAD);
    expect(firstResult).toEqual({ newMembers: 2, activityUpdates: 0, skippedAsAlreadyProcessed: 0 });

    // Second upload contains a mention at exactly 오전 9:05 with a new nickname
    const exactBoundaryUpload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-08-29 23:00:00",
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:05] @최유진/98/뀨 잇#KR01",
    ].join("\n");

    const result = await processKakaoExport(prisma, exactBoundaryUpload);

    // Should skip the mention at exactly the watermark, no new members created
    expect(result).toEqual({ newMembers: 0, activityUpdates: 0, skippedAsAlreadyProcessed: 1 });

    // Verify no member was created for the new nickname
    const newMember = await prisma.member.findFirst({ where: { kakaoNickname: "최유진/98/뀨 잇#KR01" } });
    expect(newMember).toBeNull();

    // Verify only 2 mention logs (from first upload, none added for skipped mention)
    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(2);
  });

  it("treats a nickname with a parenthesised note as the same member", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @유승수/98/ModCow#KR98(7시30분 도착)",
      "[갑] [오전 9:05] @유승수/98/ModCow#KR98",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(1);
    expect(result.activityUpdates).toBe(1);
    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("fills realName from the nickname when creating a member", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @유승수/98/ModCow#KR98(7시30분 도착)",
    ].join("\n");

    await processKakaoExport(prisma, upload);

    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수");
  });

  it("never overwrites a realName that someone already set", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수(부계정)" },
    });

    await processKakaoExport(
      prisma,
      [
        "--------------- 2026년 8월 29일 토요일 ---------------",
        "[갑] [오전 9:00] @유승수/98/ModCow#KR98",
      ].join("\n")
    );

    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수(부계정)");
  });

  it("skips a mention whose entire nickname is a note", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @(8시 도착)",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result).toEqual({ newMembers: 0, activityUpdates: 0, skippedAsAlreadyProcessed: 0 });
    expect(await prisma.member.count()).toBe(0);
  });

  it("credits activity to the survivor when the mention hits a past nickname", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", kakaoNickname: "유대혁/95/새닉#KR1", realName: "유대혁" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/옛닉#KR1", mergedIntoId: survivor.id },
    });

    const upload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-09-01 10:00:00",
      "--------------- 2026년 9월 1일 화요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:00] @유대혁/95/옛닉#KR1",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(0);
    expect(result.activityUpdates).toBe(1);

    // 활동은 생존자에게 올라가고, 멘션 로그는 히트한 묘비에 그대로 달린다 —
    // 연결을 끊으면 로그도 함께 돌아가야 하기 때문이다.
    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.lastActiveAt).not.toBeNull();
    expect(await prisma.mentionLog.count({ where: { memberId: tombstone.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);
    // 새 회원이 생기면 안 된다 — 묘비를 못 찾으면 여기서 3이 된다.
    expect(await prisma.member.count()).toBe(2);
  });
  // 흡수는 되돌릴 수 있어야 한다: 임포트가 과거 닉네임에 히트하면 멘션 로그는 묘비에
  // 달려야 하고, 연결을 끊으면 그 활동이 풀려난 회원과 함께 돌아와야 한다. 생존자 행에
  // 같은 닉네임이 함께 들어 있으면 위 findFirst가 생존자를 집어 로그가 그쪽에 쌓이고,
  // 해제된 회원은 lastActiveAt이 null이 된다 — 되돌리기가 한 컬럼이 아니게 된다.
  it("gives the activity back to the released member when the import hit its absorbed nickname", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_" },
    });
    const absorbed = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/뚜비뚜밥#뚜비얌" },
    });
    await absorbMember(prisma, absorbed.id, survivor.id);

    const upload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-09-01 10:00:00",
      "--------------- 2026년 9월 1일 화요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:00] @유대혁/95/뚜비뚜밥#뚜비얌",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);
    expect(result).toEqual({ newMembers: 0, activityUpdates: 1, skippedAsAlreadyProcessed: 0 });
    expect(await prisma.mentionLog.count({ where: { memberId: absorbed.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);

    await releaseMember(prisma, absorbed.id);

    const released = await prisma.member.findUniqueOrThrow({ where: { id: absorbed.id } });
    expect(released.mergedIntoId).toBeNull();
    expect(released.lastActiveAt).not.toBeNull();
    const survivorAfter = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(survivorAfter.lastActiveAt).toBeNull();
  });

  // normalize-kakao-nicknames.ts가 만들 수 있는 모양: 생존자와 그 묘비가 정규화된 카톡
  // 닉네임을 완전히 똑같이 들고 있다(원래부터 정규화된 형태였던 로저의 경우). orderBy 없이
  // findFirst로 매칭하면 어느 행이 걸릴지가 Postgres 쿼리 플래너에 달려 결과가 실행마다
  // 달라질 수 있다 — 반드시 묘비 쪽이 걸려야 release로 활동이 되돌아온다.
  it("hits the tombstone, not the survivor, when both share the exact same kakaoNickname", async () => {
    const sharedNickname = "김민준/94/늑대#1003";
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-shared", kakaoNickname: sharedNickname, realName: "김민준" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: sharedNickname, mergedIntoId: survivor.id },
    });

    const upload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-09-01 10:00:00",
      "--------------- 2026년 9월 1일 화요일 ---------------",
      `[갑] [오전 9:00] @${sharedNickname}`,
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result).toEqual({ newMembers: 0, activityUpdates: 1, skippedAsAlreadyProcessed: 0 });

    // 활동(lastActiveAt)은 생존자에게 올라가야 한다.
    const survivorAfter = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(survivorAfter.lastActiveAt).not.toBeNull();

    // 멘션 로그는 반드시 묘비에 달려야 한다 — 생존자에 달리면 release로 되돌릴 수 없다.
    expect(await prisma.mentionLog.count({ where: { memberId: tombstone.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);
    expect(await prisma.member.count()).toBe(2);
  });

  // 실제 모집글에서 같은 사람이 날마다 다르게 적은 표기들. 문자열 exact match였을 때는
  // 네 명으로 갈라졌다.
  it("keeps every spelling of one person on a single member", async () => {
    const upload = [
      "게임구인방 님과 카카오톡 대화",
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[방장] [오전 9:00] 4. @박병준/94/늑 구#kr1 (5시)",
      "--------------- 2026년 8월 30일 일요일 ---------------",
      "[방장] [오전 9:00] 4. @박병준/94/늑 구#KR1",
      "--------------- 2026년 8월 31일 월요일 ---------------",
      "[방장] [오전 9:00] 4. @박병준/94/늑구#KR1",
      "--------------- 2026년 9월 1일 화요일 ---------------",
      "[방장] [오전 9:00] 4. @박병준/94/늑 구#KR1 밥먹고옴",
      "--------------- 2026년 9월 2일 수요일 ---------------",
      "[방장] [오전 9:00] 4. @박병준/94/완전다른롤닉#KR2",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(1);
    expect(result.activityUpdates).toBe(4);
    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    // 처음 본 표기를 그대로 들고 있는다 — 나중 표기로 덮어쓰지 않는다.
    expect(members[0].kakaoNickname).toBe("박병준/94/늑 구#kr1");
    expect(members[0].realName).toBe("박병준");
    expect(await prisma.mentionLog.count()).toBe(5);
  });

  it("still separates two people who share a birth year", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[방장] [오전 9:00] 3. @유기훈/92/람스터#람스터",
      "[방장] [오전 9:01] 4. @박병준/94/늑 구#KR1",
      "[방장] [오전 9:02] 7. @유성진/94/즐겜유저 주유#비매너차단",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(3);
  });

  // 대기 명단도 채팅방 활동이라 그대로 센다. 참가자와 구분하지 않는 것이 의도다.
  it("counts a waitlist entry as activity like any other mention", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[방장] [오전 9:00] 1. @윤찬/85/드랍더비추kr3",
      "[방장] [오전 9:00] 대기",
      "[방장] [오전 9:00] 1.@유대혁/95/유대혁#kr1",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(2);
    const nicknames = (await prisma.member.findMany()).map((m) => m.kakaoNickname);
    expect(nicknames).toContain("유대혁/95/유대혁#kr1");
  });
});
