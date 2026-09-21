import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/members.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — current-admin.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMemberListData, parseMemberSort, parseSortDirection } = await import("./members");

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.member.create({ data: { realName: "나회원", kakaoNickname: "나회원/95/na#1", mmr: 1200 } });
  await prisma.member.create({ data: { realName: "가회원", kakaoNickname: "가회원/95/ga#1", mmr: 1500 } });
  await prisma.member.create({ data: { realName: null, kakaoNickname: null, discordUserId: "d-1", mmr: 1000 } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function playGame(
  blueId: string,
  redId: string,
  winner: "BLUE" | "RED",
  cancelled = false,
  mode: "RIFT" | "ARAM" = "RIFT",
) {
  const game = await prisma.gameResult.create({
    data: { playedAt: new Date(2026, 7, 3), winner, mode, cancelledAt: cancelled ? new Date() : null },
  });
  for (const [memberId, team] of [
    [blueId, "BLUE"],
    [redId, "RED"],
  ] as const) {
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId, team, mmrBefore: 1000, mmrAfter: 1000 },
    });
  }
}

async function idOf(realName: string): Promise<string> {
  return (await prisma.member.findFirstOrThrow({ where: { realName } })).id;
}

function rowOf(rows: Awaited<ReturnType<typeof getMemberListData>>["rows"], realName: string) {
  return rows.find((r) => r.realName === realName)!;
}

describe("parseMemberSort / parseSortDirection", () => {
  it("defaults to mmr descending", () => {
    expect(parseMemberSort(undefined)).toBe("mmr");
    expect(parseMemberSort("nonsense")).toBe("mmr");
    expect(parseSortDirection(undefined)).toBe("desc");
    expect(parseSortDirection("nonsense")).toBe("desc");
  });

  it("accepts the supported values", () => {
    expect(parseMemberSort("realName")).toBe("realName");
    expect(parseMemberSort("kakaoNickname")).toBe("kakaoNickname");
    expect(parseSortDirection("asc")).toBe("asc");
  });
});

describe("getMemberListData sorting", () => {
  // 시드 회원 셋 중 둘에게만 경기를 준다. 한 판도 안 뛴 세 번째(디코만, 저장값 1000)는
  // 화면에서 0점이라 정렬에서도 맨 아래(오름차순이면 맨 위)로 간다.
  beforeEach(async () => {
    await playGame(await idOf("나회원"), await idOf("가회원"), "BLUE");
  });

  it("sorts by mmr descending by default", async () => {
    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows.map((r) => r.mmr)).toEqual([1500, 1200, 0]);
  });

  it("sorts by mmr ascending", async () => {
    const data = await getMemberListData("all", "", "mmr", "asc");

    expect(data.rows.map((r) => r.mmr)).toEqual([0, 1200, 1500]);
  });

  it("sorts by realName and puts members without one last in both directions", async () => {
    const ascending = await getMemberListData("all", "", "realName", "asc");
    expect(ascending.rows.map((r) => r.realName)).toEqual(["가회원", "나회원", "-"]);

    const descending = await getMemberListData("all", "", "realName", "desc");
    expect(descending.rows.map((r) => r.realName)).toEqual(["나회원", "가회원", "-"]);
  });

  it("sorts by kakao nickname", async () => {
    const data = await getMemberListData("all", "", "kakaoNickname", "asc");

    expect(data.rows.map((r) => r.kakaoNickname)).toEqual(["가회원/95/ga#1", "나회원/95/na#1", "-"]);
  });

  // 삭제 확인창은 이 숫자를 그대로 보여준다. 묘비 몫을 빼먹으면 "0건"이라 안내하고
  // 실제로는 묘비의 기록까지 지운다 — 관리자가 잘못된 정보로 승인하게 된다.
  it("counts the activity of the tombstones it absorbed in the delete confirmation numbers", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", kakaoNickname: "닉" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });
    await prisma.mentionLog.createMany({
      data: [
        { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@옛닉" },
        { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 2), rawMessage: "@옛닉" },
      ],
    });
    const game = await prisma.gameResult.create({ data: { playedAt: new Date(2026, 7, 3), winner: "BLUE" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: game.id, memberId: tombstone.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1016 },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].mentionCount).toBe(2);
    expect(data.rows[0].gameCount).toBe(1);
    expect(data.rows[0].aliasCount).toBe(1);
  });

  it("hides a member that was absorbed into another", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({ data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].id).toBe(survivor.id);
  });
});

