import { describe, expect, it, vi } from "vitest";
import { lookupSoloRank } from "./league";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

const entry = (queueType: string, tier: string, rank: string, leaguePoints: number) => ({
  queueType, tier, rank, leaguePoints, wins: 10, losses: 10, puuid: "p",
});

describe("lookupSoloRank", () => {
  it("maps the solo queue entry and ignores flex", async () => {
    const fetch = fakeFetch(200, [entry("RANKED_FLEX_SR", "DIAMOND", "I", 0), entry("RANKED_SOLO_5x5", "GOLD", "II", 40)]);

    expect(await lookupSoloRank("p", { fetch, apiKey: "k" })).toEqual({ ok: true, tier: "GOLD_2" });
  });

  it("answers null for an account with no solo queue entry", async () => {
    const fetch = fakeFetch(200, [entry("RANKED_FLEX_SR", "GOLD", "I", 0)]);

    expect(await lookupSoloRank("p", { fetch, apiKey: "k" })).toEqual({ ok: true, tier: null });
    expect(await lookupSoloRank("p", { fetch: fakeFetch(200, []), apiKey: "k" })).toEqual({ ok: true, tier: null });
  });

  it("calls the kr platform host with the encoded puuid", async () => {
    const fetch = fakeFetch(200, []);

    await lookupSoloRank("a/b", { fetch, apiKey: "k" });

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/a%2Fb");
  });

  it("passes failures through", async () => {
    expect(await lookupSoloRank("p", { fetch: fakeFetch(400), apiKey: "k" })).toEqual({ ok: false, reason: "invalid_id" });
    expect(await lookupSoloRank("p", { fetch: fakeFetch(403), apiKey: "k" })).toEqual({ ok: false, reason: "unauthorized" });
  });
});
