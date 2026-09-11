# .rofl 리플레이 임포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `.rofl` 리플레이 파일을 올리면 참가자 10명을 회원에 매칭해 내전 결과를 자동으로 입력한다.

**Architecture:** 파일 맨 뒤의 평문 JSON만 읽는 순수 파서(`packages/core`)와 카톡·디코 닉네임에 적힌 Riot ID를 힌트로 쓰는 채점 함수를 만든다. PUUID를 유일 키로 하는 `RiotAccount` 테이블이 한 번 확정한 계정을 기억하므로 두 번째 업로드부터는 매칭이 자동으로 끝난다. 저장은 기존 `saveGameResult`의 MMR 경로를 그대로 재사용하되, 같은 트랜잭션 안에서 부를 수 있게 내부 함수로 한 겹 벗겨 쓴다.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Actions), Prisma 5 + Postgres 16, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-10-rofl-replay-import-design.md`

## Global Constraints

- UI 문구·에러 메시지·리포트 라벨은 한국어. 코드·식별자·주석·커밋 메시지는 영어. 단, 이 저장소의 도메인 주석은 한국어로 쓰인 곳이 많으므로 **수정하는 파일의 기존 주석 언어를 따른다**.
- 도메인 로직은 `packages/core`에 순수 함수 + 단위 테스트. I/O 금지. DB를 만지는 로직은 `apps/dashboard/lib/{queries,mutations}/`에 두고 첫 인자로 `prisma`를 받는다.
- 여러 행을 쓰는 작업은 `prisma.$transaction` 안에서.
- DB를 만지는 테스트 파일은 **반드시** 맨 위에 `DATABASE_URL_TEST` 가드를 둔다. 없으면 Prisma가 조용히 `DATABASE_URL`로 떨어져 `resetDatabase()`가 개발 데이터를 지운다.
- `apps/dashboard/vitest.config.ts`의 `fileParallelism: false`를 되돌리지 않는다.
- DB를 읽는 페이지는 `export const dynamic = "force-dynamic"`를 선언한다. `AppShell`이 자체적으로 Postgres를 읽으므로 `AppShell`을 쓰는 모든 페이지에 해당한다.
- `packages/core`는 `@lolpamin/db`에서 **타입만** 가져올 수 있다(`import type`). 런타임 의존은 금지.
- `packages/core`는 클라이언트 번들에도 들어간다(`transpilePackages`). `node:crypto` 같은 Node 전용 모듈을 `packages/core`에 넣지 않는다.
- Next 서버 액션 바디 상한은 이미 `apps/dashboard/next.config.js`에 `bodySizeLimit: "20mb"`로 설정돼 있다. 13.8MB 리플레이 업로드는 그대로 통과한다. 이 값을 낮추지 않는다.
- 실측 파일 `data/KR-8374660628.rofl`은 gitignore 대상이다. 이 파일을 쓰는 테스트는 **파일이 있을 때만 도는 조건부**로 둔다.

## 실측으로 확정된 파일 레이아웃

`data/KR-8374660628.rofl`(13,814,759바이트)에서 직접 확인한 값이다. 구현 중 의심되면 이 표를 기준으로 삼는다.

| 위치 | 값 |
|---|---|
| `0x00`–`0x05` | `52 49 4F 54 02 00` (`RIOT` + `02 00`) |
| `0x0E` | `14` — 버전 문자열 길이(u8) |
| `0x0F`–`0x1C` | `16.17.810.4348` |
| 끝 − 4 | `122835` (u32 LE) — 꼬리 JSON 길이 |
| 끝 − 4 − 122835 | 평문 JSON 시작 |

꼬리 JSON 최상위 키: `gameLength`(숫자, ms), `lastGameChunkId`, `lastKeyFrameId`, `statsJson`(문자열). `statsJson`을 한 번 더 `JSON.parse`하면 참가자 10개 배열이 나오고, **참가자의 모든 값은 문자열**이다(`TEAM: "100"`, `CHAMPIONS_KILLED: "1"`). `NAME`은 빈 문자열이다.

실측 참가자 명단(테스트 픽스처의 근거):

| TEAM | WIN | TEAM_POSITION | RIOT_ID |
|---|---|---|---|
| 100 | Fail | TOP | `ZAMSU#KR1` |
| 100 | Fail | JUNGLE | `Pink Taric Boy#KR2` |
| 100 | Fail | MIDDLE | `먀미뮤드래곤#7777` |
| 100 | Fail | BOTTOM | `챌린저가고싶나#JBD` |
| 100 | Fail | UTILITY | `정민이#KR12` |
| 200 | Win | TOP | `박병준#0216` |
| 200 | Win | JUNGLE | `도여어어닝#KR1` |
| 200 | Win | MIDDLE | `람스터#람스터` |
| 200 | Win | BOTTOM | `어 나 진찬양#KR1` |
| 200 | Win | UTILITY | `모든 것을 잃은 사나이#융탄폭격` |

---

### Task 1: `parseRoflMetadata` — 리플레이 꼬리 JSON 파서

**Files:**
- Create: `packages/core/src/parse-rofl.ts`
- Create: `packages/core/src/parse-rofl.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces:
  - `parseRoflMetadata(bytes: Uint8Array): ReplayMetadata`
  - `interface ReplayMetadata { gameVersion: string; gameLengthMs: number; winner: "BLUE" | "RED"; endedInSurrender: boolean; players: ReplayPlayer[] }`
  - `interface ReplayPlayer { puuid: string; gameName: string; tagLine: string; team: "BLUE" | "RED"; win: boolean; position: string; champion: string; kills: number; deaths: number; assists: number; level: number; cs: number; wasAfk: boolean; wasLeaver: boolean; secondsDisconnected: number }`
  - `const ROFL_PARSE_ERRORS: { notARofl: string; brokenMetadata: string; unexpectedPlayerCount: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/core/src/parse-rofl.test.ts`:

```ts
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
```

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd packages/core && npx vitest run src/parse-rofl.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-rofl"`

- [ ] **Step 3: 파서를 구현한다**

`packages/core/src/parse-rofl.ts`:

```ts
export interface ReplayPlayer {
  /** 계정 정체성. 인게임 닉을 바꿔도 변하지 않는다. */
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  win: boolean;
  /** TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY. 특수한 판에서는 빈 문자열일 수 있다. */
  position: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  level: number;
  cs: number;
  wasAfk: boolean;
  wasLeaver: boolean;
  secondsDisconnected: number;
}

export interface ReplayMetadata {
  gameVersion: string;
  gameLengthMs: number;
  winner: "BLUE" | "RED";
  endedInSurrender: boolean;
  players: ReplayPlayer[];
}

// 관리자 화면에 그대로 보여주는 문구다. JSON.parse의 영어 예외를 노출하지 않는다.
export const ROFL_PARSE_ERRORS = {
  notARofl: "리플레이 파일(.rofl)이 아닙니다.",
  brokenMetadata: "리플레이의 경기 정보를 읽을 수 없습니다. 파일이 손상됐을 수 있습니다.",
  unexpectedPlayerCount: "10명이 참가한 경기가 아닙니다.",
} as const;

const MAGIC = [0x52, 0x49, 0x4f, 0x54, 0x02, 0x00]; // "RIOT" + 02 00
const VERSION_LENGTH_OFFSET = 0x0e;
const PLAYER_COUNT = 10;

function toInt(value: unknown): number {
  // 참가자 값은 전부 문자열로 온다("14"). 빠진 키는 0으로 본다 — 화면 표시용 숫자라
  // 여기서 던지면 패치가 키 하나를 지웠을 때 임포트가 통째로 막힌다.
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: unknown): boolean {
  return String(value ?? "") === "1";
}

/**
 * .rofl에서 꼬리의 평문 JSON만 읽는다. 앞쪽 zstd 청크는 열지 않으므로 압축 의존성도,
 * 패치 종속성도 생기지 않는다 — 필요한 값(참가자·팀·승패·길이)이 전부 꼬리에 있다.
 *
 * 파일 I/O는 호출자가 한다. packages/core의 "I/O 없음" 규칙을 지키려는 것이다.
 */
export function parseRoflMetadata(bytes: Uint8Array): ReplayMetadata {
  if (bytes.length < 0x20 || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new Error(ROFL_PARSE_ERRORS.notARofl);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const versionLength = bytes[VERSION_LENGTH_OFFSET];
  const versionStart = VERSION_LENGTH_OFFSET + 1;
  const gameVersion = new TextDecoder().decode(bytes.subarray(versionStart, versionStart + versionLength));

  // 마지막 4바이트가 꼬리 JSON의 길이(u32 LE)다. 파일명에도, 헤더에도 의존하지 않는다.
  const metadataLength = view.getUint32(bytes.length - 4, true);
  const metadataStart = bytes.length - 4 - metadataLength;
  if (metadataStart < versionStart + versionLength) {
    throw new Error(ROFL_PARSE_ERRORS.brokenMetadata);
  }

  let root: { gameLength?: unknown; statsJson?: unknown };
  let rawPlayers: Array<Record<string, unknown>>;
  try {
    root = JSON.parse(new TextDecoder().decode(bytes.subarray(metadataStart, bytes.length - 4)));
    // statsJson은 문자열로 한 번 더 감싸여 있다. 두 번 파싱해야 참가자 배열이 나온다.
    rawPlayers = JSON.parse(String(root.statsJson ?? ""));
  } catch {
    throw new Error(ROFL_PARSE_ERRORS.brokenMetadata);
  }

  if (!Array.isArray(rawPlayers) || rawPlayers.length !== PLAYER_COUNT) {
    throw new Error(ROFL_PARSE_ERRORS.unexpectedPlayerCount);
  }

  const players: ReplayPlayer[] = rawPlayers.map((raw) => ({
    puuid: String(raw.PUUID ?? ""),
    gameName: String(raw.RIOT_ID_GAME_NAME ?? ""),
    tagLine: String(raw.RIOT_ID_TAG_LINE ?? ""),
    team: String(raw.TEAM) === "200" ? "RED" : "BLUE",
    win: String(raw.WIN) === "Win",
    position: String(raw.TEAM_POSITION ?? ""),
    champion: String(raw.SKIN ?? ""),
    kills: toInt(raw.CHAMPIONS_KILLED),
    deaths: toInt(raw.NUM_DEATHS),
    assists: toInt(raw.ASSISTS),
    level: toInt(raw.LEVEL),
    cs: toInt(raw.MINIONS_KILLED) + toInt(raw.NEUTRAL_MINIONS_KILLED),
    wasAfk: toBool(raw.WAS_AFK),
    wasLeaver: toBool(raw.WAS_LEAVER),
    secondsDisconnected: toInt(raw.TIME_SPENT_DISCONNECTED),
  }));

  const winner = players.some((p) => p.team === "BLUE" && p.win) ? "BLUE" : "RED";

  return {
    gameVersion,
    gameLengthMs: toInt(root.gameLength),
    winner,
    // 항복 여부는 참가자마다 같은 값으로 들어 있다.
    endedInSurrender: toBool(rawPlayers[0].GAME_ENDED_IN_SURRENDER),
    players,
  };
}
```

- [ ] **Step 4: index에서 내보낸다**

`packages/core/src/index.ts` 끝에 한 줄 추가:

```ts
export * from "./parse-rofl";
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd packages/core && npx vitest run src/parse-rofl.test.ts`
Expected: PASS — 실파일 테스트를 포함해 8 passed (`data/`에 파일이 없으면 7 passed · 1 skipped)

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/parse-rofl.ts packages/core/src/parse-rofl.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse the tail metadata of a .rofl replay"
```

---

### Task 2: Riot ID 힌트 추출 (`kakaoRiotHint`, `discordRiotHint`)

카톡·디코 닉네임에 사람이 손으로 적어 둔 Riot ID를 꺼낸다. 이 값은 **계정이 아니라 힌트**다 — 오타·태그 누락이 흔해서 `RiotAccount` 행을 만드는 근거로는 절대 쓰지 않는다.

**Files:**
- Create: `packages/core/src/riot-hint.ts`
- Create: `packages/core/src/riot-hint.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `normalizeKakaoNickname` (`packages/core/src/normalize-kakao-nickname.ts`)
- Produces:
  - `kakaoRiotHint(rawNickname: string): string | null`
  - `discordRiotHint(displayName: string): { riotId: string | null; positions: string[] }`
  - `REPLAY_POSITIONS: readonly ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/core/src/riot-hint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { discordRiotHint, kakaoRiotHint } from "./riot-hint";

describe("kakaoRiotHint", () => {
  it("takes the third segment of 실명/출생연도/게임닉#태그", () => {
    expect(kakaoRiotHint("김민준/01/정민이#KR12")).toBe("정민이#KR12");
  });

  it("drops a trailing parenthesised memo before taking the segment", () => {
    expect(kakaoRiotHint("박병준/94/늑구#KR1 (5시)")).toBe("늑구#KR1");
  });

  it("reads the spaced variant 실명 출생연도/게임닉#태그", () => {
    expect(kakaoRiotHint("선동엽 95/glenone#5022")).toBe("glenone#5022");
  });

  it("keeps extra segments out of the hint", () => {
    expect(kakaoRiotHint("배성민/97/성민탑#KR1/정글")).toBe("성민탑#KR1");
  });

  it("returns null when the second segment is not a year", () => {
    // 관례를 안 지킨 닉네임이다. 억지로 뽑으면 실명이나 포지션 글자가 게임닉과 대조되어
    // 엉뚱한 점수가 붙는다.
    expect(kakaoRiotHint("올빼미/정글/탑")).toBeNull();
  });

  it("returns null when there is nothing to split", () => {
    expect(kakaoRiotHint("올빼미")).toBeNull();
  });
});

describe("discordRiotHint", () => {
  it("takes the second segment as the riot id", () => {
    expect(discordRiotHint("김우성/우성정글#KR1/정글").riotId).toBe("우성정글#KR1");
  });

  it("maps the korean position words onto replay positions", () => {
    expect(discordRiotHint("김우성/우성정글#KR1/정글").positions).toEqual(["JUNGLE"]);
    expect(discordRiotHint("박병준/늑구#KR1/탑,미드").positions).toEqual(["TOP", "MIDDLE"]);
    expect(discordRiotHint("이수민/수민#KR1/원딜 서폿").positions).toEqual(["BOTTOM", "UTILITY"]);
  });

  it("treats 올포지션 as every position", () => {
    expect(discordRiotHint("김민준/민준#KR1/올").positions).toEqual([
      "TOP",
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
    ]);
  });

  it("returns no hint when the display name has no segments", () => {
    expect(discordRiotHint("dohyun_kr")).toEqual({ riotId: null, positions: [] });
  });

  it("ignores a position segment it does not recognise", () => {
    expect(discordRiotHint("김민준/민준#KR1/아무거나").positions).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd packages/core && npx vitest run src/riot-hint.test.ts`
Expected: FAIL — `Failed to resolve import "./riot-hint"`

- [ ] **Step 3: 구현한다**

`packages/core/src/riot-hint.ts`:

```ts
import { normalizeKakaoNickname } from "./normalize-kakao-nickname";

/** 리플레이의 TEAM_POSITION 표기. 디코 닉네임의 한글 포지션을 여기로 옮긴다. */
export const REPLAY_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

// 한글 표기는 사람마다 다르다. 접두어로 잡아 "정글"과 "정글러", "서폿"과 "서포터"를 함께
// 받는다. 긴 접두어가 먼저 와야 "서폿터"가 "서폿"에 먼저 걸린다.
const POSITION_PREFIXES: Array<[string, (typeof REPLAY_POSITIONS)[number]]> = [
  ["탑", "TOP"],
  ["top", "TOP"],
  ["정글", "JUNGLE"],
  ["jungle", "JUNGLE"],
  ["jg", "JUNGLE"],
  ["정", "JUNGLE"],
  ["미드", "MIDDLE"],
  ["mid", "MIDDLE"],
  ["원딜", "BOTTOM"],
  ["바텀", "BOTTOM"],
  ["adc", "BOTTOM"],
  ["bot", "BOTTOM"],
  ["서포터", "UTILITY"],
  ["서폿", "UTILITY"],
  ["sup", "UTILITY"],
  ["util", "UTILITY"],
];

const ALL_POSITION_WORDS = ["올", "올포지션", "전체", "all"];

/**
 * 카톡 닉네임 "실명/출생연도/게임닉#태그"의 세 번째 조각. 나이 자리가 숫자일 때만 관례로
 * 인정한다 — kakaoMatchKey와 같은 판정이라 두 함수가 같은 닉네임을 같게 본다.
 *
 * 반환값은 사람이 손으로 적은 문자열이라 오타가 섞여 있을 수 있다. 매칭 힌트로만 쓰고
 * RiotAccount 행을 만드는 근거로는 쓰지 않는다.
 */
export function kakaoRiotHint(rawNickname: string): string | null {
  const nickname = normalizeKakaoNickname(rawNickname);
  const parts = nickname.split("/").map((p) => p.trim());

  if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
    return parts[2].length > 0 ? parts[2] : null;
  }

  // "선동엽 95/glenone#5022" — 이름과 연도 사이가 공백이다. kakaoMatchKey와 같은 조건
  // (두 자리이거나 19xx·20xx)으로 연도를 인정한다.
  if (parts.length >= 2 && /^(.+?)\s+(\d{2}|19\d{2}|20\d{2})$/.test(parts[0])) {
    return parts[1].length > 0 ? parts[1] : null;
  }

  return null;
}

function toPosition(word: string): (typeof REPLAY_POSITIONS)[number] | "ALL" | null {
  const token = word.trim().toLowerCase();
  if (token.length === 0) return null;
  if (ALL_POSITION_WORDS.includes(token)) return "ALL";
  for (const [prefix, position] of POSITION_PREFIXES) {
    if (token.startsWith(prefix)) return position;
  }
  return null;
}

/**
 * 디코 서버 별명 "실명/게임닉#태그/가능포지션"에서 두 번째·세 번째 조각을 꺼낸다.
 * 포지션은 리플레이 표기로 옮겨 담는다. 조각이 없으면 빈 결과다 — 핸들만 쓰는 사람이 흔하다.
 */
export function discordRiotHint(displayName: string): { riotId: string | null; positions: string[] } {
  const parts = displayName.split("/").map((p) => p.trim());
  const riotId = parts.length >= 2 && parts[1].length > 0 ? parts[1] : null;

  const positions: string[] = [];
  if (parts.length >= 3) {
    // "탑,미드", "원딜 서폿", "탑·정글" 전부 받는다.
    for (const word of parts[2].split(/[,·\s]+/)) {
      const position = toPosition(word);
      if (position === "ALL") return { riotId, positions: [...REPLAY_POSITIONS] };
      if (position && !positions.includes(position)) positions.push(position);
    }
  }

  return { riotId, positions };
}
```

- [ ] **Step 4: index에서 내보낸다**

`packages/core/src/index.ts` 끝에 한 줄 추가:

```ts
export * from "./riot-hint";
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd packages/core && npx vitest run src/riot-hint.test.ts`
Expected: PASS — 11 passed

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/riot-hint.ts packages/core/src/riot-hint.test.ts packages/core/src/index.ts
git commit -m "feat(core): pull riot id and position hints out of kakao and discord nicknames"
```

---

### Task 3: `scoreRiotAccountMatch` — 리플레이 참가자와 회원의 채점

**Files:**
- Create: `packages/core/src/score-riot-account-match.ts`
- Create: `packages/core/src/score-riot-account-match.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`(`kakao-match-key.ts`), `normalizeKakaoNickname`·`realNameFromKakaoNickname`(`normalize-kakao-nickname.ts`), `kakaoRiotHint`·`discordRiotHint`(Task 2), `AccountMatchScore`(`score-account-match.ts`)
- Produces:
  - `interface RiotMatchPlayer { gameName: string; tagLine: string; position: string }`
  - `interface RiotMatchMember { realName: string | null; kakaoNickname: string | null; discordDisplayName: string | null; riotId: string | null }`
  - `scoreRiotAccountMatch(player: RiotMatchPlayer, member: RiotMatchMember): AccountMatchScore`
  - `isAutoAssignable(topScore: number, secondScore: number): boolean`
  - `AUTO_ASSIGN_SCORE = 100`, `AUTO_ASSIGN_GAP = 40`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

설계 문서의 실측 표 7개 케이스를 그대로 옮긴 것이다. 점수를 바꾸려면 이 테스트부터 고쳐야 한다.

`packages/core/src/score-riot-account-match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAutoAssignable, scoreRiotAccountMatch, type RiotMatchMember } from "./score-riot-account-match";

