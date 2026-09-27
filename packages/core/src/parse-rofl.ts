/** What a replay says about one player and what the detail board shows. Stored per game in ReplayPlayerStat. */
export interface ReplayPlayerStats {
  /** 계정 정체성. 인게임 닉을 바꿔도 변하지 않는다. */
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  /** TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY. 특수한 판에서는 빈 문자열일 수 있다. */
  position: string;
  champion: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  /** summoner.json의 key. */
  spell1: number;
  spell2: number;
  /** runesReforged.json의 핵심 룬 id와 보조 계열 id. */
  keystone: number;
  subStyle: number;
  /** ITEM0..ITEM6. 0은 빈 칸, 마지막은 장신구. */
  items: number[];
  damageDealt: number;
  damageTaken: number;
  controlWards: number;
  wardsPlaced: number;
  wardsKilled: number;
  gold: number;
  baronKills: number;
  dragonKills: number;
  heraldKills: number;
  hordeKills: number;
  atakhanKills: number;
  turretKills: number;
  inhibitorKills: number;
}

export interface ReplayPlayer extends ReplayPlayerStats {
  win: boolean;
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
const ITEM_SLOTS = 7;

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
 * 패치 종속성도 생기지 않는다 — 필요한 값(참가자·팀·승패·길이·상세 스탯)이 전부 꼬리에 있다.
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
    spell1: toInt(raw.SUMMONER_SPELL_1),
    spell2: toInt(raw.SUMMONER_SPELL_2),
    keystone: toInt(raw.KEYSTONE_ID),
    subStyle: toInt(raw.PERK_SUB_STYLE),
    items: Array.from({ length: ITEM_SLOTS }, (_, i) => toInt(raw[`ITEM${i}`])),
    damageDealt: toInt(raw.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
    damageTaken: toInt(raw.TOTAL_DAMAGE_TAKEN),
    controlWards: toInt(raw.VISION_WARDS_BOUGHT_IN_GAME),
    wardsPlaced: toInt(raw.WARD_PLACED),
    wardsKilled: toInt(raw.WARD_KILLED),
    gold: toInt(raw.GOLD_EARNED),
    baronKills: toInt(raw.BARON_KILLS),
    dragonKills: toInt(raw.DRAGON_KILLS),
    heraldKills: toInt(raw.RIFT_HERALD_KILLS),
    hordeKills: toInt(raw.HORDE_KILLS),
    atakhanKills: toInt(raw.ATAKHAN_KILLS),
    turretKills: toInt(raw.TURRETS_KILLED),
    inhibitorKills: toInt(raw.BARRACKS_KILLED),
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
