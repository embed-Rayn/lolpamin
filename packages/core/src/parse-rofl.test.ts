import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRoflMetadata, ROFL_PARSE_ERRORS } from "./parse-rofl";

/** 합성 .rofl을 만든다. 앞쪽 청크 본문은 파서가 열지 않으므로 0으로 채운다. */
function buildRofl(metadata: unknown, options: { magic?: Buffer; version?: string } = {}): Uint8Array {
  const version = options.version ?? "16.17.810.4348";
  const head = Buffer.alloc(0x0f + version.length);
  (options.magic ?? Buffer.from([0x52, 0x49, 0x4f, 0x54, 0x02, 0x00])).copy(head, 0);
  head[0x0e] = version.length;
  head.write(version, 0x0f, "utf8");

  const body = Buffer.alloc(64); // 열지 않는 압축 청크 자리
  const json = Buffer.from(JSON.stringify(metadata), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  return new Uint8Array(Buffer.concat([head, body, json, length]));
}

function player(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    PUUID: "00000000-0000-0000-0000-000000000001",
    NAME: "",
    RIOT_ID_GAME_NAME: "ZAMSU",
    RIOT_ID_TAG_LINE: "KR1",
    TEAM: "100",
    WIN: "Fail",
    TEAM_POSITION: "TOP",
    SKIN: "Yone",
    CHAMPIONS_KILLED: "1",
    NUM_DEATHS: "14",
    ASSISTS: "0",
    LEVEL: "13",
    MINIONS_KILLED: "142",
    NEUTRAL_MINIONS_KILLED: "3",
    WAS_AFK: "0",
    WAS_LEAVER: "0",
    TIME_SPENT_DISCONNECTED: "0",
    GAME_ENDED_IN_SURRENDER: "0",
    ...overrides,
  };
}

function buildTenPlayerRofl(overrides: Array<Record<string, string>> = []): Uint8Array {
  const players = Array.from({ length: 10 }, (_, i) =>
    player({
      PUUID: `00000000-0000-0000-0000-00000000000${i}`,
      TEAM: i < 5 ? "100" : "200",
      WIN: i < 5 ? "Fail" : "Win",
      ...(overrides[i] ?? {}),
    }),
  );
  return buildRofl({ gameLength: 1584502, lastGameChunkId: 1, lastKeyFrameId: 1, statsJson: JSON.stringify(players) });
}