function member(overrides: Partial<RiotMatchMember> = {}): RiotMatchMember {
  return { realName: null, kakaoNickname: null, discordDisplayName: null, riotId: null, ...overrides };
}

describe("scoreRiotAccountMatch", () => {
  it("gives 100 when the kakao hint is exactly the riot id", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "챌린저가고싶나", tagLine: "JBD", position: "BOTTOM" },
      member({ realName: "이도현", kakaoNickname: "이도현/98/챌린저가고싶나#JBD", discordDisplayName: "이도현" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["카톡ID일치"] });
  });

  it("gives 100 when only spacing and case differ", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "Pink Taric Boy", tagLine: "KR2", position: "JUNGLE" },
      member({ realName: "김태릭", kakaoNickname: "김태릭/99/PinkTaricBoy", discordDisplayName: "김태릭" }),
    );

    expect(result.score).toBe(100);
  });

  it("separates two 동명이인 by their riot id", () => {
    const player = { gameName: "정민이", tagLine: "KR12", position: "UTILITY" };
    const younger = member({ realName: "김민준", kakaoNickname: "김민준/01/정민이#KR12", discordDisplayName: "김민준" });
    const older = member({ realName: "김민준", kakaoNickname: "김민준/95/민준탑#KR1", discordDisplayName: "김민준" });

    expect(scoreRiotAccountMatch(player, younger).score).toBe(100);
    expect(scoreRiotAccountMatch(player, older).score).toBe(0);
  });

  it("falls back to the real name fragment and the position when the in-game name changed", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "우성정글", tagLine: "KR1", position: "JUNGLE" },
      member({
        realName: "김우성",
        kakaoNickname: "김우성/96/정글의왕#KR1",
        discordDisplayName: "김우성/정글의왕#KR1/정글",
      }),
    );

    // 45(실명조각) + 25(포지션일치). 자동 배정 문턱 아래라 관리자가 확인해야 한다.
    expect(result).toEqual({ score: 70, reasons: ["실명조각", "포지션일치"] });
  });

  it("scores a brand new smurf at zero even when the position lines up", () => {
    // 포지션은 가산점 전용이다. 다른 신호가 0이면 후보로 만들지 않는다 — 그러지 않으면
    // UTILITY 슬롯 하나에 서폿 회원이 전부 같은 점수로 딸려 나온다.
    const result = scoreRiotAccountMatch(
      { gameName: "ZAMSU", tagLine: "KR1", position: "TOP" },
      member({ realName: "배성민", kakaoNickname: "배성민/97/성민탑#KR1", discordDisplayName: "배성민/성민탑#KR1/탑" }),
    );

    expect(result).toEqual({ score: 0, reasons: [] });
  });

  it("scores an outsider at zero", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "모든 것을 잃은 사나이", tagLine: "융탄폭격", position: "UTILITY" },
      member({ realName: "박병준", kakaoNickname: "박병준/94/늑구#KR1", discordDisplayName: "박병준/늑구#KR1/서폿" }),
    );

    expect(result).toEqual({ score: 0, reasons: [] });
  });

  it("counts only the strongest hint, never the sum of three", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "먀미뮤드래곤", tagLine: "7777", position: "MIDDLE" },
      member({ realName: "정수현", kakaoNickname: "정수현/00/먀미뮤드래곤#7777", riotId: "먀미뮤드래곤#7777" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["카톡ID일치"] });
  });

  it("gives 60 when a memo is glued onto the riot id", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "늑구", tagLine: "KR1", position: "TOP" },
      member({ realName: "박병준", kakaoNickname: "박병준/94/늑구#KR1 밥먹고옴" }),
    );

    expect(result).toEqual({ score: 60, reasons: ["카톡ID유사"] });
  });

  it("reads the hint off the registered riot id when there is no kakao nickname", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "도여어어닝", tagLine: "KR1", position: "JUNGLE" },
      member({ realName: "김도영", riotId: "도여어어닝#KR1" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["등록ID일치"] });
  });
});

