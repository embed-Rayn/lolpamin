import { describe, expect, it, vi } from "vitest";
import { lookupSoloRank } from "./solo-rank";

const solo = { queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 35 };
describe("solo rank lookup", () => {
  it("uses the official KR endpoint, shared limiter and server-side token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([solo])));
    const acquire = vi.fn();
    expect(await lookupSoloRank("a/b", { fetch, acquire, apiKey: "test-key" })).toEqual({ ok: true, tier: "DIAMOND_2" });
    expect(acquire).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/a%2Fb", expect.objectContaining({ headers: { "X-Riot-Token": "test-key" }, cache: "no-store" }));
  });
  it.each([[[], "UNRANKED"], [[{ ...solo, queueType: "RANKED_FLEX_SR" }], "UNRANKED"], [[{ ...solo, tier: "CHALLENGER", leaguePoints: 1100 }], "MASTER_1000_PLUS"], [[{ ...solo, tier: "IRON" }], "IRON"]])("maps the current solo rank into the existing tier model", async (body, tier) => {
    expect(await lookupSoloRank("id", { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(body))), acquire: async () => {}, apiKey: "test" })).toEqual({ ok: true, tier });
  });
  it.each([403, 429, 500])("does not turn HTTP %i into unranked", async status => {
    expect((await lookupSoloRank("id", { fetch: vi.fn().mockResolvedValue(new Response("", { status })), acquire: async () => {}, apiKey: "test" })).ok).toBe(false);
  });
  it.each([{}, [null], [{ ...solo, tier: "INVALID" }], [{ ...solo, rank: "V" }], [{ ...solo, leaguePoints: -1 }]])("rejects malformed rank data", async body => {
    expect((await lookupSoloRank("id", { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(body))), acquire: async () => {}, apiKey: "test" })).ok).toBe(false);
  });
});
