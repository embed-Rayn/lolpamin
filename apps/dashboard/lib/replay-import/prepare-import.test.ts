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

  it("lets the higher-scoring slot win a member two unresolved slots both rank first", async () => {
    // 위 "never offers" 테스트와는 다르다 — 거기서는 RiotAccount로 이미 확정된 회원이
    // confirmed 단계에서 taken에 들어가 채점을 아예 거치지 않는다. 여기서는 두 슬롯
    // 모두 미확정 상태에서 채점을 거쳐 같은 회원을 1순위로 뽑는다 — byConfidence
    // 정렬이 실제로 승자를 가르는 경우다. 두 슬롯 다 단독으로는 자동 배정 문턱을
    // 넘는다(puuid-0: 100점, puuid-1: 145점).
    //
    // 점수가 낮은 슬롯(puuid-0, 100점)을 참가자 순서상 먼저 두고 높은 슬롯(puuid-1,
    // 145점)을 뒤에 둔다. 정렬 순서와 자연 순서가 일치하면, 정렬을 통째로 지워도
    // 이 테스트가 통과한다 — 참가자 순서대로만 훑어도 먼저 오는 슬롯이 먼저 회원을
    // 가져가 아래 단언과 우연히 맞아떨어지기 때문이다. 순서를 뒤집어야 정렬이 실제로
    // 일어나는지가 갈린다.
    const member = await prisma.member.create({
      data: {
        discordUserId: "d-m",
        realName: "김우성",
        kakaoNickname: "김우성/96/우성정글#KR1",
        riotId: "탑솔러#KR2",
      },
    });

    const prepared = await prepareReplayImport(
      prisma,
      buildRoflFixture(
        tenPlayers([{ gameName: "탑솔러", tagLine: "KR2" }, { gameName: "우성정글", tagLine: "KR1" }]),
      ),
    );

    const winner = prepared.slots.find((s) => s.puuid === "puuid-1")!;
    expect(winner.status).toBe("auto");
    expect(winner.memberId).toBe(member.id);

    const loser = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(loser.status).toBe("unresolved");
    expect(loser.memberId).toBeNull();
    expect(loser.candidates).toHaveLength(0);
  });

  it("promotes the losing slot's runner-up once the contested member is taken", async () => {
    // puuid-1(170점)이 puuid-0(145점)보다 먼저 처리돼 공통 1순위 member를 가져간다.
    // puuid-0은 taken을 반영해 available을 다시 걸러내고, 남은 후보 runnerUp(100점)이
    // 단독으로 문턱을 넘어 자동 배정된다 — available의 재계산이 실제로 일어나는지 본다.
    //
    // 여기서도 점수가 낮은 쪽(puuid-0, 145점)을 참가자 순서상 먼저 두고 높은 쪽
    // (puuid-1, 170점)을 뒤에 둔다. 자연 순서와 정렬 순서가 어긋나야, 정렬이 사라지는
    // 회귀를 이 테스트가 잡아낸다 — 정렬 없이 참가자 순서대로 처리하면 puuid-0(145점)이
    // 먼저 member를 가져가 버려(단독으로도 문턱을 넘는다) runnerUp이 오히려 빈손이 되고
    // puuid-1이 미확정으로 남아 아래 단언이 뒤집힌다.
    const member = await prisma.member.create({
      data: {
        discordUserId: "d-m2",
        realName: "김우성",
        kakaoNickname: "김우성/96/우성정글#KR1",
        discordDisplayName: "김우성/우성정글#KR1/정글",
        riotId: "우성탑#KR2",
      },
    });
    const runnerUp = await prisma.member.create({
      data: { discordUserId: "d-n", realName: "박병준", kakaoNickname: "박병준/94/우성탑#KR2" },
    });

    const prepared = await prepareReplayImport(
      prisma,
      buildRoflFixture(
        tenPlayers([
          { gameName: "우성탑", tagLine: "KR2", position: "MIDDLE" },
          { gameName: "우성정글", tagLine: "KR1", position: "JUNGLE" },
        ]),
      ),
    );

    const winner = prepared.slots.find((s) => s.puuid === "puuid-1")!;
    expect(winner.status).toBe("auto");
    expect(winner.memberId).toBe(member.id);
    expect(winner.candidates).toHaveLength(0);

    const promoted = prepared.slots.find((s) => s.puuid === "puuid-0")!;
    expect(promoted.status).toBe("auto");
    expect(promoted.memberId).toBe(runnerUp.id);
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
