import { riotGet, type LookupDeps, type LookupFailure } from "./request";

export type { LookupDeps, LookupFailure } from "./request";

export interface RiotAccountLookup {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export type LookupResult = { ok: true; account: RiotAccountLookup } | { ok: false; reason: LookupFailure };

export type LookupRiotAccount = (gameName: string, tagLine: string) => Promise<LookupResult>;

export type LookupRiotAccountByPuuid = (puuid: string) => Promise<LookupResult>;

// 한국 계정은 asia 라우팅이다. Account-V1은 지역이 아니라 라우팅 값(americas/asia/europe)을 쓴다.
const ACCOUNT_V1 = "https://asia.api.riotgames.com/riot/account/v1/accounts";

async function requestAccount(path: string, deps: LookupDeps): Promise<LookupResult> {
  const result = await riotGet(`${ACCOUNT_V1}/${path}`, deps);
  if (!result.ok) return result;
  const body = result.body as { puuid: string; gameName: string; tagLine: string };
  // 응답의 표기를 그대로 쓴다 — 대소문자·공백이 라이엇 쪽 정본으로 정리돼 온다.
  return { ok: true, account: { puuid: body.puuid, gameName: body.gameName, tagLine: body.tagLine } };
}

/** Riot ID → PUUID. 손으로 적은 닉네임 힌트를 계정으로 바꾸는 입구다. */
export async function lookupRiotAccount(
  gameName: string,
  tagLine: string,
  deps: LookupDeps = {},
): Promise<LookupResult> {
  return requestAccount(`by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, deps);
}

/**
 * PUUID → 현재 Riot ID. 인게임에서 이름을 바꿔도 PUUID는 그대로라, 저장해 둔 표기를
 * 되읽는 유일한 방법이다.
 */
export async function lookupRiotAccountByPuuid(puuid: string, deps: LookupDeps = {}): Promise<LookupResult> {
  return requestAccount(`by-puuid/${encodeURIComponent(puuid)}`, deps);
}