describe("getMemberListData 디코 닉네임 표시", () => {
  it("연결된 회원은 핸들이 아니라 서버 별명을 보여준다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: {
        realName: "손민준",
        kakaoNickname: "손민준/99/fukcin216",
        discordUserId: "d-linked",
        discordHandle: "minjun8983",
        discordDisplayName: "손민준/fukcin216#7980/정글제외 무관",
      },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].discordName).toBe("손민준/fukcin216#7980/정글제외 무관");
  });

  // 임포트만 하고 아직 카톡에 못 붙인 계정은 실명도 카톡 닉네임도 비어 있다. 디코 칸까지
  // 비우면 행 전체가 "-"라 누구인지 알 수 없고, 연결해 줄 수도 없다.
  it("카톡과 연결되지 않은 디스코드 계정도 디코 칸에 서버 별명을 띄운다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { discordUserId: "d-alone", discordHandle: "baegseungho5754", discordDisplayName: "백승호/98/탑원딜할래여#kr2" },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].realName).toBe("-");
    expect(data.rows[0].kakaoNickname).toBe("-");
    expect(data.rows[0].discordName).toBe("백승호/98/탑원딜할래여#kr2");
  });

  it("서버 별명이 없는 미연결 계정은 핸들로라도 알아볼 수 있다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { discordUserId: "d-alone", discordHandle: "baegseungho5754" },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows[0].discordName).toBe("baegseungho5754");
  });

  it("디스코드 계정이 없는 회원만 디코 칸이 비어 있다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({ data: { kakaoNickname: "백승호/98/탑원딜할래여#kr2" } });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows[0].discordName).toBe("-");
  });

  it("흡수로 연결한 회원도 디코 칸이 채워진다 — 카톡 닉네임은 묘비에 있다", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-surv", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].discordName).toBe("유대혁/95/유대혁#KR1/sup");
    expect(data.rows[0].kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("미연결 디스코드 계정은 서버 별명으로도 핸들로도 검색된다", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { discordUserId: "d-alone", discordHandle: "baegseungho5754", discordDisplayName: "백승호/98/탑원딜할래여#kr2" },
    });

    const byDisplayName = await getMemberListData("all", "백승호", "mmr", "desc");
    const byHandle = await getMemberListData("all", "baegseungho", "mmr", "desc");

    expect(byDisplayName.rows).toHaveLength(1);
    expect(byHandle.rows).toHaveLength(1);
  });
});

// 라이엇 아이디를 바꾸면 카톡 닉네임이 따라 바뀌고, 임포트가 새 행을 만들어 같은 디코
// 회원에게 흡수된다. 묘비가 둘 이상 쌓였을 때 어느 것이 현재 닉네임인지 정해야 한다.
describe("닉네임을 바꾼 회원의 카톡 칸", () => {
  it("가장 나중에 붙은 묘비의 닉네임을 띄운다", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/옛날아이디#KR1",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/새아이디#KR3",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    });

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].kakaoNickname).toBe("유대혁/95/새아이디#KR3");
  });

  it("옛 닉네임으로도 여전히 검색된다 — 묘비가 과거 이름을 들고 있다", async () => {
    await resetDatabase(prisma);
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/옛날아이디#KR1",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    await prisma.member.create({
      data: {
        kakaoNickname: "유대혁/95/새아이디#KR3",
        mergedIntoId: survivor.id,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    });

    const found = await getMemberListData("all", "옛날아이디", "mmr", "desc");

    expect(found.rows).toHaveLength(1);
  });
});

describe("tier and riot id", () => {
  it("carries both onto the row", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1", tier: "EMERALD_2", riotId: "늑 구#1003" },
    });

    const { rows } = await getMemberListData("all", "");

    expect(rows[0].tier).toBe("EMERALD_2");
    expect(rows[0].riotId).toBe("늑 구#1003");
  });

  it("defaults to unranked with no riot id", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({ data: { realName: "박시형", kakaoNickname: "박시형/97/시형#KR1" } });

    const { rows } = await getMemberListData("all", "");

    expect(rows[0].tier).toBe("UNRANKED");
    expect(rows[0].riotId).toBeNull();
  });

  it("sorts by score, not by the order the enum happens to be declared in", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({ data: { realName: "골드", kakaoNickname: "골드/95/g#1", tier: "GOLD_3" } });
    await prisma.member.create({ data: { realName: "마스터", kakaoNickname: "마스터/95/m#1", tier: "MASTER_400_600" } });
    await prisma.member.create({ data: { realName: "언랭", kakaoNickname: "언랭/95/u#1" } });

    const desc = await getMemberListData("all", "", "tier", "desc");
    expect(desc.rows.map((r) => r.realName)).toEqual(["마스터", "골드", "언랭"]);

    const asc = await getMemberListData("all", "", "tier", "asc");
    expect(asc.rows.map((r) => r.realName)).toEqual(["언랭", "골드", "마스터"]);
  });

  it("accepts tier as a sort key", () => {
    expect(parseMemberSort("tier")).toBe("tier");
  });
});