describe("isAutoAssignable", () => {
  it("needs both an exact-hint score and a clear gap", () => {
    expect(isAutoAssignable(100, 0)).toBe(true);
    expect(isAutoAssignable(125, 85)).toBe(true);
  });

  it("refuses a close second", () => {
    expect(isAutoAssignable(100, 70)).toBe(false);
  });

  it("refuses anything below the exact-hint tier", () => {
    expect(isAutoAssignable(95, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd packages/core && npx vitest run src/score-riot-account-match.test.ts`
Expected: FAIL — `Failed to resolve import "./score-riot-account-match"`

- [ ] **Step 3: 구현한다**

`packages/core/src/score-riot-account-match.ts`:

```ts
import { normalizeForMatch as normalize } from "./kakao-match-key";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "./normalize-kakao-nickname";
import { discordRiotHint, kakaoRiotHint } from "./riot-hint";
import type { AccountMatchScore } from "./score-account-match";

export interface RiotMatchPlayer {
  gameName: string;
  tagLine: string;
  /** 리플레이의 TEAM_POSITION. 특수한 판에서는 빈 문자열이다. */
  position: string;
}

export interface RiotMatchMember {
  realName: string | null;
  kakaoNickname: string | null;
  discordDisplayName: string | null;
  riotId: string | null;
}

const RIOT_ID_MATCH = 100;
const RIOT_ID_SIMILAR = 60;
const REAL_NAME_FRAGMENT = 45;
const POSITION_BONUS = 25;

/** 자동 배정에 필요한 최소 점수. 손으로 적은 Riot ID가 정확히 맞아떨어진 경우에만 나온다. */
export const AUTO_ASSIGN_SCORE = 100;
/** 1위가 2위를 이만큼 벌려야 자동 배정한다. */
export const AUTO_ASSIGN_GAP = 40;

// 짧은 조각은 우연히 겹친다. 힌트도 실명 조각도 이 길이 아래면 신호로 쓰지 않는다.
const MIN_HINT_LENGTH = 3;
const MIN_FRAGMENT_LENGTH = 2;

/**
 * 힌트 한 개의 점수. 비교는 전부 normalizeForMatch를 거치므로 대소문자·공백·`#._-`가
 * 접힌다 — "Pink Taric Boy#KR2"와 "PinkTaricBoy"가 같은 값이 된다.
 */
function hintScore(hint: string | null, full: string, name: string): number {
  if (!hint) return 0;
  const value = normalize(hint);
  if (value.length < MIN_HINT_LENGTH) return 0;

  if (value === full || value === name) return RIOT_ID_MATCH;

  // 닉네임 뒤에 메모를 붙이거나("늑구#KR1 밥먹고옴") 태그를 빠뜨린 표기를 받는다.
  const related = [full, name].some(
    (target) =>
      target.length >= MIN_HINT_LENGTH &&
      (value.startsWith(target) || target.startsWith(value) || value.endsWith(target) || target.endsWith(value)),
  );
  return related ? RIOT_ID_SIMILAR : 0;
}

/** 회원의 실명. 없으면 카톡 닉네임의 첫 조각에서 얻고, "선동엽 95"처럼 붙은 연도는 뗀다. */
function realNameOf(member: RiotMatchMember): string {
  const raw =
    member.realName ??
    (member.kakaoNickname ? realNameFromKakaoNickname(normalizeKakaoNickname(member.kakaoNickname)) : null);
  if (!raw) return "";
  return raw.replace(/\s+(\d{2}|19\d{2}|20\d{2})$/, "").trim();
}

/**
 * 리플레이 참가자 한 명과 회원 한 명이 같은 사람일 가능성을 점수로 낸다.
 *
 * 카톡·디코 닉네임에 적힌 Riot ID와 Member.riotId는 사람이 손으로 적은 값이라 부정확하다.
 * 계정의 출처가 아니라 힌트로만 쓰고, 셋 중 가장 센 신호 하나만 센다 — 같은 사실을 세 번
 * 세면 오타 하나 없는 사람이 실제보다 세 배 유리해진다.
 */
export function scoreRiotAccountMatch(player: RiotMatchPlayer, member: RiotMatchMember): AccountMatchScore {
  const full = normalize(`${player.gameName}#${player.tagLine}`);
  const name = normalize(player.gameName);

  const discord = discordRiotHint(member.discordDisplayName ?? "");
  const hints: Array<[string | null, string, string]> = [
    [member.kakaoNickname ? kakaoRiotHint(member.kakaoNickname) : null, "카톡ID일치", "카톡ID유사"],
    [discord.riotId, "디코ID일치", "디코ID유사"],
    [member.riotId, "등록ID일치", "등록ID유사"],
  ];

  let score = 0;
  const reasons: string[] = [];

  let bestHint = 0;
  let bestReason = "";
  for (const [hint, exactLabel, similarLabel] of hints) {
    const value = hintScore(hint, full, name);
    if (value > bestHint) {
      bestHint = value;
      bestReason = value === RIOT_ID_MATCH ? exactLabel : similarLabel;
    }
  }
  if (bestHint > 0) {
    score += bestHint;
    reasons.push(bestReason);
  }

  // 인게임 닉을 바꿔도 "우성정글"처럼 실명 조각이 남는 일이 많다. 성을 뗀 조각도 본다 —
  // 게임닉에 성까지 넣는 사람은 드물다.
  const realName = normalize(realNameOf(member));
  const fragments = [realName, realName.slice(1)].filter((f) => f.length >= MIN_FRAGMENT_LENGTH);
  if (name.length > 0 && fragments.some((f) => name.includes(f))) {
    score += REAL_NAME_FRAGMENT;
    reasons.push("실명조각");
  }

  // 포지션은 가산점 전용이다. 다른 신호가 0이면 후보로 만들지 않는다.
  if (score > 0 && player.position.length > 0 && discord.positions.includes(player.position)) {
    score += POSITION_BONUS;
    reasons.push("포지션일치");
  }

  return { score, reasons };
}

/**
 * 관리자 확인 없이 자동으로 배정해도 되는지. score-account-match의 isSoleCandidate와
 * 같은 사고방식이지만 문턱이 다르다 — 이쪽은 "손으로 적은 Riot ID가 정확히 맞았다"를
 * 최소 조건으로 요구한다.
 */
export function isAutoAssignable(topScore: number, secondScore: number): boolean {
  return topScore >= AUTO_ASSIGN_SCORE && topScore - secondScore >= AUTO_ASSIGN_GAP;
}
```

- [ ] **Step 4: index에서 내보낸다**

`packages/core/src/index.ts` 끝에 한 줄 추가:

```ts
export * from "./score-riot-account-match";
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd packages/core && npx vitest run`
Expected: PASS — 기존 단위 테스트를 포함해 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/score-riot-account-match.ts packages/core/src/score-riot-account-match.test.ts packages/core/src/index.ts
git commit -m "feat(core): score a replay participant against a member"
```

---

### Task 4: 스키마 — `RiotAccount`, `GameResult.replayKey`, 흡수 이관 표식

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_riot_account_and_replay_import/migration.sql` (prisma가 생성)
- Modify: `packages/db/src/test-utils.ts`

**Interfaces:**
- Consumes: 없음
- Produces: Prisma 모델 `RiotAccount { id, memberId, puuid, gameName, tagLine, firstSeenAt, lastSeenAt, absorbedFromId }`, `Member.riotAccounts: RiotAccount[]`, `GameResult.replayKey: string | null`, `GameParticipant.absorbedFromId: string | null`

**설계 근거 — `absorbedFromId`는 이 계획이 정한 것이다.** 설계 문서는 "`absorbMember`가 흡수 대상의 `GameParticipant`와 `RiotAccount`를 생존자로 옮기고 `releaseMember`가 정확히 되돌려야 한다"고만 적었고 되돌리는 방법은 정하지 않았다. 옮긴 행에 **원래 주인의 id**를 남기는 것이 가장 싸고 정확하다. 값은 **비어 있을 때만** 채운다. 그래야 묘비를 이미 흡수해 둔 회원이 다시 흡수될 때 더 깊은 원주인이 덮이지 않는다:

```
T를 L이 흡수      → participant(member=L, absorbedFrom=T)
L을 S가 흡수      → participant(member=S, absorbedFrom=T)   ← T가 덮이지 않는다
S에서 L을 해제    → absorbedFrom=L인 행만 L로 돌아간다. T의 행은 S에 남는다 (옳다: T는 이제 S의 묘비다)
S에서 T를 해제    → absorbedFrom=T인 행이 T로 돌아간다
```

`absorbMember`는 묘비의 `mergedIntoId`가 **항상 활성 회원**을 가리키도록 재지정하므로 트리 깊이는 언제나 1이고, 위 네 줄이 전부다.

- [ ] **Step 1: 스키마에 모델과 컬럼을 더한다**

`packages/db/prisma/schema.prisma`의 `Member` 모델에서 `participants GameParticipant[]` 아래에 한 줄 추가:

```prisma
  riotAccounts RiotAccount[]
```

`GameResult` 모델의 `createdAt` 아래에 추가:

```prisma
  // 같은 리플레이의 재업로드를 막는다. 정렬한 PUUID 10개 + gameLength의 SHA-256.
  // 파일명에 의존하지 않으므로 이름을 바꿔 올려도 같은 값이 나온다. 손으로 입력한 경기는 null이다.
  replayKey String? @unique
```

`GameParticipant` 모델의 `mmrAfter` 아래에 추가:

```prisma
  // 흡수로 이 행을 넘겨받기 전의 원래 주인. releaseMember가 정확히 되돌리는 근거다.
  // 값은 비어 있을 때만 채운다 — 이미 이관된 행이 다시 이관돼도 최초 주인이 남아야 한다.
  absorbedFromId String?
```

그리고 `GameParticipant`의 `@@unique([gameResultId, memberId])` 아래에 추가:

```prisma
  @@index([absorbedFromId])
```

파일 끝에 새 모델을 추가한다:

```prisma
// 리플레이에서 관측된 라이엇 계정. 한 회원이 부계정을 여러 개 가질 수 있으므로 Member 1:N이다.
//
// 행은 리플레이에서 본 계정으로만 만든다. 카톡·디코 닉네임에 적힌 Riot ID로는 절대 만들지
// 않는다 — 그 값들은 사람이 손으로 적은 것이라 오타·태그 누락이 흔하고, 그대로 저장하면
// 박병준#0216(리플레이)과 박병준#kr1(카톡 오기)이 별개 계정이 되어 중복이 늘어난다.
model RiotAccount {
  id String @id @default(uuid())

  // null이면 "회원 아님"으로 확정한 외부인 계정. 다음 업로드에서 다시 묻지 않으려고 남긴다.
  memberId String?
  member   Member? @relation(fields: [memberId], references: [id])

  // 리플레이에서만 얻는다. 인게임 닉을 바꿔도 변하지 않는 유일한 값이라 이 테이블의 정체성이다.
  puuid String @unique

  // 마지막으로 관측된 표기. 닉변하면 갱신한다. 화면 표시용이며 매칭의 근거가 아니다.
  gameName String
  tagLine  String

  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime

  // GameParticipant.absorbedFromId와 같은 규칙. 흡수로 넘어오기 전의 원래 주인이다.
  absorbedFromId String?

  @@index([memberId])
  @@index([absorbedFromId])
}
```

- [ ] **Step 2: 마이그레이션을 만들고 클라이언트를 다시 생성한다**

Run:

```bash
npm run migrate --workspace=@lolpamin/db -- --name add_riot_account_and_replay_import
npm run generate --workspace=@lolpamin/db
```

Expected: `packages/db/prisma/migrations/`에 새 디렉터리가 생기고 `Your database is now in sync with your schema.`

- [ ] **Step 3: 테스트 리셋에 새 테이블을 넣는다**

`packages/db/src/test-utils.ts`의 `gameParticipant.deleteMany()` **다음 줄**에 추가한다. `RiotAccount`는 `Member`를 참조하므로 `member.deleteMany()`보다 먼저 지워져야 한다:

```ts
  await client.riotAccount.deleteMany();
```

- [ ] **Step 4: 새 테이블이 실제로 붙었는지 확인한다**

기존 통합 테스트를 그대로 돌려 `resetDatabase()`가 깨지지 않는지 본다.

Run: `npm run test --workspace=dashboard`
Expected: PASS — 기존 테스트 전부 통과(새 컬럼은 전부 nullable이라 기존 동작이 바뀌지 않는다)

- [ ] **Step 5: 커밋**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts
git commit -m "feat(db): add RiotAccount, GameResult.replayKey and the absorb transfer marker"
```

---

### Task 5: 흡수·해제가 경기 기록과 라이엇 계정을 함께 옮긴다

지금까지는 경기 기록을 가진 회원이 흡수될 수 없었다 — `saveGameResult`가 디코 연결을 요구했고 `absorbMember`는 `discordUserId`가 있는 행을 거부하므로, 두 조건이 겹쳐 그런 행이 존재할 수 없었다. Task 6이 리플레이로 확인된 반쪽 회원의 참가를 허용하는 순간 그 불변식이 깨진다. **이 태스크는 Task 6보다 먼저 들어가야 한다.**

**Files:**
- Modify: `apps/dashboard/lib/mutations/absorb-member.ts`
- Modify: `apps/dashboard/lib/mutations/release-member.ts`
- Modify: `apps/dashboard/lib/mutations/absorb-member.test.ts`
- Modify: `apps/dashboard/lib/mutations/release-member.test.ts`

**Interfaces:**
- Consumes: Task 4의 `GameParticipant.absorbedFromId`, `RiotAccount.absorbedFromId`
- Produces: `ABSORB_MEMBER_ERRORS.sharedGame: string` (기존 `alreadyMerged`·`platformAccountId`·`selfAbsorb`에 추가)

- [ ] **Step 1: 흡수 쪽 실패 테스트를 쓴다**

`apps/dashboard/lib/mutations/absorb-member.test.ts`의 마지막 `describe` 블록 안에 이어 붙인다. 이 파일은 아직 `ABSORB_MEMBER_ERRORS`를 import하지 않으므로 맨 위를 고친다:

```ts
import { absorbMember, ABSORB_MEMBER_ERRORS } from "./absorb-member";
```

```ts
  // saveGameResult를 거치지 않는다 — 이관 자체를 보는 테스트라 MMR 경로를 끌어들이면
  // 연결 조건 때문에 준비 코드가 커진다.
  async function recordGame(playedAt: Date, memberIds: string[]) {
    const game = await prisma.gameResult.create({ data: { playedAt, winner: "BLUE" } });
    for (const memberId of memberIds) {
      await prisma.gameParticipant.create({
        data: { gameResultId: game.id, memberId, team: "BLUE", mmrBefore: 1000, mmrAfter: 1023 },
      });
    }
    return game;
  }

  it("moves the loser's game participations onto the survivor", async () => {
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const game = await recordGame(new Date("2026-09-01T12:00:00Z"), [loser.id]);

    await absorbMember(prisma, loser.id, survivor.id);

    const participant = await prisma.gameParticipant.findFirstOrThrow({ where: { gameResultId: game.id } });
    expect(participant.memberId).toBe(survivor.id);
    expect(participant.absorbedFromId).toBe(loser.id);
  });

  it("moves the loser's riot accounts onto the survivor", async () => {
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-2" } });
    await prisma.riotAccount.create({
      data: { memberId: loser.id, puuid: "p-1", gameName: "ZAMSU", tagLine: "KR1", lastSeenAt: new Date() },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const account = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } });
    expect(account.memberId).toBe(survivor.id);
    expect(account.absorbedFromId).toBe(loser.id);
  });
```

```ts
  it("refuses the merge when both rows played in the same game", async () => {
    // 옮기면 @@unique([gameResultId, memberId])에 걸린다. normalizeKakaoNicknames가 한
    // 그룹에 두 discordUserId가 있을 때 배치를 멈추는 것과 같은 방어다.
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-3" } });
    await recordGame(new Date("2026-09-01T12:00:00Z"), [loser.id, survivor.id]);

    await expect(absorbMember(prisma, loser.id, survivor.id)).rejects.toThrow(ABSORB_MEMBER_ERRORS.sharedGame);

    const untouched = await prisma.gameParticipant.findFirstOrThrow({ where: { memberId: loser.id } });
    expect(untouched.absorbedFromId).toBeNull();
  });

  it("keeps the original owner when an already-absorbed row is absorbed again", async () => {
    const first = await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑구#KR1" } });
    const middle = await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑 구#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-4" } });
    const game = await recordGame(new Date("2026-09-01T12:00:00Z"), [first.id]);

    await absorbMember(prisma, first.id, middle.id);
    await absorbMember(prisma, middle.id, survivor.id);

    const participant = await prisma.gameParticipant.findFirstOrThrow({ where: { gameResultId: game.id } });
    expect(participant.memberId).toBe(survivor.id);
    // middle로 덮이면 first로 되돌릴 길이 없어진다.
    expect(participant.absorbedFromId).toBe(first.id);
  });

  it("counts a game as activity when the loser has no mention log", async () => {
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-5" } });
    await recordGame(new Date("2026-09-05T12:00:00Z"), [loser.id]);

    await absorbMember(prisma, loser.id, survivor.id);

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(refreshed.lastActiveAt).toEqual(new Date("2026-09-05T12:00:00Z"));
  });
```

- [ ] **Step 2: 해제 쪽 실패 테스트를 쓴다**

`apps/dashboard/lib/mutations/release-member.test.ts`에 같은 `recordGame` 헬퍼를 두고 이어 붙인다. 이 파일이 아직 `absorbMember`를 import하지 않는다면 `import { absorbMember } from "./absorb-member";`를 더한다.

```ts
  it("gives the game participations and riot accounts back to the tombstone", async () => {
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-6" } });
    const game = await recordGame(new Date("2026-09-01T12:00:00Z"), [loser.id]);
    await prisma.riotAccount.create({
      data: { memberId: loser.id, puuid: "p-2", gameName: "ZAMSU", tagLine: "KR1", lastSeenAt: new Date() },
    });
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    const participant = await prisma.gameParticipant.findFirstOrThrow({ where: { gameResultId: game.id } });
    expect(participant.memberId).toBe(loser.id);
    expect(participant.absorbedFromId).toBeNull();

    const account = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-2" } });
    expect(account.memberId).toBe(loser.id);
    expect(account.absorbedFromId).toBeNull();
  });
```

```ts
  it("leaves rows that belong to a different tombstone on the survivor", async () => {
    const first = await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑구#KR1" } });
    const middle = await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑 구#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-7" } });
    const game = await recordGame(new Date("2026-09-01T12:00:00Z"), [first.id]);
    await absorbMember(prisma, first.id, middle.id);
    await absorbMember(prisma, middle.id, survivor.id);

    await releaseMember(prisma, middle.id);

    // first는 여전히 survivor의 묘비다(absorbMember가 재지정했다). 그 경기도 survivor에 남아야 한다.
    const participant = await prisma.gameParticipant.findFirstOrThrow({ where: { gameResultId: game.id } });
    expect(participant.memberId).toBe(survivor.id);
    expect(participant.absorbedFromId).toBe(first.id);
  });

  it("recomputes lastActiveAt from games as well as mentions", async () => {
    const loser = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    const survivor = await prisma.member.create({ data: { discordUserId: "d-8" } });
    await recordGame(new Date("2026-09-05T12:00:00Z"), [loser.id]);
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    const refreshedLoser = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    const refreshedSurvivor = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(refreshedLoser.lastActiveAt).toEqual(new Date("2026-09-05T12:00:00Z"));
    expect(refreshedSurvivor.lastActiveAt).toBeNull();
  });
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/mutations/absorb-member.test.ts lib/mutations/release-member.test.ts`
Expected: FAIL — `ABSORB_MEMBER_ERRORS.sharedGame`가 `undefined`라 `rejects.toThrow`가 엉뚱하게 통과하거나 타입 오류가 나고, 이관 테스트는 `participant.memberId`가 그대로 loser라 실패한다

- [ ] **Step 4: `absorbMember`를 고친다**

`apps/dashboard/lib/mutations/absorb-member.ts`.

(1) `effectiveLastActiveAt`이 경기도 보게 한다. 기존 함수를 통째로 아래로 바꾼다:

```ts
// 취소된 경기는 활동으로 세지 않는다 — 없던 일이 된 경기다.
async function latestGameAt(tx: Prisma.TransactionClient, memberIds: string[]): Promise<Date | null> {
  const latest = await tx.gameParticipant.findFirst({
    where: { memberId: { in: memberIds }, gameResult: { cancelledAt: null } },
    orderBy: { gameResult: { playedAt: "desc" } },
    select: { gameResult: { select: { playedAt: true } } },
  });
  return latest?.gameResult.playedAt ?? null;
}

// mergedIntoId를 심기 전, 각 회원의 실제 마지막 활동을 구한다. lastActiveAt 필드는
// 보통 카톡 임포트가 멘션 로그와 함께 갱신하지만, 필드가 갱신되지 않은 채 로그만 있는
// 경우도 있으므로 필드와 자기 로그 중 더 나중 값을 취한다. 리플레이 임포트가 생긴 뒤로는
// 멘션 없이 경기만 뛴 회원이 있을 수 있어 경기 날짜도 함께 본다.
async function effectiveLastActiveAt(
  tx: Prisma.TransactionClient,
  memberId: string,
  fieldValue: Date | null,
): Promise<Date | null> {
  const latest = await tx.mentionLog.aggregate({ where: { memberId }, _max: { mentionedAt: true } });
  return laterOf(laterOf(fieldValue, latest._max.mentionedAt), await latestGameAt(tx, [memberId]));
}
```

(2) 에러 목록에 한 줄 더한다:

```ts
  sharedGame: "같은 경기에 두 회원이 모두 참가해 있어 흡수할 수 없습니다. 경기 기록을 먼저 정리해 주세요.",
```

(3) `selfAbsorb` 검사 **바로 다음**, `effectiveLastActiveAt` 호출 **앞**에 충돌 검사를 넣는다:

```ts
      // 두 행이 같은 경기에 들어 있으면 이관이 @@unique([gameResultId, memberId])에 막힌다.
      // Prisma의 영어 예외를 노출하는 대신 여기서 막고 안내 문구를 던진다.
      const loserGames = await tx.gameParticipant.findMany({
        where: { memberId: loser.id },
        select: { gameResultId: true },
      });
      if (loserGames.length > 0) {
        const clash = await tx.gameParticipant.findFirst({
          where: { memberId: survivor.id, gameResultId: { in: loserGames.map((g) => g.gameResultId) } },
        });
        if (clash) throw new Error(ABSORB_MEMBER_ERRORS.sharedGame);
      }
```

(4) 마지막 `tx.member.update({ where: { id: loser.id }, ... })` **앞**에 이관을 넣는다:

```ts
      // 경기 기록과 라이엇 계정은 생존자에게 옮긴다. 카톡 닉네임과 달리 묘비에 남겨 두면
      // 전적과 MMR이 이름만 바뀐 채 사라진 것처럼 보인다.
      //
      // absorbedFromId는 비어 있을 때만 채운다. loser가 이미 다른 묘비의 기록을 넘겨받았다면
      // 그 행의 원주인은 loser가 아니라 더 앞의 묘비이고, 그 값을 덮으면 되돌릴 길이 없어진다.
      // 그래서 두 번에 나눠 쓴다 — 먼저 표식이 없는 행만, 그다음 남은 행을 옮긴다.
      //
      // 두 모델을 배열로 돌리지 않는다. tx[model]은 두 델리게이트 타입의 유니언이 되어
      // updateMany 호출이 타입 오류를 낸다("none of those signatures are compatible").
      await tx.gameParticipant.updateMany({
        where: { memberId: loser.id, absorbedFromId: null },
        data: { memberId: survivor.id, absorbedFromId: loser.id },
      });
      await tx.gameParticipant.updateMany({
        where: { memberId: loser.id },
        data: { memberId: survivor.id },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: loser.id, absorbedFromId: null },
        data: { memberId: survivor.id, absorbedFromId: loser.id },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: loser.id },
        data: { memberId: survivor.id },
      });
```

- [ ] **Step 5: `releaseMember`를 고친다**

`apps/dashboard/lib/mutations/release-member.ts`.

(1) `recomputeLastActiveAt`을 통째로 바꾼다:

```ts
// 활동 기록은 병합할 때 옮기지 않으므로, 한 회원의 진짜 마지막 활동은 자기 로그와
// 아직 자기에게 붙어 있는 묘비들의 로그를 함께 봐야 나온다.
//
// absorbMember와의 계약: absorbMember는 저장된 lastActiveAt 필드와 자기 MentionLog·경기의
// 최댓값 중 나중 값을 쓰지만, 여기서는 로그와 경기만 보고 다시 계산한다. 두 계산이 같은
// 답을 내는 이유는 lastActiveAt을 갱신하는 두 경로(processKakaoExport, saveReplayImport)가
// 반드시 MentionLog나 GameParticipant를 함께 남기기 때문이다. 흔적 없이 lastActiveAt만
// 직접 쓰는 경로가 생기면 흡수→해제 왕복에서 그 값이 조용히 사라진다 — 그런 경로를
// 추가한다면 여기도 함께 고쳐야 한다.
async function recomputeLastActiveAt(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
  const ids = [memberId, ...tombstones.map((t) => t.id)];
  const latestMention = await tx.mentionLog.aggregate({
    where: { memberId: { in: ids } },
    _max: { mentionedAt: true },
  });
  const latestGame = await tx.gameParticipant.findFirst({
    where: { memberId: { in: ids }, gameResult: { cancelledAt: null } },
    orderBy: { gameResult: { playedAt: "desc" } },
    select: { gameResult: { select: { playedAt: true } } },
  });

  const mention = latestMention._max.mentionedAt;
  const game = latestGame?.gameResult.playedAt ?? null;
  const lastActiveAt = !mention ? game : !game ? mention : mention >= game ? mention : game;

  await tx.member.update({ where: { id: memberId }, data: { lastActiveAt } });
}
```

(2) `tx.member.update({ where: { id: tombstoneId }, data: { mergedIntoId: null } })` **다음**, 두 번의 `recomputeLastActiveAt` **앞**에 되돌리기를 넣는다:

```ts
      // 흡수 때 넘어간 경기 기록과 라이엇 계정을 돌려준다. 표식이 이 묘비를 가리키는
      // 행만 가져온다 — 생존자가 직접 쌓은 기록과, 다른 묘비에서 온 기록은 건드리지 않는다.
      // absorbMember와 같은 이유로 두 모델을 배열로 돌리지 않는다(델리게이트 유니언 타입 오류).
      await tx.gameParticipant.updateMany({
        where: { memberId: survivorId, absorbedFromId: tombstoneId },
        data: { memberId: tombstoneId, absorbedFromId: null },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: survivorId, absorbedFromId: tombstoneId },
        data: { memberId: tombstoneId, absorbedFromId: null },
      });
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/mutations/absorb-member.test.ts lib/mutations/release-member.test.ts`
Expected: PASS — 새로 더한 8개를 포함해 두 파일 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add apps/dashboard/lib/mutations/absorb-member.ts apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.ts apps/dashboard/lib/mutations/release-member.test.ts
git commit -m "feat(members): carry games and riot accounts through absorb and release"
```

---

### Task 6: 반쪽 회원 규칙 완화와 `replayKey` 연결

`saveGameResult`는 참가자 전원이 디코와 카톡 양쪽에 붙어 있을 것을 요구한다. 리플레이에 반쪽 회원이 한 명만 끼어도 저장이 통째로 거부되므로 자동화의 의미가 사라진다. **조건을 좁게 넓힌다** — "디코 AND 카톡"에 "PUUID가 있는 `RiotAccount`가 붙어 있으면 갈음"을 더한다. `RiotAccount`는 손으로 만들 수 없으므로 이 완화는 리플레이로 확인된 사람에게만 적용된다.

동시에, Task 8이 계정 등록·경기 저장·활동 갱신을 **하나의 트랜잭션**으로 묶을 수 있도록 본문을 `saveGameResultTx`로 한 겹 벗겨 낸다. MMR 계산 로직 자체는 한 줄도 바뀌지 않는다.

**Files:**
- Modify: `apps/dashboard/lib/mutations/save-game-result.ts`
- Modify: `apps/dashboard/lib/mutations/save-game-result.test.ts`
- Modify: `apps/dashboard/lib/queries/linked-members.ts`
- Modify: `apps/dashboard/lib/queries/linked-members.test.ts`

**Interfaces:**
- Consumes: Task 4의 `RiotAccount`, `GameResult.replayKey`
- Produces:
  - `saveGameResultTx(tx: Prisma.TransactionClient, input: SaveGameResultInput): Promise<SaveGameResultOutput>` — 호출자가 연 트랜잭션 안에서 도는 본문
  - `SaveGameResultInput`에 `replayKey?: string | null` 추가
  - `LinkedMemberOption.discordName`은 이제 디코가 없는 회원에서 `"(디코 없음)"`이 될 수 있다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/save-game-result.test.ts`의 `describe("saveGameResult")` 안에 이어 붙인다:

```ts
  async function createRiotOnlyMember(mmr: number) {
    const member = await prisma.member.create({ data: { kakaoNickname: `k-${mmr}-${Math.random()}`, mmr } });
    await prisma.riotAccount.create({
      data: { memberId: member.id, puuid: `p-${Math.random()}`, gameName: "ZAMSU", tagLine: "KR1", lastSeenAt: new Date() },
    });
    return member;
  }

  it("lets a half-linked member play when a replay confirmed their riot account", async () => {
    // RiotAccount는 손으로 만들 수 없다. 리플레이가 그 사람이 그 경기를 뛰었다는 1차
    // 증거이므로, 원래 규칙이 묻던 "확실히 정착한 한 사람인가"를 이미 충족한다.
    const blue = await createRiotOnlyMember(1000);
    const red = await createLinkedMember(1000);

    const result = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-05T12:00:00Z"),
      blueMemberIds: [blue.id],
      redMemberIds: [red.id],
      winner: "BLUE",
    });

    expect(result.updates).toHaveLength(2);
  });

  it("still refuses a half-linked member with no riot account", async () => {
    const blue = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1", mmr: 1000 } });
    const red = await createLinkedMember(1000);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date("2026-09-05T12:00:00Z"),
        blueMemberIds: [blue.id],
        redMemberIds: [red.id],
        winner: "BLUE",
      }),
    ).rejects.toThrow(/must be fully linked/);
  });

  it("stores the replay key and refuses the same replay twice", async () => {
    const blue = await createLinkedMember(1000);
    const red = await createLinkedMember(1000);
    const input = {
      playedAt: new Date("2026-09-05T12:00:00Z"),
      blueMemberIds: [blue.id],
      redMemberIds: [red.id],
      winner: "BLUE" as const,
      replayKey: "abc123",
    };

    const saved = await saveGameResult(prisma, input);
    const game = await prisma.gameResult.findUniqueOrThrow({ where: { id: saved.gameResultId } });
    expect(game.replayKey).toBe("abc123");

    // 유니크 제약이 최후의 방어선이다. 화면에서 거르는 것과 별개로 DB가 막아야 한다.
    await expect(saveGameResult(prisma, input)).rejects.toThrow();
  });
```

`apps/dashboard/lib/queries/linked-members.test.ts`에도 더한다:

```ts
  it("includes a member whose only link is a replay-confirmed riot account", async () => {
    // 리플레이로 확인된 사람이 수동 입력 화면에서는 못 뜨는 것이 더 놀랍다.
    const member = await prisma.member.create({ data: { kakaoNickname: "배성민/97/성민탑#KR1" } });
    await prisma.riotAccount.create({
      data: { memberId: member.id, puuid: "p-linked", gameName: "ZAMSU", tagLine: "KR1", lastSeenAt: new Date() },
    });

    const pool = await getLinkedMembers();

    const found = pool.find((m) => m.id === member.id);
    expect(found).toBeDefined();
    expect(found!.discordName).toBe("(디코 없음)");
  });

  it("still leaves out a member with neither a discord side nor a riot account", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "박병준/94/늑구#KR1" } });

    const pool = await getLinkedMembers();

    expect(pool.some((m) => m.id === member.id)).toBe(false);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/mutations/save-game-result.test.ts lib/queries/linked-members.test.ts`
Expected: FAIL — 반쪽 회원 저장이 `must be fully linked`로 거부되고, `replayKey`가 `SaveGameResultInput`에 없어 타입 오류가 난다

- [ ] **Step 3: `saveGameResult`를 고친다**

`apps/dashboard/lib/mutations/save-game-result.ts`.

(1) import 줄에 `Prisma`를 더한다:

```ts
import type { Prisma, PrismaClient, Team } from "@lolpamin/db";
```

(2) `SaveGameResultInput`에 한 필드 더한다:

```ts
  // 리플레이에서 들어온 경기의 내용 해시. 같은 파일을 두 번 올리는 것을 DB가 막는다.
  // 손으로 입력한 경기는 null이다.
  replayKey?: string | null;
```

(3) 기존 `saveGameResult`를 아래 두 함수로 쪼갠다. 검증과 계산 순서는 그대로 두고, 트랜잭션을 여는 자리만 바깥으로 뺀다:

```ts
/**
 * 호출자가 연 트랜잭션 안에서 도는 본문. 리플레이 임포트가 계정 등록·활동 갱신과 이 저장을
 * 한 트랜잭션으로 묶어야 해서 따로 뺐다. 직접 부를 일이 없으면 saveGameResult를 쓴다.
 */
export async function saveGameResultTx(
  tx: Prisma.TransactionClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  const { playedAt, blueMemberIds, redMemberIds, winner, createdById = null, replayKey = null } = input;

  const overlap = blueMemberIds.filter((id) => redMemberIds.includes(id));
  if (overlap.length > 0) {
    throw new Error("A participant cannot be on both teams");
  }

  const allIds = [...blueMemberIds, ...redMemberIds];
  // 카톡 닉네임은 흡수해도 묘비에 남으므로(활동 기록을 옮기지 않으려고), 연결 여부를
  // 보려면 묘비의 닉네임도 함께 읽어와야 한다.
  const members = await tx.member.findMany({
    where: { id: { in: allIds } },
    include: { absorbed: { select: { kakaoNickname: true } }, riotAccounts: { select: { id: true } } },
  });

  if (members.length !== allIds.length) {
    throw new Error("One or more participants do not exist");
  }
  for (const member of members) {
    if (member.mergedIntoId !== null) {
      throw new Error(`Participant ${member.id} was absorbed into another member and cannot play`);
    }
    // kakaoUserId는 이 시스템에서 채워지는 경로가 없다(카톡 봇 폐기). 연결은
    // kakaoNickname으로 이뤄지므로 그것을 연결의 근거로 본다 — 자기 행이든, 흡수해 둔 묘비든.
    const hasKakaoNickname =
      member.kakaoNickname !== null || member.absorbed.some((a) => a.kakaoNickname !== null);
    // 리플레이에서 확인된 계정이 붙어 있으면 반쪽 회원도 뛸 수 있다. RiotAccount는
    // PUUID로만 만들어지므로 손으로 위조할 수 없고, "확실히 정착한 한 사람인가"라는
    // 원래 규칙의 목적을 이미 충족한다.
    const hasRiotAccount = member.riotAccounts.length > 0;
    if (!hasRiotAccount && (!member.discordUserId || !hasKakaoNickname)) {
      throw new Error(`Participant ${member.id} must be fully linked to play in a match`);
    }
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  // 설정은 트랜잭션 안에서 읽는다 — 저장 도중 어드민이 K값을 바꿔도 이 경기는
  // 하나의 설정으로만 계산된다.
  const config = await getMmrConfig(tx);
  const { blueDelta, redDelta } = calculateTeamMmrChange({
    blueRatings: blueMemberIds.map((id) => byId.get(id)!.mmr),
    redRatings: redMemberIds.map((id) => byId.get(id)!.mmr),
    winner,
    config,
  });

  const gameResult = await tx.gameResult.create({
    data: { playedAt, winner: winner as Team, createdById, replayKey },
  });

  const updates: SaveGameResultOutput["updates"] = [];

  for (const [team, ids, delta] of [
    ["BLUE", blueMemberIds, blueDelta],
    ["RED", redMemberIds, redDelta],
  ] as const) {
    for (const memberId of ids) {
      const mmrBefore = byId.get(memberId)!.mmr;
      const mmrAfter = mmrBefore + delta;
      await tx.gameParticipant.create({
        data: { gameResultId: gameResult.id, memberId, team: team as Team, mmrBefore, mmrAfter },
      });
      await tx.member.update({ where: { id: memberId }, data: { mmr: mmrAfter } });
      updates.push({ memberId, mmrBefore, mmrAfter });
    }
  }

  return { gameResultId: gameResult.id, updates };
}

export async function saveGameResult(
  prisma: PrismaClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  return prisma.$transaction((tx) => saveGameResultTx(tx, input));
}
```

- [ ] **Step 4: `getLinkedMembers`를 고친다**

`apps/dashboard/lib/queries/linked-members.ts`의 `where` 절을 아래로 바꾼다:

```ts
    where: {
      mergedIntoId: null,
      OR: [
        {
          discordUserId: { not: null },
          // 카톡 닉네임은 흡수해도 생존자에게 복사하지 않고 묘비에 남는다(활동 기록을
          // 옮기지 않으려고). 그러니 아직 붙어 있는 묘비가 닉네임을 들고 있으면 그 회원도
          // 연결이 끝난 것으로 본다.
          OR: [
            { kakaoUserId: { not: null } },
            { kakaoNickname: { not: null } },
            { absorbed: { some: { kakaoNickname: { not: null } } } },
          ],
        },
        // saveGameResult와 같은 완화다. 리플레이로 확인된 사람이 수동 입력 화면에서만
        // 안 보이면 두 화면이 서로 다른 회원 목록을 말하게 된다.
        { riotAccounts: { some: {} } },
      ],
    },
```

그리고 `discordName` 줄을 바꾼다 — 디코가 없는 회원이 목록에 들어오므로 세 값이 모두 null일 수 있다:

```ts
    discordName: m.discordDisplayName ?? m.discordHandle ?? m.discordUserId ?? "(디코 없음)",
```

`LinkedMemberOption.discordName`의 주석도 함께 고친다:

```ts
  // 서버 별명. 핸들("dohyun_kr")은 디코 아이디라 사람을 알아볼 수 없으므로 별명을 먼저
  // 본다 — queries/members.ts의 displayDiscordName과 같은 규칙이다. 리플레이로만 확인된
  // 회원은 디코가 아예 없어 "(디코 없음)"이 된다.
  discordName: string;
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npm run test --workspace=dashboard`
Expected: PASS — 대시보드 전체 통과. `saveGameResult`를 쓰는 다른 테스트(`cancel-game-result`, `game-history`)가 깨지지 않는지 함께 본다.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/lib/mutations/save-game-result.ts apps/dashboard/lib/mutations/save-game-result.test.ts apps/dashboard/lib/queries/linked-members.ts apps/dashboard/lib/queries/linked-members.test.ts
git commit -m "feat(matches): let a replay-confirmed member play and carry the replay key"
```

---

### Task 7: 서버 준비 단계 — `computeReplayKey`와 `prepareReplayImport`

업로드된 바이트를 받아 화면이 그릴 수 있는 슬롯 10개를 만든다. 아직 아무것도 저장하지 않는다.

**Files:**
- Create: `apps/dashboard/lib/replay-import/replay-key.ts`
- Create: `apps/dashboard/lib/replay-import/replay-key.test.ts`
- Create: `apps/dashboard/lib/replay-import/prepare-import.ts`
- Create: `apps/dashboard/lib/replay-import/prepare-import.test.ts`
- Create: `apps/dashboard/lib/replay-import/test-fixture.ts`

**Interfaces:**
- Consumes: `parseRoflMetadata`·`ReplayMetadata`·`ReplayPlayer`(Task 1), `scoreRiotAccountMatch`·`isAutoAssignable`(Task 3), `getDisplayName`(core), Task 4의 `RiotAccount`
- Produces:
  - `computeReplayKey(meta: ReplayMetadata): string`
  - `prepareReplayImport(prisma: PrismaClient, bytes: Uint8Array): Promise<PreparedReplayImport>`
  - `type SlotStatus = "confirmed" | "auto" | "unresolved" | "outsider"`
  - `interface SlotCandidate { memberId: string; label: string; score: number; reasons: string[] }`
  - `interface ImportSlot { puuid, gameName, tagLine, team, position, champion, kills, deaths, assists, cs, level, wasAfk, wasLeaver, status, memberId, candidates }`
  - `interface MemberOption { id: string; label: string }`
  - `interface PreparedReplayImport { replayKey, gameVersion, gameLengthMs, winner, endedInSurrender, slots, members }`
  - `const REPLAY_IMPORT_ERRORS: { alreadyImported: string }`
  - `buildRoflFixture(players, options?): Uint8Array` (테스트 전용)

- [ ] **Step 1: 테스트 픽스처 빌더를 만든다**

`apps/dashboard/lib/replay-import/test-fixture.ts` — 통합 테스트가 합성 `.rofl` 바이트를 만들어 쓴다. 프로덕션 코드가 import하지 않는다.

```ts
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
```

- [ ] **Step 2: `computeReplayKey`의 실패 테스트를 쓴다**

`apps/dashboard/lib/replay-import/replay-key.test.ts` — DB를 만지지 않으므로 가드가 필요 없다.

```ts
import { describe, expect, it } from "vitest";
import { parseRoflMetadata } from "@lolpamin/core";
import { computeReplayKey } from "./replay-key";
import { buildRoflFixture, tenPlayers } from "./test-fixture";

describe("computeReplayKey", () => {
  it("gives the same key for the same replay regardless of participant order", () => {
    const players = tenPlayers();
    const shuffled = [...players].reverse();

    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(players)));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(shuffled)));

    expect(a).toBe(b);
  });

  it("gives a different key for a different game length", () => {
    const players = tenPlayers();

    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(players, 1584502)));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(players, 1600000)));

    expect(a).not.toBe(b);
  });

  it("gives a different key when one participant differs", () => {
    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(tenPlayers())));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(tenPlayers([{ puuid: "someone-else" }]))));

    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/replay-import/replay-key.test.ts`
Expected: FAIL — `Failed to resolve import "./replay-key"`

- [ ] **Step 4: `computeReplayKey`를 구현한다**

`apps/dashboard/lib/replay-import/replay-key.ts`:

```ts
import { createHash } from "node:crypto";
import type { ReplayMetadata } from "@lolpamin/core";

