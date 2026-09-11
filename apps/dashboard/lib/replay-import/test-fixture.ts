/** 합성 .rofl 바이트. packages/core/src/parse-rofl.test.ts의 빌더와 같은 레이아웃이다. */
export interface FixturePlayer {
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  position?: string;
}

export function buildRoflFixture(players: FixturePlayer[], gameLength = 1584502): Uint8Array {
  const version = "16.17.810.4348";
  const head = Buffer.alloc(0x0f + version.length);
  Buffer.from([0x52, 0x49, 0x4f, 0x54, 0x02, 0x00]).copy(head, 0);
  head[0x0e] = version.length;
  head.write(version, 0x0f, "utf8");

  const stats = players.map((p, i) => ({
    PUUID: p.puuid,
    NAME: "",
    RIOT_ID_GAME_NAME: p.gameName,
    RIOT_ID_TAG_LINE: p.tagLine,
    TEAM: p.team === "RED" ? "200" : "100",
    WIN: p.team === "RED" ? "Win" : "Fail",
    TEAM_POSITION: p.position ?? ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
    SKIN: "Yone",
    CHAMPIONS_KILLED: "1",
    NUM_DEATHS: "2",
    ASSISTS: "3",
    LEVEL: "15",
    MINIONS_KILLED: "140",
    NEUTRAL_MINIONS_KILLED: "5",
    WAS_AFK: "0",
    WAS_LEAVER: "0",
    TIME_SPENT_DISCONNECTED: "0",
    GAME_ENDED_IN_SURRENDER: "0",
  }));

  const json = Buffer.from(JSON.stringify({ gameLength, statsJson: JSON.stringify(stats) }), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  return new Uint8Array(Buffer.concat([head, Buffer.alloc(64), json, length]));
}

/** 10명을 채운 기본 판. 앞 다섯이 BLUE(패), 뒤 다섯이 RED(승)다. */
export function tenPlayers(overrides: Array<Partial<FixturePlayer>> = []): FixturePlayer[] {
  return Array.from({ length: 10 }, (_, i) => ({
    puuid: `puuid-${i}`,
    gameName: `player${i}`,
    tagLine: "KR1",
    team: i < 5 ? ("BLUE" as const) : ("RED" as const),
    ...(overrides[i] ?? {}),
  }));
}