describe("getMemberListData 전적", () => {
  it("counts wins and losses per member", async () => {
    const a = await prisma.member.create({ data: { realName: "전적가", kakaoNickname: "전적가", mmr: 1000 } });
    const b = await prisma.member.create({ data: { realName: "전적나", kakaoNickname: "전적나", mmr: 1000 } });
    await playGame(a.id, b.id, "BLUE");
    await playGame(a.id, b.id, "BLUE");
    await playGame(a.id, b.id, "RED");

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "전적가")).toMatchObject({ wins: 2, losses: 1, playedCount: 3 });
    expect(rowOf(data.rows, "전적나")).toMatchObject({ wins: 1, losses: 2, playedCount: 3 });
  });

  // 되돌린 경기는 MMR이 원복되므로 전적에서도 빠져야 한다. 참가 기록 자체는 남는다
  // (cancelGameResult 참고) — linked-members와 같은 규칙이다.
  it("leaves a cancelled game out of the record", async () => {
    const a = await prisma.member.create({ data: { realName: "전적가", kakaoNickname: "전적가", mmr: 1000 } });
    const b = await prisma.member.create({ data: { realName: "전적나", kakaoNickname: "전적나", mmr: 1000 } });
    await playGame(a.id, b.id, "BLUE");
    await playGame(a.id, b.id, "BLUE", true);

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "전적가")).toMatchObject({ wins: 1, losses: 0, playedCount: 1 });
  });

  // 리셋은 전적을 0/0/0으로 되돌린다. 경기는 지우지 않으므로 세는 쪽이 기준선을 봐야
  // 한다 — mutations/reset-ratings.ts와 queries/counted-games.ts 참고.
  it("leaves a game entered before the last reset out of the record", async () => {
    const a = await prisma.member.create({ data: { realName: "전적가", kakaoNickname: "전적가", mmr: 1000 } });
    const b = await prisma.member.create({ data: { realName: "전적나", kakaoNickname: "전적나", mmr: 1000 } });
    await playGame(a.id, b.id, "BLUE");

    const { resetAllRatings } = await import("@/lib/mutations/reset-ratings");
    await resetAllRatings(prisma, { kind: "HARD", adminId: null });
    await playGame(a.id, b.id, "RED");

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "전적가")).toMatchObject({ wins: 0, losses: 1, playedCount: 1 });
    // 삭제 확인창 숫자는 기준선과 무관하게 실제 참가 기록 수를 센다.
    expect(rowOf(data.rows, "전적가").gameCount).toBe(2);
  });

  // 흡수한 회원의 경기 기록은 묘비 쪽에 남는다. 생존자 자기 행만 세면 연결을 끝낸
  // 회원의 전적이 0판으로 보인다 — gameCount가 묘비를 합산하는 것과 같은 이유다.
  it("adds the record kept on an absorbed tombstone", async () => {
    const survivor = await prisma.member.create({ data: { realName: "생존", discordUserId: "d-s", mmr: 1000 } });
    const opponent = await prisma.member.create({ data: { realName: "상대", kakaoNickname: "상대", mmr: 1000 } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });
    await playGame(tombstone.id, opponent.id, "BLUE");
    await playGame(survivor.id, opponent.id, "RED");

    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "생존")).toMatchObject({ wins: 1, losses: 1, playedCount: 2 });
  });

  it("reports a member who has never played as no games", async () => {
    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "가회원")).toMatchObject({ wins: 0, losses: 0, playedCount: 0 });
  });
});