/**
 * 같은 리플레이의 재업로드를 막는 내용 해시. 카톡 임포트는 워터마크로 멱등성을 얻지만
 * (max(MentionLog.mentionedAt)) 리플레이에는 시간 축이 없다 — 파일에 벽시계 시각이
 * 아예 없으므로 내용으로 잡는다.
 *
 * 파일 바이트 전체가 아니라 참가자 PUUID와 경기 길이만 쓴다. 파일명을 바꾸거나 클라이언트가
 * 리플레이를 다시 받아 저장해도 같은 값이 나와야 한다. PUUID를 정렬하는 것은 참가자 순서가
 * 보장되지 않기 때문이다.
 *
 * node:crypto를 쓰므로 packages/core에 둘 수 없다 — core는 클라이언트 번들에도 들어간다.
 */
export function computeReplayKey(meta: ReplayMetadata): string {
  const puuids = meta.players.map((p) => p.puuid).sort();
  return createHash("sha256").update(`${puuids.join(",")}|${meta.gameLengthMs}`).digest("hex");
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/replay-import/replay-key.test.ts`
Expected: PASS — 3 passed

- [ ] **Step 6: `prepareReplayImport`의 실패 테스트를 쓴다**

`apps/dashboard/lib/replay-import/prepare-import.test.ts`:

```ts
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
});
```

이어서 같은 `describe` 안에 나머지를 쓴다:

```ts
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
```

- [ ] **Step 7: 테스트가 실패하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/replay-import/prepare-import.test.ts`
Expected: FAIL — `Failed to resolve import "./prepare-import"`

