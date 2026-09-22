export interface RiotAccountLookup {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export type LookupFailure = "not_found" | "unauthorized" | "rate_limited" | "unavailable";

export type LookupResult = { ok: true; account: RiotAccountLookup } | { ok: false; reason: LookupFailure };

export type LookupRiotAccount = (gameName: string, tagLine: string) => Promise<LookupResult>;

export type LookupRiotAccountByPuuid = (puuid: string) => Promise<LookupResult>;

export interface LookupDeps {
  fetch?: typeof fetch;
  apiKey?: string;
}

// 한국 계정은 asia 라우팅이다. Account-V1은 지역이 아니라 라우팅 값(americas/asia/europe)을 쓴다.
const ACCOUNT_V1 = "https://asia.api.riotgames.com/riot/account/v1/accounts";

/**
 * 네트워크와 라이엇 응답 형식을 아는 유일한 자리다.
 *
 * 실패를 던지지 않고 결과로 돌려준다 — 배치가 한 건의 404 때문에 멈추면 안 되고,
 * 키 만료(401/403)는 호출자가 즉시 중단할 수 있어야 한다.
 */
async function requestAccount(path: string, deps: LookupDeps): Promise<LookupResult> {
  const apiKey = deps.apiKey ?? process.env.RIOT_API_KEY ?? "";
  // 키가 없으면 어차피 401이다. 호출을 아껴 곧바로 같은 답을 낸다.
  if (apiKey.length === 0) return { ok: false, reason: "unauthorized" };

  const doFetch = deps.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(`${ACCOUNT_V1}/${path}`, {
      headers: { "X-Riot-Token": apiKey },
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  const body = (await response.json()) as { puuid: string; gameName: string; tagLine: string };
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
