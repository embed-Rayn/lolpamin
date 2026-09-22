import { describe, expect, it, vi } from "vitest";
import { lookupRiotAccount, lookupRiotAccountByPuuid } from "./account";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("lookupRiotAccount", () => {
  it("returns the account on 200", async () => {
    const fetch = fakeFetch(200, { puuid: "p-1", gameName: "늑 구", tagLine: "KR1" });

    const result = await lookupRiotAccount("늑 구", "kr1", { fetch, apiKey: "RGAPI-test" });

    expect(result).toEqual({ ok: true, account: { puuid: "p-1", gameName: "늑 구", tagLine: "KR1" } });
  });

  it("calls the asia routing host with encoded path segments and the token header", async () => {
    const fetch = fakeFetch(200, { puuid: "p", gameName: "늑 구", tagLine: "KR1" });

    await lookupRiotAccount("늑 구", "kr1", { fetch, apiKey: "RGAPI-test" });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent("늑 구")}/kr1`,
    );
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("RGAPI-test");
  });

  it("maps 404 to not_found", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(404), apiKey: "k" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("maps 401 and 403 to unauthorized", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(401), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(403), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("maps 429 to rate_limited", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(429), apiKey: "k" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("maps other statuses and thrown errors to unavailable", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(503), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const throwing = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await lookupRiotAccount("x", "y", { fetch: throwing, apiKey: "k" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns unauthorized without calling fetch when the key is empty", async () => {
    const fetch = fakeFetch(200, {});

    const result = await lookupRiotAccount("x", "y", { fetch, apiKey: "" });

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("lookupRiotAccountByPuuid", () => {
  it("calls the by-puuid path and returns the current riot id", async () => {
    const fetch = fakeFetch(200, { puuid: "p-1", gameName: "새이름", tagLine: "KR2" });

    const result = await lookupRiotAccountByPuuid("p-1", { fetch, apiKey: "RGAPI-test" });

    expect(result).toEqual({ ok: true, account: { puuid: "p-1", gameName: "새이름", tagLine: "KR2" } });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://asia.api.riotgames.com/riot/account/v1/accounts/by-puuid/p-1");
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("RGAPI-test");
  });

  it("maps failures the same way the by-riot-id lookup does", async () => {
    expect(await lookupRiotAccountByPuuid("p", { fetch: fakeFetch(404), apiKey: "k" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await lookupRiotAccountByPuuid("p", { fetch: fakeFetch(429), apiKey: "k" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});
