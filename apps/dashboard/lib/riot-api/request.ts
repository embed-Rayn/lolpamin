export type LookupFailure = "not_found" | "unauthorized" | "rate_limited" | "unavailable";

export interface LookupDeps {
  fetch?: typeof fetch;
  apiKey?: string;
}

export type RiotGetResult = { ok: true; body: unknown } | { ok: false; reason: LookupFailure };

/**
 * 네트워크와 라이엇 상태 코드를 아는 유일한 자리다.
 *
 * 실패를 던지지 않고 결과로 돌려준다 — 배치가 한 건의 404 때문에 멈추면 안 되고,
 * 키 만료(401/403)는 호출자가 즉시 중단할 수 있어야 한다.
 */
export async function riotGet(url: string, deps: LookupDeps): Promise<RiotGetResult> {
  const apiKey = deps.apiKey ?? process.env.RIOT_API_KEY ?? "";
  // 키가 없으면 어차피 401이다. 호출을 아껴 곧바로 같은 답을 낸다.
  if (apiKey.length === 0) return { ok: false, reason: "unauthorized" };

  const doFetch = deps.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(url, { headers: { "X-Riot-Token": apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  return { ok: true, body: await response.json() };
}
