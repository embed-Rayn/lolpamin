import { describe, expect, it } from "vitest";
import { createRateLimiter, RIOT_RATE_WINDOWS } from "./rate-limit";

// A clock whose sleep advances time instead of waiting.
function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

async function acquireTimes(acquire: () => Promise<void>, n: number, clock: { now: () => number }) {
  const at: number[] = [];
  for (let i = 0; i < n; i++) {
    await acquire();
    at.push(clock.now());
  }
  return at;
}

describe("createRateLimiter", () => {
  it("lets requests through without waiting while every window has room", async () => {
    const clock = fakeClock();
    const acquire = createRateLimiter([{ limit: 3, ms: 1000 }], clock);

    await acquireTimes(acquire, 3, clock);

    expect(clock.sleeps).toEqual([]);
  });

  it("waits for the oldest request to leave a full window", async () => {
    const clock = fakeClock();
    const acquire = createRateLimiter([{ limit: 2, ms: 1000 }], clock);

    const at = await acquireTimes(acquire, 3, clock);

    expect(at[2]).toBeGreaterThanOrEqual(1000);
  });

  it("keeps the Riot development key limits: 20 per second and 100 per two minutes", async () => {
    const clock = fakeClock();
    const acquire = createRateLimiter(RIOT_RATE_WINDOWS, clock);

    const at = await acquireTimes(acquire, 101, clock);

    for (let i = 0; i < at.length; i++) {
      expect(at.filter((t) => t > at[i] - 1000 && t <= at[i]).length).toBeLessThanOrEqual(20);
      expect(at.filter((t) => t > at[i] - 120_000 && t <= at[i]).length).toBeLessThanOrEqual(100);
    }
    // The 101st request had to wait for the two-minute window.
    expect(at[100]).toBeGreaterThanOrEqual(120_000);
  });

  it("serves concurrent callers one at a time without exceeding the window", async () => {
    const clock = fakeClock();
    const acquire = createRateLimiter([{ limit: 2, ms: 1000 }], clock);
    const at: number[] = [];

    await Promise.all([0, 1, 2, 3].map(() => acquire().then(() => at.push(clock.now()))));

    expect(at.sort((a, b) => a - b)[2]).toBeGreaterThanOrEqual(1000);
  });
});
