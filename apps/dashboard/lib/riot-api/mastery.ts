import type { MasteryEntry } from "@lolpamin/core";
import { riotGet, type LookupDeps, type LookupFailure } from "./request";

export type MasteryLookupResult = { ok: true; masteries: MasteryEntry[] } | { ok: false; reason: LookupFailure };

export type LookupChampionMasteries = (puuid: string) => Promise<MasteryLookupResult>;

// Champion-Mastery-V4는 Account-V1과 달리 플랫폼 호스트(kr)를 쓴다.
const MASTERY_V4 = "https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid";

/**
 * 계정 하나의 전체 숙련도 목록. `/top`이 아니라 전체를 받는다 — 계정마다 상위 3개만 받으면
 * 두 계정에서 각각 4위인 챔피언이 합산으로는 1위가 되는 경우를 놓친다. 호출 수는 같다.
 */
export async function lookupChampionMasteries(puuid: string, deps: LookupDeps = {}): Promise<MasteryLookupResult> {
  const result = await riotGet(`${MASTERY_V4}/${encodeURIComponent(puuid)}`, deps);
  if (!result.ok) return result;
  const rows = result.body as Array<{ championId: number; championLevel: number; championPoints: number }>;
  return {
    ok: true,
    masteries: rows.map((row) => ({ championId: row.championId, level: row.championLevel, points: row.championPoints })),
  };
}