describe("parseRoflMetadata", () => {
  it("reads the version, length, winner and ten players from the tail JSON", () => {
    const meta = parseRoflMetadata(buildTenPlayerRofl());

    expect(meta.gameVersion).toBe("16.17.810.4348");
    expect(meta.gameLengthMs).toBe(1584502);
    expect(meta.winner).toBe("RED");
    expect(meta.endedInSurrender).toBe(false);
    expect(meta.players).toHaveLength(10);
  });

  it("maps a player's strings onto typed fields", () => {
    const [first] = parseRoflMetadata(buildTenPlayerRofl()).players;

    expect(first).toMatchObject({
      puuid: "00000000-0000-0000-0000-000000000000",
      gameName: "ZAMSU",
      tagLine: "KR1",
      team: "BLUE",
      win: false,
      position: "TOP",
      champion: "Yone",
      kills: 1,
      deaths: 14,
      assists: 0,
      level: 13,
      wasAfk: false,
      wasLeaver: false,
      secondsDisconnected: 0,
    });
    // cs는 미니언과 정글 몹의 합이다 — 화면에서 사람을 알아보는 단서라 따로 두지 않는다.
    expect(first.cs).toBe(145);
  });

  it("flags afk, leaver and surrender", () => {
    const meta = parseRoflMetadata(
      buildTenPlayerRofl([
        { WAS_AFK: "1", WAS_LEAVER: "1", TIME_SPENT_DISCONNECTED: "92", GAME_ENDED_IN_SURRENDER: "1" },
      ]),
    );

    expect(meta.endedInSurrender).toBe(true);
    expect(meta.players[0]).toMatchObject({ wasAfk: true, wasLeaver: true, secondsDisconnected: 92 });
  });

  it("rejects a file that is not a ROFL2 replay", () => {
    const notARofl = buildRofl({ statsJson: "[]" }, { magic: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) });

    expect(() => parseRoflMetadata(notARofl)).toThrow(ROFL_PARSE_ERRORS.notARofl);
  });

  it("rejects a truncated file whose declared metadata length does not fit", () => {
    const truncated = buildTenPlayerRofl().slice(0, 40);

    expect(() => parseRoflMetadata(truncated)).toThrow(ROFL_PARSE_ERRORS.brokenMetadata);
  });

  it("rejects metadata whose statsJson is not parseable", () => {
    const broken = buildRofl({ gameLength: 1, statsJson: "{not json" });

    expect(() => parseRoflMetadata(broken)).toThrow(ROFL_PARSE_ERRORS.brokenMetadata);
  });

  it("rejects a replay that is not a ten player game", () => {
    const players = [player(), player({ PUUID: "b", TEAM: "200", WIN: "Win" })];
    const twoPlayers = buildRofl({ gameLength: 1, statsJson: JSON.stringify(players) });

    expect(() => parseRoflMetadata(twoPlayers)).toThrow(ROFL_PARSE_ERRORS.unexpectedPlayerCount);
  });

  it("reads spells, runes, items, damage, wards, gold and objectives", () => {
    const [first] = parseRoflMetadata(
      buildTenPlayerRofl([
        {
          SUMMONER_SPELL_1: "14",
          SUMMONER_SPELL_2: "4",
          KEYSTONE_ID: "8008",
          PERK_SUB_STYLE: "8400",
          ITEM0: "3047",
          ITEM1: "3076",
          ITEM2: "0",
          ITEM3: "3078",
          ITEM4: "3153",
          ITEM5: "1031",
          ITEM6: "3363",
          TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: "19147",
          TOTAL_DAMAGE_TAKEN: "40584",
          VISION_WARDS_BOUGHT_IN_GAME: "2",
          WARD_PLACED: "8",
          WARD_KILLED: "3",
          GOLD_EARNED: "10026",
          BARON_KILLS: "1",
          DRAGON_KILLS: "2",
          RIFT_HERALD_KILLS: "1",
          HORDE_KILLS: "3",
          ATAKHAN_KILLS: "1",
          TURRETS_KILLED: "4",
          BARRACKS_KILLED: "1",
        },
      ]),
    ).players;

    expect(first).toMatchObject({
      spell1: 14,
      spell2: 4,
      keystone: 8008,
      subStyle: 8400,
      items: [3047, 3076, 0, 3078, 3153, 1031, 3363],
      damageDealt: 19147,
      damageTaken: 40584,
      controlWards: 2,
      wardsPlaced: 8,
      wardsKilled: 3,
      gold: 10026,
      baronKills: 1,
      dragonKills: 2,
      heraldKills: 1,
      hordeKills: 3,
      atakhanKills: 1,
      turretKills: 4,
      inhibitorKills: 1,
    });
  });

  it("reads a missing stat key as 0 and a missing item slot as an empty slot", () => {
    // The default fixture carries none of the new keys — a patch that drops one must not block the import.
    const [first] = parseRoflMetadata(buildTenPlayerRofl()).players;

    expect(first.items).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(first.spell1).toBe(0);
    expect(first.damageDealt).toBe(0);
    expect(first.turretKills).toBe(0);
  });
});

// 실제 리플레이. data/는 gitignore이므로 파일이 있을 때만 돈다 — 합성 픽스처가 실제
// 레이아웃과 어긋나는 것을 잡아 주는 유일한 테스트라, 있으면 반드시 돌려야 한다.
const realReplay = fileURLToPath(new URL("../../../data/KR-8374660628.rofl", import.meta.url));

describe.runIf(existsSync(realReplay))("parseRoflMetadata on the real replay", () => {
  it("reads KR-8374660628.rofl", () => {
    const meta = parseRoflMetadata(new Uint8Array(readFileSync(realReplay)));

    expect(meta.gameVersion).toBe("16.17.810.4348");
    expect(meta.gameLengthMs).toBe(1584502);
    expect(meta.winner).toBe("RED");
    expect(meta.players).toHaveLength(10);
    expect(meta.players.map((p) => `${p.gameName}#${p.tagLine}`)).toContain("모든 것을 잃은 사나이#융탄폭격");
    expect(meta.players.filter((p) => p.team === "BLUE")).toHaveLength(5);
    expect(meta.players.every((p) => p.puuid.length > 0)).toBe(true);
  });
});