- [ ] **Step 8: `prepareReplayImport`를 구현한다**

`apps/dashboard/lib/replay-import/prepare-import.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName, isAutoAssignable, parseRoflMetadata, scoreRiotAccountMatch } from "@lolpamin/core";
import type { ReplayPlayer } from "@lolpamin/core";
import { computeReplayKey } from "./replay-key";

/** confirmed는 PUUID로 확정, auto는 점수로 자동 배정, outsider는 "회원 아님"으로 확정한 계정. */
export type SlotStatus = "confirmed" | "auto" | "unresolved" | "outsider";

export interface SlotCandidate {
  memberId: string;
  label: string;
  score: number;
  reasons: string[];
}

export interface ImportSlot {
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  position: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  level: number;
  wasAfk: boolean;
  wasLeaver: boolean;
  status: SlotStatus;
  memberId: string | null;
  candidates: SlotCandidate[];
}

export interface MemberOption {
  id: string;
  label: string;
}

export interface PreparedReplayImport {
  replayKey: string;
  gameVersion: string;
  gameLengthMs: number;
  winner: "BLUE" | "RED";
  endedInSurrender: boolean;
  slots: ImportSlot[];
  /** 후보가 빗나갔을 때 관리자가 직접 고르는 전체 명단. */
  members: MemberOption[];
}

export const REPLAY_IMPORT_ERRORS = {
  alreadyImported: "이미 등록된 경기입니다.",
} as const;

/** 한 슬롯에 칩으로 띄울 후보 수. 그보다 많이 나와도 상위 몇 개만 낸다. */
const MAX_CANDIDATES = 5;

interface LabelSource {
  realName: string | null;
  discordHandle: string | null;
  kakaoNickname: string | null;
  age: number | null;
}

// 동명이인이 목록에서 구분되지 않으므로 출생연도를 붙인다. 카톡 match key가 이미
// 실명/출생연도이므로 일관된다.
function memberLabel(member: LabelSource): string {
  const name = getDisplayName(member);
  return member.age === null ? name : `${name} / ${member.age}`;
}

function baseSlot(player: ReplayPlayer) {
  return {
    puuid: player.puuid,
    gameName: player.gameName,
    tagLine: player.tagLine,
    team: player.team,
    position: player.position,
    champion: player.champion,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    cs: player.cs,
    level: player.level,
    wasAfk: player.wasAfk,
    wasLeaver: player.wasLeaver,
  };
}
```

