import type { MemberTier } from "@lolpamin/db";
import { memberTierFromRank } from "@lolpamin/core";
import { riotGet, type LookupDeps, type LookupFailure } from "./request";

// tier null: 이번 시즌 솔로랭크 배치를 안 끝냈다(언랭).
export type SoloRankLookupResult = { ok: true; tier: MemberTier | null } | { ok: false; reason: LookupFailure };

export type LookupSoloRank = (puuid: string) => Promise<SoloRankLookupResult>;

const LEAGUE_V4 = "https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid";

/**
 * 계정 하나의 현재 솔로랭크 티어. League-V4는 현재 시즌만 준다 — 지난 시즌 기록은 공식
 * API 어디에도 없어서, 최고티어는 이 값을 배치마다 받아 올라갈 때만 올리는 식으로 쌓인다.
 */
export async function lookupSoloRank(puuid: string, deps: LookupDeps = {}): Promise<SoloRankLookupResult> {
  const result = await riotGet(`${LEAGUE_V4}/${encodeURIComponent(puuid)}`, deps);
  if (!result.ok) return result;
  const rows = result.body as Array<{ queueType: string; tier: string; rank: string; leaguePoints: number }>;
  const solo = rows.find((row) => row.queueType === "RANKED_SOLO_5x5");
  return { ok: true, tier: solo ? memberTierFromRank(solo.tier, solo.rank, solo.leaguePoints) : null };
}
