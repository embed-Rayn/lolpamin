import type { MemberTier } from "@lolpamin/db";
import { riotGet, type LookupDeps, type LookupFailure } from "./request";

export type SoloRankResult = { ok: true; tier: MemberTier } | { ok: false; reason: LookupFailure };

/** Current solo rank only; Riot does not expose an all-time peak here. */
export async function lookupSoloRank(puuid: string, deps: LookupDeps = {}): Promise<SoloRankResult> {
  try {
    const result = await riotGet(`https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, deps);
    if (!result.ok) return result;
    if (!Array.isArray(result.body) || result.body.some(e => !e || typeof e.queueType !== "string")) return { ok: false, reason: "unavailable" };
    const solo = result.body.filter(e => e.queueType === "RANKED_SOLO_5x5");
    if (!solo.length) return { ok: true, tier: "UNRANKED" };
    if (solo.length !== 1) return { ok: false, reason: "unavailable" };
    const { tier, rank, leaguePoints: lp } = solo[0];
    if (!Number.isInteger(lp) || lp < 0) return { ok: false, reason: "unavailable" };
    if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)) {
      return { ok: true, tier: lp >= 1000 ? "MASTER_1000_PLUS" : lp >= 800 ? "MASTER_800_1000" : lp >= 600 ? "MASTER_600_800" : lp >= 400 ? "MASTER_400_600" : lp >= 200 ? "MASTER_200_400" : "MASTER_0_200" };
    }
    const division = ["I", "II", "III", "IV"].indexOf(rank) + 1;
    if (!division || !["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"].includes(tier)) return { ok: false, reason: "unavailable" };
    return { ok: true, tier: tier === "IRON" ? "IRON" : `${tier}_${division}` as MemberTier };
  } catch { return { ok: false, reason: "unavailable" }; }
}