같은 파일에 이어서:

```ts
/**
 * 업로드된 리플레이를 화면이 그릴 수 있는 슬롯 10개로 바꾼다. 아무것도 저장하지 않는다.
 *
 * 순서가 중요하다 — PUUID로 확정되는 슬롯을 먼저 채워 배정 집합을 만든 뒤 나머지를 채점한다.
 * 채점을 먼저 하면 이미 확정된 회원이 다른 슬롯의 1순위로 올라와 자동 배정을 훔쳐 간다.
 */
export async function prepareReplayImport(
  prisma: PrismaClient,
  bytes: Uint8Array
): Promise<PreparedReplayImport> {
  const meta = parseRoflMetadata(bytes);
  const replayKey = computeReplayKey(meta);

  const already = await prisma.gameResult.findUnique({ where: { replayKey } });
  if (already) throw new Error(REPLAY_IMPORT_ERRORS.alreadyImported);

  const [accounts, members] = await Promise.all([
    prisma.riotAccount.findMany({
      where: { puuid: { in: meta.players.map((p) => p.puuid) } },
      include: { member: { select: { id: true, mergedIntoId: true } } },
    }),
    prisma.member.findMany({
      where: { mergedIntoId: null },
      select: {
        id: true,
        realName: true,
        age: true,
        kakaoNickname: true,
        discordHandle: true,
        discordDisplayName: true,
        riotId: true,
      },
      orderBy: [{ realName: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const byPuuid = new Map(accounts.map((a) => [a.puuid, a]));
  // 이미 이 경기의 다른 슬롯에 앉은 회원. 같은 사람이 두 슬롯에 앉으면 저장이
  // @@unique([gameResultId, memberId])에 막힌다.
  const taken = new Set<string>();

  const slots: ImportSlot[] = meta.players.map((player) => {
    const account = byPuuid.get(player.puuid);
    if (!account) {
      return { ...baseSlot(player), status: "unresolved" as SlotStatus, memberId: null, candidates: [] };
    }
    if (account.member === null) {
      // "회원 아님"으로 확정해 둔 외부인. 다음 업로드에서 다시 묻지 않는다.
      return { ...baseSlot(player), status: "outsider" as SlotStatus, memberId: null, candidates: [] };
    }
    // 묘비에 붙어 있으면 생존자로 올린다 — processKakaoExport와 같은 규칙이다.
    const memberId = account.member.mergedIntoId ?? account.member.id;
    taken.add(memberId);
    return { ...baseSlot(player), status: "confirmed" as SlotStatus, memberId, candidates: [] };
  });

  const pending = slots.filter((s) => s.status === "unresolved");
  const ranked = new Map<string, SlotCandidate[]>();
  for (const slot of pending) {
    ranked.set(
      slot.puuid,
      members
        .map((m) => {
          const { score, reasons } = scoreRiotAccountMatch(
            { gameName: slot.gameName, tagLine: slot.tagLine, position: slot.position },
            m,
          );
          return { memberId: m.id, label: memberLabel(m), score, reasons };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)),
    );
  }

  // 확신이 큰 슬롯부터 가져간다. 두 슬롯이 같은 회원을 1순위로 들고 있을 때 점수가 높은
  // 쪽이 먼저 배정돼야 낮은 쪽이 엉뚱하게 자동 확정되지 않는다.
  const byConfidence = [...pending].sort(
    (a, b) => (ranked.get(b.puuid)![0]?.score ?? 0) - (ranked.get(a.puuid)![0]?.score ?? 0),
  );
  for (const slot of byConfidence) {
    const available = ranked.get(slot.puuid)!.filter((c) => !taken.has(c.memberId));
    const top = available[0];
    if (top && isAutoAssignable(top.score, available[1]?.score ?? 0)) {
      slot.status = "auto";
      slot.memberId = top.memberId;
      taken.add(top.memberId);
    }
  }

  // 후보 목록은 자동 배정이 전부 끝난 뒤에 굳힌다. 먼저 채점된 슬롯의 목록에 나중에
  // 배정된 회원이 남아 있으면 관리자가 고를 수 없는 칩을 보게 된다.
  for (const slot of slots) {
    if (slot.status !== "unresolved") continue;
    slot.candidates = ranked
      .get(slot.puuid)!
      .filter((c) => !taken.has(c.memberId))
      .slice(0, MAX_CANDIDATES);
  }

  return {
    replayKey,
    gameVersion: meta.gameVersion,
    gameLengthMs: meta.gameLengthMs,
    winner: meta.winner,
    endedInSurrender: meta.endedInSurrender,
    slots,
    members: members.map((m) => ({ id: m.id, label: memberLabel(m) })),
  };
}
```

