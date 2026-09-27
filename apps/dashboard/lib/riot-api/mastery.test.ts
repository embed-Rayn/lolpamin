import { describe, expect, it, vi } from "vitest";
import { lookupChampionMasteries } from "./mastery";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("lookupChampionMasteries", () => {
  it("maps the response rows to mastery entries", async () => {
    const fetch = fakeFetch(200, [
      { puuid: "p", championId: 266, championLevel: 12, championPoints: 150000, lastPlayTime: 0 },
      { puuid: "p", championId: 48, championLevel: 5, championPoints: 20000, lastPlayTime: 0 },
    ]);

    const result = await lookupChampionMasteries("p", { fetch, apiKey: "k" });

    expect(result).toEqual({
      ok: true,
      masteries: [
        { championId: 266, level: 12, points: 150000 },
        { championId: 48, level: 5, points: 20000 },
      ],
    });
  });

  it("calls the kr platform host with the encoded puuid and the token header", async () => {
    const fetch = fakeFetch(200, []);

    await lookupChampionMasteries("a/b", { fetch, apiKey: "RGAPI-test" });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/a%2Fb",
    );
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("RGAPI-test");
  });

  it("maps failures the same way the account lookup does", async () => {
    const at = (status: number) => lookupChampionMasteries("p", { fetch: fakeFetch(status), apiKey: "k" });
    expect(await at(404)).toEqual({ ok: false, reason: "not_found" });
    expect(await at(403)).toEqual({ ok: false, reason: "unauthorized" });
    expect(await at(429)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await at(500)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("answers unauthorized without calling when there is no key", async () => {
    const fetch = fakeFetch(200, []);
    expect(await lookupChampionMasteries("p", { fetch, apiKey: "" })).toEqual({ ok: false, reason: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
