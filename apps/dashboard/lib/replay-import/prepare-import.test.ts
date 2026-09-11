import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { prepareReplayImport, REPLAY_IMPORT_ERRORS } from "./prepare-import";
import { buildRoflFixture, tenPlayers } from "./test-fixture";

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

function replayWith(first: { puuid?: string; gameName?: string; tagLine?: string; position?: string }) {
  return buildRoflFixture(tenPlayers([first]));
}

describe("prepareReplayImport", () => {
  it("confirms a slot whose puuid is already a known riot account", async () => {
    const member = await prisma.member.create({ data: { discordUserId: "d-1", kakaoNickname: "박병준/94/늑구#KR1" } });
    await prisma.riotAccount.create({
      data: { memberId: member.id, puuid: "puuid-0", gameName: "옛날닉", tagLine: "KR1", lastSeenAt: new Date() },
    });

    const prepared = await prepareReplayImport(prisma, replayWith({ gameName: "새로운닉" }));

    const slot = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(slot.status).toBe("confirmed");
    expect(slot.memberId).toBe(member.id);
  });

  it("resolves a confirmed account through a tombstone to the survivor", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-2" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "박병준/94/늑 구#KR1", mergedIntoId: survivor.id },
    });
    await prisma.riotAccount.create({
      data: { memberId: tombstone.id, puuid: "puuid-0", gameName: "늑구", tagLine: "KR1", lastSeenAt: new Date() },
    });

    const prepared = await prepareReplayImport(prisma, replayWith({}));

    expect(prepared.slots.find((s) => s.puuid === "puuid-0")!.memberId).toBe(survivor.id);
  });

  it("marks a slot as an outsider when the account was confirmed as a non-member", async () => {
    await prisma.riotAccount.create({
      data: { memberId: null, puuid: "puuid-0", gameName: "외부인", tagLine: "KR1", lastSeenAt: new Date() },
    });

    const prepared = await prepareReplayImport(prisma, replayWith({}));

    const slot = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(slot.status).toBe("outsider");
    expect(slot.memberId).toBeNull();
  });

  it("auto-assigns a slot whose riot id matches a kakao nickname exactly", async () => {
    const member = await prisma.member.create({
      data: { discordUserId: "d-3", kakaoNickname: "이도현/98/챌린저가고싶나#JBD", realName: "이도현" },
    });

    const prepared = await prepareReplayImport(prisma, replayWith({ gameName: "챌린저가고싶나", tagLine: "JBD" }));

    const slot = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(slot.status).toBe("auto");
    expect(slot.memberId).toBe(member.id);
  });

  it("offers ranked candidates with their reasons when nothing is certain", async () => {
    const member = await prisma.member.create({
      data: {
        discordUserId: "d-4",
        kakaoNickname: "김우성/96/정글의왕#KR1",
        discordDisplayName: "김우성/정글의왕#KR1/정글",
        realName: "김우성",
      },
    });

    const prepared = await prepareReplayImport(
      prisma,
      buildRoflFixture(tenPlayers([{ gameName: "우성정글", position: "JUNGLE" }])),
    );

    const slot = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(slot.status).toBe("unresolved");
    expect(slot.memberId).toBeNull();
    expect(slot.candidates[0]).toMatchObject({ memberId: member.id, score: 70, reasons: ["실명조각", "포지션일치"] });
  });

  it("never offers a member who is already assigned to another slot", async () => {
    // 상호 배타. 같은 사람이 두 슬롯에 앉으면 저장이 @@unique([gameResultId, memberId])에 막힌다.
    const member = await prisma.member.create({
      data: { discordUserId: "d-5", kakaoNickname: "김우성/96/우성정글#KR1", realName: "김우성" },
    });
    await prisma.riotAccount.create({
      data: { memberId: member.id, puuid: "puuid-9", gameName: "우성정글", tagLine: "KR1", lastSeenAt: new Date() },
    });

    const prepared = await prepareReplayImport(
      prisma,
      buildRoflFixture(tenPlayers([{ gameName: "우성정글", tagLine: "KR1" }])),
    );

    expect(prepared.slots.find((s) => s.puuid === "puuid-9")!.memberId).toBe(member.id);
    const other = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(other.status).toBe("unresolved");
    expect(other.candidates).toHaveLength(0);
  });

  it("labels members with their birth year so 동명이인 can be told apart", async () => {
    await prisma.member.create({ data: { realName: "김민준", age: 95, kakaoNickname: "김민준/95/민준탑#KR1" } });
    await prisma.member.create({ data: { realName: "김민준", age: 1, kakaoNickname: "김민준/01/정민이#KR12" } });

    const prepared = await prepareReplayImport(prisma, replayWith({}));

    expect(prepared.members.map((m) => m.label)).toEqual(expect.arrayContaining(["김민준 / 95", "김민준 / 1"]));
  });

  it("refuses a replay that was already imported", async () => {
    const bytes = replayWith({});
    await prisma.gameResult.create({
      data: {
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "RED",
        replayKey: (await prepareReplayImport(prisma, bytes)).replayKey,
      },
    });

    await expect(prepareReplayImport(prisma, bytes)).rejects.toThrow(REPLAY_IMPORT_ERRORS.alreadyImported);
  });

  it("carries the file header and the verification flags through", async () => {
    const prepared = await prepareReplayImport(prisma, replayWith({}));

    expect(prepared.gameVersion).toBe("16.17.810.4348");
    expect(prepared.gameLengthMs).toBe(1584502);
    expect(prepared.winner).toBe("RED");
    expect(prepared.endedInSurrender).toBe(false);
    expect(prepared.slots).toHaveLength(10);
    expect(prepared.slots.filter((s) => s.team === "BLUE")).toHaveLength(5);
  });
});