- [ ] **Step 9: 테스트가 통과하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/replay-import/`
Expected: PASS — `replay-key` 3개 + `prepare-import` 9개 통과

- [ ] **Step 10: 커밋**

```bash
git add apps/dashboard/lib/replay-import
git commit -m "feat(replay-import): turn an uploaded replay into matched slots"
```

---

### Task 8: 저장 — `saveReplayImport`

계정 등록·경기 저장·활동 갱신을 **하나의 트랜잭션**으로 묶는다. 셋 중 하나만 성공하면 다음 업로드에서 같은 계정을 또 묻거나, 계정만 등록되고 경기는 없는 상태가 된다.

**Files:**
- Create: `apps/dashboard/lib/mutations/save-replay-import.ts`
- Create: `apps/dashboard/lib/mutations/save-replay-import.test.ts`

**Interfaces:**
- Consumes: `saveGameResultTx`(Task 6), Task 4의 `RiotAccount`
- Produces:
  - `saveReplayImport(prisma: PrismaClient, input: SaveReplayImportInput): Promise<SaveGameResultOutput>`
  - `interface ReplayAssignment { puuid: string; gameName: string; tagLine: string; team: "BLUE" | "RED"; memberId: string | null }`
  - `interface SaveReplayImportInput { replayKey: string; playedAt: Date; winner: "BLUE" | "RED"; assignments: ReplayAssignment[]; createdById?: string | null }`
  - `const SAVE_REPLAY_IMPORT_ERRORS: { alreadyImported: string; duplicateMember: string; emptyTeam: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/save-replay-import.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { SAVE_REPLAY_IMPORT_ERRORS, saveReplayImport } from "./save-replay-import";

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
```

이어서 같은 `describe` 안에:

```ts
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
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/mutations/save-replay-import.test.ts`
Expected: FAIL — `Failed to resolve import "./save-replay-import"`

- [ ] **Step 3: `saveReplayImport`를 구현한다**

`apps/dashboard/lib/mutations/save-replay-import.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import { saveGameResultTx, type SaveGameResultOutput } from "./save-game-result";

export interface ReplayAssignment {
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  /** null이면 "회원 아님"으로 확정한 외부인이다. */
  memberId: string | null;
}

export interface SaveReplayImportInput {
  replayKey: string;
  /** 리플레이에 벽시계 시각이 없어 관리자가 고른 값이다(기본값은 파일의 lastModified). */
  playedAt: Date;
  winner: "BLUE" | "RED";
  assignments: ReplayAssignment[];
  createdById?: string | null;
}

export const SAVE_REPLAY_IMPORT_ERRORS = {
  alreadyImported: "이미 등록된 경기입니다.",
  duplicateMember: "같은 회원이 두 슬롯에 배정돼 있습니다.",
  emptyTeam: "한 팀에 회원이 한 명도 없습니다. 최소 한 명은 회원이어야 합니다.",
} as const;

/**
 * 확정된 매칭을 저장한다. 계정 등록·경기 저장·활동 갱신이 한 트랜잭션 안에서 끝난다 —
 * 셋 중 하나만 성공하면 계정만 등록되고 경기는 없는 상태가 되어 다음 업로드가 조용히 어긋난다.
 *
 * 계정을 먼저 등록하는 것은 의도적이다. 그 순간 배정된 회원은 RiotAccount를 갖게 되어
 * saveGameResult의 완화 조건("PUUID로 확인된 계정이 붙어 있으면 디코·카톡 양쪽 연결을 갈음")을
 * 충족한다. 리플레이가 그 사람이 그 경기를 뛰었다는 1차 증거라는 설계를 그대로 옮긴 것이다.
 */
export async function saveReplayImport(
  prisma: PrismaClient,
  input: SaveReplayImportInput
): Promise<SaveGameResultOutput> {
  const { replayKey, playedAt, winner, assignments, createdById = null } = input;

  const memberIds = assignments.map((a) => a.memberId).filter((id): id is string => id !== null);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.duplicateMember);
  }

  const blueMemberIds = assignments.filter((a) => a.team === "BLUE" && a.memberId).map((a) => a.memberId!);
  const redMemberIds = assignments.filter((a) => a.team === "RED" && a.memberId).map((a) => a.memberId!);
  // 회원이 0명인 팀은 평균 레이팅이 없어 calculateTeamMmrChange가 NaN을 낸다.
  if (blueMemberIds.length === 0 || redMemberIds.length === 0) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.emptyTeam);
  }

  return prisma.$transaction(
    async (tx) => {
      const already = await tx.gameResult.findUnique({ where: { replayKey } });
      if (already) throw new Error(SAVE_REPLAY_IMPORT_ERRORS.alreadyImported);

      for (const a of assignments) {
        const existing = await tx.riotAccount.findUnique({ where: { puuid: a.puuid } });
        if (!existing) {
          await tx.riotAccount.create({
            data: {
              puuid: a.puuid,
              memberId: a.memberId,
              gameName: a.gameName,
              tagLine: a.tagLine,
              lastSeenAt: playedAt,
            },
          });
          continue;
        }
        await tx.riotAccount.update({
          where: { puuid: a.puuid },
          data: {
            memberId: a.memberId,
            // 닉변을 반영한다. 표시용이며 매칭의 근거가 아니므로 덮어도 잃는 것이 없다.
            gameName: a.gameName,
            tagLine: a.tagLine,
            lastSeenAt: playedAt,
            // 관리자가 주인을 바꿨다면 흡수 표식은 의미를 잃는다. 남겨 두면 나중에 해제할 때
            // 이 계정이 엉뚱한 묘비로 돌아간다.
            absorbedFromId: existing.memberId === a.memberId ? existing.absorbedFromId : null,
          },
        });
      }

      const result = await saveGameResultTx(tx, {
        playedAt,
        blueMemberIds,
        redMemberIds,
        winner,
        createdById,
        replayKey,
      });

      // 같이 게임을 했는데 카톡에 글을 안 썼다고 비활동으로 잡히는 구멍을 메운다.
      // 날짜를 뒤로 당기지는 않는다 — 관리자가 지난 경기를 소급 입력할 수 있다.
      await tx.member.updateMany({
        where: { id: { in: memberIds }, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: playedAt } }] },
        data: { lastActiveAt: playedAt },
      });

      return result;
    },
    { timeout: 20000 },
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/dashboard && npx vitest run lib/mutations/save-replay-import.test.ts`
Expected: PASS — 9 passed

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/mutations/save-replay-import.ts apps/dashboard/lib/mutations/save-replay-import.test.ts
git commit -m "feat(replay-import): save the confirmed matching as accounts, a game and activity"
```

---

### Task 9: 화면 — `/replay-import`

`/kakao-import`의 형제 페이지다. 확정된 슬롯은 한 줄로 조용히 두고 미해결 슬롯만 펼친다 — 10명 중 8명이 자동인데 모달을 10번 띄울 이유가 없다.

**Files:**
- Create: `apps/dashboard/app/replay-import/page.tsx`
- Create: `apps/dashboard/app/replay-import/actions.ts`
- Create: `apps/dashboard/components/ReplayImportForm.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `prepareReplayImport`·`PreparedReplayImport`·`ImportSlot`·`SlotStatus`(Task 7), `saveReplayImport`·`ReplayAssignment`(Task 8)
- Produces: `prepareReplayImportAction(formData: FormData): Promise<PreparedReplayImport>`, `saveReplayImportAction(input): Promise<SaveGameResultOutput>`

- [ ] **Step 1: 서버 액션을 만든다**

`apps/dashboard/app/replay-import/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prepareReplayImport, type PreparedReplayImport } from "@/lib/replay-import/prepare-import";
import { saveReplayImport, type ReplayAssignment } from "@/lib/mutations/save-replay-import";

// 파일은 FormData로 받는다. 13.8MB짜리 바이트 배열을 서버 액션 인자로 직렬화하는 것보다
// 싸고, next.config.js의 bodySizeLimit("20mb")이 이미 이 크기를 받도록 잡혀 있다.
export async function prepareReplayImportAction(formData: FormData): Promise<PreparedReplayImport> {
  await requireAdmin();
  const file = formData.get("replay");
  if (!(file instanceof File)) {
    throw new Error("리플레이 파일이 없습니다.");
  }
  return prepareReplayImport(prisma, new Uint8Array(await file.arrayBuffer()));
}

export interface SaveReplayImportActionInput {
  replayKey: string;
  /** "2026-09-05" 형식. Date를 그대로 넘기지 않고 화면이 고른 날짜 문자열을 받는다. */
  playedAt: string;
  winner: "BLUE" | "RED";
  assignments: ReplayAssignment[];
}

export async function saveReplayImportAction(input: SaveReplayImportActionInput) {
  const admin = await requireAdmin();
  // createdById는 세션에서만 온다. 클라이언트가 보낸 값을 쓰면 아무나 남의 이름으로
  // 입력 기록을 남길 수 있다 — saveGameResultAction과 같은 규칙이다.
  const result = await saveReplayImport(prisma, {
    ...input,
    playedAt: new Date(input.playedAt),
    createdById: admin.id,
  });
  revalidatePath("/replay-import");
  revalidatePath("/match-history");
  revalidatePath("/matches");
  revalidatePath("/members");
  revalidatePath("/inactive");
  return result;
}
```

- [ ] **Step 2: 페이지를 만든다**

`apps/dashboard/app/replay-import/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { ReplayImportForm } from "@/components/ReplayImportForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell이 사이드바 배지를 위해 Postgres를 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function ReplayImportPage() {
  const isAdmin = (await getCurrentAdmin()) !== null;

  return (
    <AppShell
      activeNav="replay-import"
      pageTitle="리플레이 불러오기"
      pageDesc="롤 클라이언트의 .rofl 파일 업로드 → 참가자 매칭 → 내전 결과 저장"
    >
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <ReplayImportForm isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: 사이드바에 넣는다**

`apps/dashboard/components/AppShell.tsx`의 `activeNav` 유니언에 `"matches"` 다음 줄로 추가:

```ts
    | "replay-import"
```

그리고 "내전 관리" 그룹의 `matches` 항목 **다음**에 추가:

```ts
        { key: "replay-import", href: "/replay-import", label: "리플레이 불러오기" },
```

- [ ] **Step 4: 업로드 폼과 슬롯 화면을 만든다 (1/3 — 상태와 헬퍼)**

`apps/dashboard/components/ReplayImportForm.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { prepareReplayImportAction, saveReplayImportAction } from "@/app/replay-import/actions";
import type { ImportSlot, PreparedReplayImport } from "@/lib/replay-import/prepare-import";

// 화면이 관리하는 상태. manual은 관리자가 직접 고른 것이라 확정(녹색)으로 친다.
type Resolution = "confirmed" | "auto" | "outsider" | "manual" | "unresolved";

interface SlotState {
  memberId: string | null;
  resolution: Resolution;
}

const STRIPE: Record<Resolution, string> = {
  confirmed: "#70AD47",
  manual: "#70AD47",
  auto: "#4472C4",
  outsider: "#5C6577",
  unresolved: "#C9A227",
};

const STATUS_LABEL: Record<Resolution, string> = {
  confirmed: "확정",
  manual: "직접 선택",
  auto: "자동",
  outsider: "회원 아님",
  unresolved: "미해결",
};

const POSITION_LABEL: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서폿",
};

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, "0")}초`;
}

