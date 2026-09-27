export interface RateWindow {
  limit: number;
  ms: number;
}

// Riot development-key limits: 20 requests per second and 100 per two minutes, counted per key
// across every endpoint.
export const RIOT_RATE_WINDOWS: RateWindow[] = [
  { limit: 20, ms: 1_000 },
  { limit: 100, ms: 120_000 },
];

// Riot counts on its own clock. A little slack keeps a request that lands right on a window's
// edge from being counted in the window it just left.
const EDGE_MARGIN_MS = 50;

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Returns `acquire()`, which resolves once another request fits in every window. Callers are
 * served one at a time in arrival order, so two batches started together share the limit instead
 * of each thinking it has all of it.
 */
export function createRateLimiter(windows: RateWindow[], clock: Clock = realClock): () => Promise<void> {
  const longest = Math.max(...windows.map((w) => w.ms));
  let stamps: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  async function waitForRoom(): Promise<void> {
    for (;;) {
      const now = clock.now();
      stamps = stamps.filter((t) => t > now - longest);

      let wait = 0;
      for (const w of windows) {
        const inWindow = stamps.filter((t) => t > now - w.ms);
        if (inWindow.length >= w.limit) {
          // Room opens when the request `limit` places back leaves the window.
          const opensAt = inWindow[inWindow.length - w.limit] + w.ms + EDGE_MARGIN_MS;
          wait = Math.max(wait, opensAt - now);
        }
      }

      if (wait <= 0) {
        stamps.push(now);
        return;
      }
      await clock.sleep(wait);
    }
  }

  return () => {
    const turn = queue.then(waitForRoom);
    queue = turn.catch(() => {});
    return turn;
  };
}

// One limiter for the whole server process: every Riot call goes through riotGet, and the limit
// belongs to the key, not to a batch.
export const acquireRiotRequest = createRateLimiter(RIOT_RATE_WINDOWS);