// 한 판도 안 뛴 회원은 저장된 점수(기본 1000)와 무관하게 0점으로 보여 준다. 점수는
// 그대로라 첫 경기는 1000에서 계산되지만, 뛰지 않은 1000점이 진 사람 위에 서면 안 된다.
describe("getMemberListData 판수 0", () => {
  it("shows 0 for a member with no counted game and keeps the stored rating untouched", async () => {
    const data = await getMemberListData("all", "", "mmr", "desc");

    expect(rowOf(data.rows, "가회원")).toMatchObject({ mmr: 0, playedCount: 0 });
    expect((await prisma.member.findFirstOrThrow({ where: { realName: "가회원" } })).mmr).toBe(1500);
  });

  it("shows the rating again once a game is counted, and 0 again after a cancel", async () => {
    const a = await idOf("가회원");
    const b = await idOf("나회원");
    await playGame(a, b, "BLUE");
    expect(rowOf((await getMemberListData("all", "", "mmr", "desc")).rows, "가회원").mmr).toBe(1500);

    await prisma.gameResult.updateMany({ data: { cancelledAt: new Date() } });
    expect(rowOf((await getMemberListData("all", "", "mmr", "desc")).rows, "가회원").mmr).toBe(0);
  });

  it("judges the game count per mode — rift games do not light up the aram rating", async () => {
    await resetDatabase(prisma);
    const a = await prisma.member.create({ data: { realName: "가", discordUserId: "d-a", mmr: 1300, aramMmr: 1400 } });
    const b = await prisma.member.create({ data: { realName: "나", discordUserId: "d-b", mmr: 1200, aramMmr: 1100 } });
    await playGame(a.id, b.id, "BLUE");

    const rift = await getMemberListData("all", "", "mmr", "desc");
    const aram = await getMemberListData("all", "", "mmr", "desc", "ARAM");

    expect(rift.rows.map((r) => r.mmr)).toEqual([1300, 1200]);
    expect(aram.rows.map((r) => r.mmr)).toEqual([0, 0]);
  });

  // 순위는 필터·정렬·검색과 무관하게 전체 회원 기준이다. 이름순으로 봐도 1위는 1위다.
  it("ranks played members by displayed MMR regardless of sort or filter", async () => {
    await playGame(await idOf("가회원"), await idOf("나회원"), "BLUE");

    const byName = await getMemberListData("all", "", "realName", "asc");
    const unranked = await getMemberListData("unranked", "", "mmr", "desc");

    expect(byName.rows.map((r) => [r.realName, r.rank])).toEqual([
      ["가회원", 1],
      ["나회원", 2],
      ["-", null],
    ]);
    expect(unranked.rows.map((r) => r.rank)).toEqual([null]);
  });

  it("splits the board into played and unranked", async () => {
    await playGame(await idOf("가회원"), await idOf("나회원"), "BLUE");

    const played = await getMemberListData("played", "", "mmr", "desc");
    const unranked = await getMemberListData("unranked", "", "mmr", "desc");

    expect(played.rows.map((r) => r.realName)).toEqual(["가회원", "나회원"]);
    expect(unranked.rows.map((r) => r.realName)).toEqual(["-"]);
  });
});

describe("getMemberListData mode", () => {
  it("sorts and counts by aramMmr when mode is ARAM", async () => {
    await resetDatabase(prisma);
    const a = await prisma.member.create({ data: { realName: "가", discordUserId: "d-a", mmr: 1000, aramMmr: 1400 } });
    const b = await prisma.member.create({ data: { realName: "나", discordUserId: "d-b", mmr: 2000, aramMmr: 1100 } });
    await playGame(a.id, b.id, "BLUE", false, "ARAM");

    const data = await getMemberListData("all", "", "mmr", "desc", "ARAM");

    expect(data.rows.map((r) => r.realName)).toEqual(["가", "나"]);
    expect(data.rows.map((r) => r.mmr)).toEqual([1400, 1100]);
  });

  it("only counts games of the requested mode in wins/losses", async () => {
    await resetDatabase(prisma);
    const member = await prisma.member.create({ data: { realName: "가", discordUserId: "d-a", mmr: 1000, aramMmr: 1000 } });
    const riftGame = await prisma.gameResult.create({ data: { playedAt: new Date(), winner: "BLUE", mode: "RIFT" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: riftGame.id, memberId: member.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 1017 },
    });
    const aramGame = await prisma.gameResult.create({ data: { playedAt: new Date(), winner: "RED", mode: "ARAM" } });
    await prisma.gameParticipant.create({
      data: { gameResultId: aramGame.id, memberId: member.id, team: "BLUE", mmrBefore: 1000, mmrAfter: 981 },
    });

    const riftData = await getMemberListData("all", "", "mmr", "desc");
    const aramData = await getMemberListData("all", "", "mmr", "desc", "ARAM");

    expect(riftData.rows[0]).toMatchObject({ wins: 1, losses: 0 });
    expect(aramData.rows[0]).toMatchObject({ wins: 0, losses: 1 });
  });
});