/** <input type="date">가 읽는 형식. 파일의 lastModified가 기본값이다 — 파일에 벽시계 시각이 없다. */
function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function initialState(slots: ImportSlot[]): Record<string, SlotState> {
  return Object.fromEntries(
    slots.map((s) => [s.puuid, { memberId: s.memberId, resolution: s.status as Resolution }]),
  );
}
```

- [ ] **Step 5: 업로드 폼과 슬롯 화면을 만든다 (2/3 — 컴포넌트 본체와 업로드)**

같은 파일에 이어서:

```tsx
export function ReplayImportForm({ isAdmin }: { isAdmin: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedReplayImport | null>(null);
  const [state, setState] = useState<Record<string, SlotState>>({});
  const [playedAt, setPlayedAt] = useState<string>(toDateInput(new Date()));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragleave는 자식 요소로 들어갈 때도 올라온다 — KakaoImportForm과 같은 이유로 깊이를 센다.
  const dragDepth = useRef(0);

  const unresolved = useMemo(
    () => Object.values(state).filter((s) => s.resolution === "unresolved").length,
    [state],
  );
  const takenMemberIds = useMemo(
    () => new Set(Object.values(state).map((s) => s.memberId).filter((id): id is string => id !== null)),
    [state],
  );
  const labelOf = (memberId: string) => prepared?.members.find((m) => m.id === memberId)?.label ?? memberId;

  async function accept(picked: File | null | undefined) {
    if (!picked) return;
    setSavedCount(null);
    if (!picked.name.toLowerCase().endsWith(".rofl")) {
      setFile(null);
      setError("rofl 파일만 올릴 수 있습니다.");
      return;
    }
    setError(null);
    setFile(picked);
    setPlayedAt(toDateInput(new Date(picked.lastModified)));

    setIsBusy(true);
    try {
      const form = new FormData();
      form.append("replay", picked);
      const result = await prepareReplayImportAction(form);
      setPrepared(result);
      setState(initialState(result.slots));
    } catch (e) {
      setPrepared(null);
      setError(e instanceof Error ? e.message : "리플레이를 읽는 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  function assign(puuid: string, memberId: string | null, resolution: Resolution) {
    setState((prev) => ({ ...prev, [puuid]: { memberId, resolution } }));
  }

  async function handleSave() {
    if (!prepared || unresolved > 0) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await saveReplayImportAction({
        replayKey: prepared.replayKey,
        playedAt,
        winner: prepared.winner,
        assignments: prepared.slots.map((s) => ({
          puuid: s.puuid,
          gameName: s.gameName,
          tagLine: s.tagLine,
          team: s.team,
          memberId: state[s.puuid].memberId,
        })),
      });
      setSavedCount(result.updates.length);
      setPrepared(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }
```

- [ ] **Step 6: 업로드 폼과 슬롯 화면을 만든다 (3/3 — 렌더)**

같은 컴포넌트 안에 이어서. 확정된 슬롯은 한 줄, 미해결 슬롯만 펼친다:

```tsx
  function renderSlot(slot: ImportSlot) {
    const current = state[slot.puuid];
    const isOpen = current.resolution === "unresolved";
    const others = prepared!.members.filter((m) => !takenMemberIds.has(m.id) || m.id === current.memberId);

    return (
      <div
        key={slot.puuid}
        className="flex gap-2.5 rounded-lg border border-white/[.06] bg-[#0F131B] p-2.5"
        style={{ borderLeft: `3px solid ${STRIPE[current.resolution]}` }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            {/* 이름 매칭이 실패해도 "와윅 15/2/4 탑"을 보면 사람은 누구인지 안다. */}
            <span className="text-[13.5px] font-bold">{slot.champion}</span>
            <span className="font-mono text-[12.5px] text-[#B7C0D0]">
              {slot.kills}/{slot.deaths}/{slot.assists}
            </span>
            <span className="text-[12px] text-[#6E7889]">
              {POSITION_LABEL[slot.position] ?? slot.position} · {slot.cs}CS · Lv{slot.level}
            </span>
          </div>
          <div className="truncate text-[12px] text-[#8A94A6]">
            {slot.gameName}#{slot.tagLine}
            {slot.wasAfk && <span className="ml-1.5 text-[#EE8B8B]">AFK</span>}
            {slot.wasLeaver && <span className="ml-1.5 text-[#EE8B8B]">탈주</span>}
          </div>

          {!isOpen ? (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-[#E6EAF2]">
                {current.memberId ? labelOf(current.memberId) : "회원 아님"}
              </span>
              <span className="text-[11.5px]" style={{ color: STRIPE[current.resolution] }}>
                {STATUS_LABEL[current.resolution]}
              </span>
              <button
                type="button"
                onClick={() => assign(slot.puuid, null, "unresolved")}
                className="cursor-pointer text-[11.5px] text-[#6E7889] underline"
              >
                바꾸기
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* 후보를 드롭다운에 숨기지 않는다. 근거와 점수가 보여야 관리자가 잘못된 매칭을 잡아낸다. */}
              <div className="flex flex-wrap gap-1.5">
                {slot.candidates.map((c) => (
                  <button
                    key={c.memberId}
                    type="button"
                    onClick={() => assign(slot.puuid, c.memberId, "manual")}
                    className="cursor-pointer rounded-md border border-[#4472C4]/40 bg-[#4472C4]/[.12] px-2 py-1 text-left"
                  >
                    <span className="text-[12.5px] font-bold text-[#8FB4F5]">{c.label}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-[#6E7889]">{c.score}</span>
                    <span className="ml-1.5 text-[11px] text-[#6E7889]">{c.reasons.join(" · ")}</span>
                  </button>
                ))}
                {slot.candidates.length === 0 && (
                  <span className="text-[11.5px] text-[#6E7889]">후보 없음 — 직접 고르거나 회원 아님으로 두세요</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => e.target.value && assign(slot.puuid, e.target.value, "manual")}
                  className="rounded-md border border-white/[.12] bg-[#151A24] px-2 py-1 text-[12.5px]"
                >
                  <option value="">회원 직접 선택…</option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => assign(slot.puuid, null, "outsider")}
                  className="cursor-pointer rounded-md border border-white/[.12] px-2 py-1 text-[12.5px] text-[#8A94A6]"
                >
                  회원 아님
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
```

이어서 컴포넌트의 `return`문:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-bold">리플레이 파일 (.rofl) 업로드</span>
          <span className="text-[12px] text-[#6E7889]">
            롤 클라이언트 &gt; 내 기록에서 내려받은 파일입니다. 같은 경기를 두 번 올리면 거부됩니다.
          </span>
        </div>
        {isAdmin ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".rofl"
              onChange={(e) => accept(e.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setIsDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setIsDragging(false);
                if (!isBusy) accept(e.dataTransfer.files?.[0]);
              }}
              disabled={isBusy}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
                isDragging
                  ? "border-[#70AD47] bg-[#70AD47]/[.10]"
                  : "border-white/[.14] bg-[#0F131B] hover:border-white/[.24] hover:bg-[#131926]"
              }`}
            >
              <span className="text-[13.5px] font-bold text-[#B7C0D0]">
                {isDragging ? "여기에 놓으세요" : "rofl 파일을 끌어다 놓거나 클릭해서 선택"}
              </span>
              <span className="text-[12px] text-[#6E7889]">{file ? file.name : "리플레이 파일 하나"}</span>
            </button>
          </>
        ) : (
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[12.5px] text-[#8A94A6]">
            변경하려면 관리자 로그인이 필요합니다.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[12px] text-[#EE8B8B]">
            {error}
          </div>
        )}
        {savedCount !== null && (
          <div className="rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[12px] text-[#9BD173]">
            저장했습니다. {savedCount}명의 MMR이 갱신됐습니다.
          </div>
        )}
      </div>

      {prepared && (
        <div className="flex flex-col gap-4 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13.5px] font-bold">
              {prepared.winner === "BLUE" ? "블루 승" : "레드 승"}
            </span>
            <span className="text-[12px] text-[#6E7889]">
              패치 {prepared.gameVersion} · {formatDuration(prepared.gameLengthMs)}
            </span>
            {/* 검증 칩. AFK·탈주가 있어도 막지 않는다 — 판단은 관리자 몫이다. */}
            {prepared.slots.some((s) => s.wasAfk) ? (
              <span className="rounded-md bg-[#C9A227]/[.15] px-2 py-0.5 text-[11.5px] text-[#C9A227]">AFK 있음</span>
            ) : (
              <span className="rounded-md bg-[#70AD47]/[.12] px-2 py-0.5 text-[11.5px] text-[#9BD173]">AFK 없음</span>
            )}
            {prepared.slots.some((s) => s.wasLeaver) && (
              <span className="rounded-md bg-[#C9A227]/[.15] px-2 py-0.5 text-[11.5px] text-[#C9A227]">탈주 있음</span>
            )}
            {prepared.endedInSurrender && (
              <span className="rounded-md bg-white/[.06] px-2 py-0.5 text-[11.5px] text-[#8A94A6]">항복 종료</span>
            )}
            <span
              className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-bold"
              style={{
                color: unresolved > 0 ? "#C9A227" : "#9BD173",
                background: unresolved > 0 ? "rgba(201,162,39,.15)" : "rgba(112,173,71,.12)",
              }}
            >
              미해결 {unresolved}
            </span>
          </div>

          <label className="flex w-fit items-center gap-2 text-[12.5px] text-[#8A94A6]">
            경기 날짜
            {/* 리플레이에 벽시계 시각이 없다. 파일의 lastModified를 기본값으로 두고 고치게 한다. */}
            <input
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
              className="rounded-md border border-white/[.12] bg-[#0F131B] px-2 py-1 text-[12.5px] text-[#E6EAF2]"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["BLUE", "RED"] as const).map((team) => (
              <div key={team} className="flex flex-col gap-2">
                <div className="text-[12.5px] font-bold text-[#8A94A6]">
                  {team === "BLUE" ? "블루팀" : "레드팀"}
                  {prepared.winner === team && <span className="ml-1.5 text-[#9BD173]">승</span>}
                </div>
                {prepared.slots.filter((s) => s.team === team).map(renderSlot)}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={!isAdmin || isBusy || unresolved > 0}
            className={`w-fit rounded-lg px-4 py-2 text-[13.5px] font-extrabold ${
              isAdmin && !isBusy && unresolved === 0
                ? "cursor-pointer bg-[#70AD47] text-[#0E1117]"
                : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            {isBusy ? "처리 중..." : unresolved > 0 ? `미해결 ${unresolved}명을 먼저 처리하세요` : "경기 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 타입과 빌드가 통과하는지 확인한다**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build --workspace=dashboard`
Expected: 성공. `/replay-import`가 라우트 목록에 `ƒ (Dynamic)`으로 뜬다.

- [ ] **Step 8: 실제 파일로 한 번 돌려 본다**

Run: `npm run dev --workspace=dashboard`

`http://localhost:3000/replay-import`에서 관리자로 로그인한 뒤 `data/KR-8374660628.rofl`을 올린다. 확인할 것:
- 헤더에 `패치 16.17.810.4348 · 26분 24초`, 레드 승
- 슬롯 10개가 팀별 5개씩, 챔피언·KDA·포지션이 보인다
- 미해결 슬롯에 후보 칩이 점수·근거와 함께 뜬다
- 10명을 모두 해결하기 전에는 저장 버튼이 잠겨 있다
- 저장 후 같은 파일을 다시 올리면 "이미 등록된 경기입니다."
- `/match-history`에 경기가, `/members`에 갱신된 MMR이 보인다

- [ ] **Step 9: 커밋**

```bash
git add apps/dashboard/app/replay-import apps/dashboard/components/ReplayImportForm.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(replay-import): add the upload and matching screen"
```

---

### Task 10: 전체 검증과 문서 갱신

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1–9 전부
- Produces: 없음

- [ ] **Step 1: 전체 테스트를 돌린다**

Run: `npm test`
Expected: 세 워크스페이스 전부 통과. `apps/discord-bot`은 이 기능을 건드리지 않았으므로 그대로여야 한다.

- [ ] **Step 2: `CLAUDE.md`에 이 기능을 기록한다**

"KakaoTalk import" 문단 **다음**에 문단을 더한다:

```markdown
`.rofl` 리플레이 임포트(`apps/dashboard/lib/replay-import/`)는 파일 맨 뒤의 **평문 JSON**만
읽는다(`parseRoflMetadata`). 마지막 4바이트가 그 JSON의 길이(u32 LE)이고, `statsJson`은
문자열로 한 번 더 감싸여 있어 두 번 파싱해야 한다. 앞쪽 zstd 청크는 열지 않으므로 압축
의존성도 패치 종속성도 없다. 참가자 값은 전부 문자열이고 `NAME`은 비어 있다 — 신원은
`PUUID`와 `RIOT_ID_GAME_NAME`/`RIOT_ID_TAG_LINE`에서 온다.

`RiotAccount`는 **리플레이에서 관측된 계정으로만** 만든다. 카톡·디코 닉네임에 적힌 Riot
ID와 `Member.riotId`는 사람이 손으로 적은 값이라 오타·태그 누락이 흔하고, 그대로 저장하면
한 사람의 계정이 표기별로 여러 행이 된다. 그 값들은 계정이 아니라 **매칭 힌트**이며
`scoreRiotAccountMatch`가 셋 중 가장 센 신호 하나만 센다. 포지션은 가산점 전용이라 다른
신호가 0이면 후보가 되지 않는다. 자동 배정은 `점수 >= 100 && 1위−2위 >= 40`일 때만 한다.

멱등성은 `GameResult.replayKey`(정렬한 PUUID 10개 + gameLength의 SHA-256)로 잡는다 —
리플레이에는 시간 축이 없어 카톡 임포트의 워터마크 방식을 쓸 수 없다. 따라서 **취소된
경기의 리플레이는 다시 올릴 수 없다**: 유니크 제약이 취소 여부를 보지 않는다.

`saveGameResult`의 "디코 AND 카톡" 규칙에 "PUUID가 있는 `RiotAccount`가 붙어 있으면 갈음"이
더해져 있다(`getLinkedMembers`도 같다). `saveReplayImport`가 계정을 먼저 등록하고 경기를
저장하므로, 리플레이에 배정된 회원은 그 순간 이 조건을 충족한다 — 리플레이가 그 사람이 그
경기를 뛰었다는 1차 증거라는 설계를 그대로 옮긴 것이다. 짝으로 `absorbMember`가 흡수 대상의
`GameParticipant`와 `RiotAccount`를 생존자로 옮기고 `releaseMember`가 되돌린다. 되돌리는
근거는 두 테이블의 `absorbedFromId`이고, 값은 **비어 있을 때만** 채운다 — 이미 이관된 행의
원주인이 덮이면 되돌릴 길이 없어진다. 생존자와 흡수 대상이 같은 경기에 둘 다 있으면
`@@unique([gameResultId, memberId])`에 막히므로 병합을 거부한다.

경기 저장은 참가 회원의 `lastActiveAt`도 경기 날짜로 올린다(뒤로 당기지는 않는다). 그래서
`release-member.ts`의 `recomputeLastActiveAt`은 멘션 로그뿐 아니라 취소되지 않은 경기의
`playedAt`도 함께 본다.
```

"Known inconsistencies" 절에 한 줄 더한다:

```markdown
- 취소한 경기의 리플레이는 `GameResult.replayKey`의 유니크 제약 때문에 다시 올릴 수 없다.
  되살리려면 그 행의 `replayKey`를 손으로 지워야 한다.
```

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: record the rofl replay import and its matching rules"
```

---

## 이 계획이 스펙에서 벗어난 곳

구현자가 판단할 수 있도록 명시한다.

1. **`absorbedFromId` 컬럼은 이 계획이 정했다.** 스펙은 "정확히 되돌려야 한다"고만 적고
   방법을 정하지 않았다. Task 4의 설계 근거 참고.
2. **`saveReplayImport`가 계정을 먼저 등록한다.** 그 결과 배정된 회원은 전부 완화 조건을
   충족하므로, 리플레이 임포트 경로에서는 "디코 AND 카톡" 검사가 사실상 통과한다. 스펙의
   의도(리플레이가 1차 증거)와 같은 방향이지만, 검사 순서를 뒤집으면 동작이 달라진다.
3. **취소된 경기의 재업로드는 막힌다.** 스펙에 언급이 없고, `replayKey`의 유니크 제약이
   `cancelledAt`을 보지 않기 때문이다. 알려진 한계로 기록만 한다.
4. **`LinkedMemberOption.discordName`이 `"(디코 없음)"`이 될 수 있다.** 리플레이로만 확인된
   회원이 수동 입력 풀에 들어오면서 생긴 결과다. `MatchBuilder`가 이 값을 그대로 표시한다.
5. **스펙의 화면 목업과 다른 점.** 목업의 3px 스트라이프·확정 슬롯 한 줄·후보 칩·저장 게이트는
   그대로 옮겼다. "전체 회원 검색"은 검색 입력 대신 `<select>`로 뒀다 — 40명 규모에서는
   드롭다운이 더 빠르고 코드가 훨씬 작다. 회원이 늘어 불편해지면 그때 바꾼다.
