import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { SAVE_REPLAY_IMPORT_ERRORS, saveReplayImport } from "./save-replay-import";
import { cancelGameResult } from "./cancel-game-result";
import { prepareReplayImport } from "../replay-import/prepare-import";
import { buildRoflFixture, tenPlayers } from "../replay-import/test-fixture";

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

async function linkedMember(tag: string) {
  return prisma.member.create({
    data: { discordUserId: `d-${tag}`, kakaoNickname: `k-${tag}`, mmr: 1000 },
  });
}

function assignment(puuid: string, team: "BLUE" | "RED", memberId: string | null) {
  return { puuid, gameName: `name-${puuid}`, tagLine: "KR1", team, memberId };
}

describe("saveReplayImport", () => {
  it("registers a riot account for every assigned slot and records the game", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");

    const result = await saveReplayImport(prisma, {
      replayKey: "key-1",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)],
    });

    expect(result.updates).toHaveLength(2);

    const account = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-blue" } });
    expect(account.memberId).toBe(blue.id);
    expect(account.gameName).toBe("name-p-blue");

    const game = await prisma.gameResult.findUniqueOrThrow({ where: { id: result.gameResultId } });
    expect(game.replayKey).toBe("key-1");
  });

  it("remembers an outsider so the next upload does not ask again", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");

    await saveReplayImport(prisma, {
      replayKey: "key-2",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [
        assignment("p-blue", "BLUE", blue.id),
        assignment("p-red", "RED", red.id),
        assignment("p-outsider", "RED", null),
      ],
    });

    const outsider = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-outsider" } });
    expect(outsider.memberId).toBeNull();
  });

  it("refreshes the display name of an account that renamed in game", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    await prisma.riotAccount.create({
      data: {
        memberId: blue.id,
        puuid: "p-blue",
        gameName: "옛날닉",
        tagLine: "KR9",
        lastSeenAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    await saveReplayImport(prisma, {
      replayKey: "key-3",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)],
    });

    const account = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-blue" } });
    expect(account.gameName).toBe("name-p-blue");
    expect(account.tagLine).toBe("KR1");
    expect(account.lastSeenAt).toEqual(new Date("2026-09-05T12:00:00Z"));
  });

  it("counts the game as activity for everyone who played", async () => {
    // 같이 게임을 했는데 카톡에 글을 안 썼다고 비활동으로 잡히는 구멍을 메운다.
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");

    await saveReplayImport(prisma, {
      replayKey: "key-4",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)],
    });

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue.id } });
    expect(refreshed.lastActiveAt).toEqual(new Date("2026-09-05T12:00:00Z"));
  });

  it("does not pull lastActiveAt backwards for a backdated game", async () => {
    const blue = await prisma.member.create({
      data: { discordUserId: "d-blue", kakaoNickname: "k-blue", lastActiveAt: new Date("2026-09-09T00:00:00Z") },
    });
    const red = await linkedMember("red");

    await saveReplayImport(prisma, {
      replayKey: "key-5",
      playedAt: new Date("2026-09-01T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)],
    });

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue.id } });
    expect(refreshed.lastActiveAt).toEqual(new Date("2026-09-09T00:00:00Z"));
  });

  it("refuses the same member in two slots", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");

    await expect(
      saveReplayImport(prisma, {
        replayKey: "key-6",
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments: [
          assignment("p-blue", "BLUE", blue.id),
          assignment("p-blue2", "BLUE", blue.id),
          assignment("p-red", "RED", red.id),
        ],
      }),
    ).rejects.toThrow(SAVE_REPLAY_IMPORT_ERRORS.duplicateMember);
  });

  it("refuses a team with no members at all", async () => {
    // 회원이 0명인 팀은 평균 레이팅이 없어 MMR 계산이 NaN이 된다.
    const blue = await linkedMember("blue");

    await expect(
      saveReplayImport(prisma, {
        replayKey: "key-7",
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", null)],
      }),
    ).rejects.toThrow(SAVE_REPLAY_IMPORT_ERRORS.emptyTeam);
  });

  it("refuses a replay that was already imported", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const input = {
      replayKey: "key-8",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE" as const,
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)],
    };
    await saveReplayImport(prisma, input);

    await expect(saveReplayImport(prisma, input)).rejects.toThrow(SAVE_REPLAY_IMPORT_ERRORS.alreadyImported);
  });

  it("lets a half-linked member through — the replay is the confirmation", async () => {
    // 계정을 먼저 등록하고 경기를 저장하므로, 배정된 회원은 그 순간 RiotAccount를 갖게 되어
    // saveGameResult의 완화 조건을 충족한다. 설계가 노린 동작이다.
    const blue = await linkedMember("blue");
    const half = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1", mmr: 1000 } });

    const result = await saveReplayImport(prisma, {
      replayKey: "key-9",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-half", "RED", half.id)],
    });

    expect(result.updates).toHaveLength(2);
  });

  it("leaves nothing behind when the game save fails", async () => {
    // 계정만 등록되고 경기는 없는 상태가 되면 다음 업로드가 조용히 어긋난다.
    // 존재 확인이 쓰기보다 먼저 걸리므로 이 테스트는 에러 메시지만 증명한다 — 롤백은
    // 아래 "rolls back a riot account..." 테스트가 증명한다.
    const blue = await linkedMember("blue");

    await expect(
      saveReplayImport(prisma, {
        replayKey: "key-10",
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments: [
          assignment("p-blue", "BLUE", blue.id),
          assignment("p-ghost", "RED", "00000000-0000-0000-0000-000000000000"),
        ],
      }),
    ).rejects.toThrow(/do not exist/);

    expect(await prisma.riotAccount.count()).toBe(0);
    expect(await prisma.gameResult.count()).toBe(0);
  });

  it("rolls back a riot account that was already written when the game save fails", async () => {
    // 존재 확인을 통과한 뒤에 실패하는 유일한 경로다. 유령 id 테스트는 쓰기 전에 막히므로
    // 롤백을 증명하지 못한다 — 트랜잭션이 없어도 통과한다.
    const blue = await linkedMember("blue");
    const survivor = await linkedMember("survivor");
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "배성민/97/성민탑#KR1", mergedIntoId: survivor.id },
    });

    await expect(
      saveReplayImport(prisma, {
        replayKey: "key-11",
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-tomb", "RED", tombstone.id)],
      }),
    ).rejects.toThrow(/absorbed into another member/);

    expect(await prisma.riotAccount.count()).toBe(0);
    expect(await prisma.gameResult.count()).toBe(0);
  });

  it("clears the absorb marker only when the admin changed an account's owner", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const formerOwner = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    // 주인이 바뀌는 계정과 그대로인 계정을 한 번에 저장해 두 갈래를 같이 본다.
    for (const [puuid, memberId] of [["p-blue", blue.id], ["p-red", blue.id]] as const) {
      await prisma.riotAccount.create({
        data: {
          memberId,
          absorbedFromId: formerOwner.id,
          puuid,
          gameName: "옛날닉",
          tagLine: "KR9",
          lastSeenAt: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }

    await saveReplayImport(prisma, {
      replayKey: "key-12",
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      // p-blue는 red에게 넘어가고(주인 변경), p-red는 blue 그대로다(주인 유지).
      assignments: [assignment("p-blue", "BLUE", red.id), assignment("p-red", "RED", blue.id)],
    });

    const reassigned = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-blue" } });
    expect(reassigned.memberId).toBe(red.id);
    expect(reassigned.absorbedFromId).toBeNull();

    const unchanged = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-red" } });
    expect(unchanged.memberId).toBe(blue.id);
    expect(unchanged.absorbedFromId).toBe(formerOwner.id);
  });

  // 취소해도 GameResult.replayKey의 유니크 제약이 남아 있으면 같은 파일을 다시 올릴 수
  // 없다 — 리플레이를 취소하는 가장 흔한 이유(매칭을 잘못 지정)의 복구 경로가 막힌다.
  it("clears replayKey on cancellation so the same replay can be re-imported", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const bytes = buildRoflFixture(tenPlayers());
    const { replayKey } = await prepareReplayImport(prisma, bytes);

    const saved = await saveReplayImport(prisma, {
      replayKey,
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("puuid-0", "BLUE", blue.id), assignment("puuid-5", "RED", red.id)],
    });

    await cancelGameResult(prisma, saved.gameResultId, null);

    const cancelled = await prisma.gameResult.findUniqueOrThrow({ where: { id: saved.gameResultId } });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.replayKey).toBeNull();

    // 유니크 제약이 더는 막지 않으므로 같은 바이트를 다시 올릴 수 있다.
    const reprepared = await prepareReplayImport(prisma, bytes);
    expect(reprepared.replayKey).toBe(replayKey);
  });
});
