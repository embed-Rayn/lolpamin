# Champion Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/champion-stats` page showing per-champion results of members' replay-backed games, with a per-member breakdown, a member filter and games/KDA sorting.

**Architecture:** The server query returns per-(member, champion) **sums** for one mode and period; a pure function in `packages/core` folds the selected members' sums into champion rows in the browser. Mode and period are URL params (a switch remounts the screen); member selection, sort and expansion are browser state, like `/player-stats`.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, vitest, Tailwind (semantic colour roles only).

**Spec:** `docs/superpowers/specs/2026-10-08-champion-stats-design.md`

## Global Constraints

- UI copy is Korean; identifiers, comments, commit messages English.
- Colours are never hex: use the semantic Tailwind roles (`bg-surface`, `text-muted`, `border-ink/[.06]`, `text-accent-soft`, …). `text-white` only on solid `bg-accent`.
- Pages rendering `AppShell` declare `export const dynamic = "force-dynamic"`.
- Every DB test file starts with the `DATABASE_URL_TEST` guard and calls `resetDatabase()` in `beforeEach`.
- Domain logic in `packages/core` is pure with a unit test; DB logic in `apps/dashboard/lib/queries/` takes `prisma` first.
- Mobile: one breakpoint `md`; desktop view `hidden md:block`, card list `md:hidden`, fed the same rows.
- Only members are counted (participants of non-tombstone members); outsiders never appear.
- Modes never mix: `?mode=RIFT|ARAM`, default RIFT. Periods `year` (default) / `season` / `all`, same rules as `/player-stats`.
- Default sort 많이 나온 순; also KDA 높은 순 / 낮은 순. Perfect (0 deaths) is top for high, bottom for low.

## Review Focus

1. A replay champion id cased differently from Data Dragon (`FiddleSticks` vs `Fiddlesticks`) must fold into one champion row, not two — Task 2 canonicalises in the query and tests it.
2. An ARAM game must never contribute a lane (ARAM replays carry a position string too) — Task 2 tests `lanes` is `{}` in ARAM.
3. Changing the sort must not drop the member selection — Task 3 keeps sort in React state, not the URL; verified in the manual check.
4. A participation whose `ReplayPlayerStat` row is missing, or whose position is unknown, must be skipped / lane-less without crashing — Task 2 tests both.
5. A member with games in only the other mode must not appear in this mode's picker — Task 2 tests `members` per mode.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/champion-stats.ts` (create) | `aggregateChampionStats` — fold sums, averages, KDA, main lane, sort |
| `packages/core/src/champion-stats.test.ts` (create) | unit tests |
| `packages/core/src/index.ts` (modify) | export the new module |
| `apps/dashboard/lib/ddragon/assets.ts` (modify) | export `canonicalChampionId` |
| `apps/dashboard/lib/queries/player-stats.ts` (modify) | extract `playerStatsGameFilter` (period → where) |
| `apps/dashboard/lib/queries/champion-stats.ts` (create) | `getChampionStats`, `parseChampionStatsMode` |
| `apps/dashboard/lib/queries/champion-stats.test.ts` (create) | DB integration tests |
| `apps/dashboard/components/champion-stats/ChampionStatsScreen.tsx` (create) | client screen: tabs, sort, picker bar, state |
| `apps/dashboard/components/champion-stats/ChampionStatsTable.tsx` (create) | desktop table + member sub-rows |
| `apps/dashboard/components/champion-stats/ChampionStatsCards.tsx` (create) | mobile cards |
| `apps/dashboard/components/champion-stats/ChampionIcon.tsx` (create) | icon or empty square |
| `apps/dashboard/app/champion-stats/page.tsx` (create) | server page |
| `apps/dashboard/components/AppShell.tsx` (modify) | enable nav item, `activeNav` union |
| `CLAUDE.md` (modify) | document the page and the mobile list |

---

### Task 1: Core aggregation

**Files:**
- Create: `packages/core/src/champion-stats.ts`
- Create: `packages/core/src/champion-stats.test.ts`
- Modify: `packages/core/src/index.ts` (add export after `./player-stats`)

**Interfaces:**
- Consumes: `PLAYER_STAT_LANES` from `./player-stats`; `Lane` type from `@lolpamin/db`.
- Produces:
  - `interface MemberChampionLine { memberId: string; champion: string; games: number; wins: number; kills: number; deaths: number; assists: number; lanes: Partial<Record<Lane, number>> }` (sums)
  - `type ChampionSort = "games" | "kdaDesc" | "kdaAsc"`
  - `interface ChampionAverages { games: number; wins: number; losses: number; winRate: number; kills: number; deaths: number; assists: number; kda: number | null }`
  - `interface ChampionMemberRow extends ChampionAverages { memberId: string; mainLane: Lane | null }`
  - `interface ChampionRow extends ChampionAverages { champion: string; members: ChampionMemberRow[] }`
  - `function aggregateChampionStats(lines: MemberChampionLine[], selectedIds: ReadonlySet<string>, sort: ChampionSort): ChampionRow[]`

- [ ] **Step 1: Write the failing test**

`packages/core/src/champion-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateChampionStats, type MemberChampionLine } from "./champion-stats";

function line(over: Partial<MemberChampionLine> = {}): MemberChampionLine {
  return {
    memberId: "a",
    champion: "Ahri",
    games: 1,
    wins: 1,
    kills: 1,
    deaths: 1,
    assists: 1,
    lanes: {},
    ...over,
  };
}

const all = (...ids: string[]) => new Set(ids);

describe("aggregateChampionStats", () => {
  it("sums selected members into one row per champion with per-game averages", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "a", games: 2, wins: 1, kills: 10, deaths: 4, assists: 6 }),
        line({ memberId: "b", games: 2, wins: 2, kills: 2, deaths: 0, assists: 2 }),
      ],
      all("a", "b"),
      "games",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      champion: "Ahri",
      games: 4,
      wins: 3,
      losses: 1,
      winRate: 0.75,
      kills: 3,
      deaths: 1,
      assists: 2,
      kda: 5, // (12 + 8) / 4
    });
    expect(rows[0].members.map((m) => m.memberId)).toEqual(["b", "a"]); // b: 2 games 2 wins beats a: 2 games 1 win
  });

  it("leaves out unselected members and champions only they played", () => {
    const rows = aggregateChampionStats(
      [line({ memberId: "a", champion: "Ahri" }), line({ memberId: "b", champion: "Zed" })],
      all("a"),
      "games",
    );

    expect(rows.map((r) => r.champion)).toEqual(["Ahri"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(aggregateChampionStats([line()], all(), "games")).toEqual([]);
  });

  it("sorts by games, then wins, then champion id", () => {
    const rows = aggregateChampionStats(
      [
        line({ champion: "Zed", games: 3, wins: 1 }),
        line({ champion: "Ahri", games: 3, wins: 2 }),
        line({ champion: "Lux", games: 5, wins: 0 }),
        line({ champion: "Annie", games: 3, wins: 2 }),
      ],
      all("a"),
      "games",
    );

    expect(rows.map((r) => r.champion)).toEqual(["Lux", "Ahri", "Annie", "Zed"]);
  });

  it("puts Perfect first for high KDA and last for low KDA, ties by games", () => {
    const lines = [
      line({ champion: "Low", kills: 1, deaths: 2, assists: 1 }), // 1
      line({ champion: "Perfect", kills: 3, deaths: 0, assists: 0 }), // null
      line({ champion: "HighFew", kills: 2, deaths: 1, assists: 2 }), // 4, 1 game
      line({ champion: "HighMany", games: 3, kills: 2, deaths: 1, assists: 2 }), // 4, 3 games
    ];

    expect(aggregateChampionStats(lines, all("a"), "kdaDesc").map((r) => r.champion)).toEqual([
      "Perfect",
      "HighMany",
      "HighFew",
      "Low",
    ]);
    expect(aggregateChampionStats(lines, all("a"), "kdaAsc").map((r) => r.champion)).toEqual([
      "Low",
      "HighMany",
      "HighFew",
      "Perfect",
    ]);
  });

  it("keeps member rows in games order whatever the champion sort", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "few", games: 1, kills: 9, deaths: 1 }),
        line({ memberId: "many", games: 4, kills: 0, deaths: 4 }),
      ],
      all("few", "many"),
      "kdaDesc",
    );

    expect(rows[0].members.map((m) => m.memberId)).toEqual(["many", "few"]);
  });

  it("picks the most played lane as main lane, ties by lane order, null without lanes", () => {
    const rows = aggregateChampionStats(
      [
        line({ memberId: "a", lanes: { MID: 2, TOP: 1 } }),
        line({ memberId: "b", lanes: { SUP: 1, JUG: 1 } }),
        line({ memberId: "c", lanes: {} }),
      ],
      all("a", "b", "c"),
      "games",
    );
    const lane = (id: string) => rows[0].members.find((m) => m.memberId === id)!.mainLane;

    expect(lane("a")).toBe("MID");
    expect(lane("b")).toBe("JUG");
    expect(lane("c")).toBeNull();
  });

  it("merges duplicate (member, champion) lines instead of listing the member twice", () => {
    const rows = aggregateChampionStats(
      [line({ memberId: "a", games: 1, lanes: { TOP: 1 } }), line({ memberId: "a", games: 2, lanes: { MID: 2 } })],
      all("a"),
      "games",
    );

    expect(rows[0].members).toHaveLength(1);
    expect(rows[0].members[0]).toMatchObject({ games: 3, mainLane: "MID" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `packages/core`): `npx vitest run src/champion-stats.test.ts`
Expected: FAIL — `Failed to resolve import "./champion-stats"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/champion-stats.ts`:

```ts
// `type` keeps the Prisma client from booting — same reason as lane.ts.
import type { Lane } from "@lolpamin/db";
import { PLAYER_STAT_LANES } from "./player-stats";

// One member's games on one champion in one mode and period. Sums, not averages:
// the browser adds several members together, which averages cannot survive.
export interface MemberChampionLine {
  memberId: string;
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  // Games per lane; empty for ARAM.
  lanes: Partial<Record<Lane, number>>;
}

export type ChampionSort = "games" | "kdaDesc" | "kdaAsc";

// Per-game averages; winRate is a 0–1 fraction. kda null means no deaths ("Perfect").
export interface ChampionAverages {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
}

export interface ChampionMemberRow extends ChampionAverages {
  memberId: string;
  mainLane: Lane | null;
}

export interface ChampionRow extends ChampionAverages {
  champion: string;
  members: ChampionMemberRow[];
}

interface Totals {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

interface MemberTotals extends Totals {
  lanes: Partial<Record<Lane, number>>;
}

function averages(t: Totals): ChampionAverages {
  return {
    games: t.games,
    wins: t.wins,
    losses: t.games - t.wins,
    winRate: t.wins / t.games,
    kills: t.kills / t.games,
    deaths: t.deaths / t.games,
    assists: t.assists / t.games,
    kda: t.deaths === 0 ? null : (t.kills + t.assists) / t.deaths,
  };
}

function addTotals(into: Totals, from: Totals): void {
  into.games += from.games;
  into.wins += from.wins;
  into.kills += from.kills;
  into.deaths += from.deaths;
  into.assists += from.assists;
}

// Ties go to the earlier lane in PLAYER_STAT_LANES (탑 → 서폿).
function mainLane(lanes: Partial<Record<Lane, number>>): Lane | null {
  let best: Lane | null = null;
  let bestGames = 0;
  for (const lane of PLAYER_STAT_LANES) {
    const games = lanes[lane] ?? 0;
    if (games > bestGames) {
      best = lane;
      bestGames = games;
    }
  }
  return best;
}

// Ascending KDA with Perfect (null) as the largest value.
function compareKdaAsc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function byGames(a: ChampionAverages, b: ChampionAverages): number {
  return b.games - a.games || b.wins - a.wins;
}

function compareChampions(sort: ChampionSort): (a: ChampionRow, b: ChampionRow) => number {
  const byId = (a: ChampionRow, b: ChampionRow) => a.champion.localeCompare(b.champion);
  if (sort === "kdaDesc") return (a, b) => compareKdaAsc(b.kda, a.kda) || b.games - a.games || byId(a, b);
  if (sort === "kdaAsc") return (a, b) => compareKdaAsc(a.kda, b.kda) || b.games - a.games || byId(a, b);
  return (a, b) => byGames(a, b) || byId(a, b);
}

export function aggregateChampionStats(
  lines: MemberChampionLine[],
  selectedIds: ReadonlySet<string>,
  sort: ChampionSort,
): ChampionRow[] {
  const byChampion = new Map<string, Map<string, MemberTotals>>();
  for (const l of lines) {
    if (!selectedIds.has(l.memberId)) continue;
    const members = byChampion.get(l.champion) ?? new Map<string, MemberTotals>();
    const m = members.get(l.memberId) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, lanes: {} };
    addTotals(m, l);
    for (const lane of PLAYER_STAT_LANES) {
      const games = l.lanes[lane];
      if (games) m.lanes[lane] = (m.lanes[lane] ?? 0) + games;
    }
    members.set(l.memberId, m);
    byChampion.set(l.champion, members);
  }

  const rows: ChampionRow[] = [];
  for (const [champion, members] of byChampion) {
    const total: Totals = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    const memberRows: ChampionMemberRow[] = [];
    for (const [memberId, m] of members) {
      addTotals(total, m);
      memberRows.push({ memberId, mainLane: mainLane(m.lanes), ...averages(m) });
    }
    memberRows.sort((a, b) => byGames(a, b) || a.memberId.localeCompare(b.memberId));
    rows.push({ champion, members: memberRows, ...averages(total) });
  }
  return rows.sort(compareChampions(sort));
}
```

Add to `packages/core/src/index.ts` right after `export * from "./player-stats";`:

```ts
export * from "./champion-stats";
```

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `packages/core`): `npx vitest run src/champion-stats.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/champion-stats.ts packages/core/src/champion-stats.test.ts packages/core/src/index.ts
git commit -m "feat(core): aggregate champion stats from per-member sums"
```

---

### Task 2: Query

**Files:**
- Modify: `apps/dashboard/lib/ddragon/assets.ts` (export `canonicalChampionId`)
- Modify: `apps/dashboard/lib/queries/player-stats.ts` (extract `playerStatsGameFilter`)
- Create: `apps/dashboard/lib/queries/champion-stats.ts`
- Create: `apps/dashboard/lib/queries/champion-stats.test.ts`

**Interfaces:**
- Consumes: `MemberChampionLine` from `@lolpamin/core` (Task 1); `getDisplayName`, `replayPositionToLane`, `seoulYearRange` from `@lolpamin/core`; `PlayerStatsPeriod`, `parsePlayerStatsPeriod` from `./player-stats`.
- Produces:
  - `canonicalChampionId(id: string): string` in `@/lib/ddragon/assets` — Data Dragon id when known, input otherwise.
  - `playerStatsGameFilter(prisma: PrismaClient, period: PlayerStatsPeriod, now: Date): Promise<Prisma.GameResultWhereInput>` in `@/lib/queries/player-stats`.
  - `type ChampionStatsMode = "RIFT" | "ARAM"`
  - `parseChampionStatsMode(value: string | undefined): ChampionStatsMode`
  - `interface ChampionStatsMember { id: string; name: string; games: number }`
  - `interface ChampionStatsData { members: ChampionStatsMember[]; lines: MemberChampionLine[] }`
  - `getChampionStats(prisma: PrismaClient, period: PlayerStatsPeriod, mode: ChampionStatsMode, now?: Date): Promise<ChampionStatsData>`

- [ ] **Step 1: Export `canonicalChampionId`**

In `apps/dashboard/lib/ddragon/assets.ts`, after `canonicalChampion`:

```ts
// The id stats group by: the canonical Data Dragon id, or the replay's own string when the
// committed patch does not know the champion yet.
export function canonicalChampionId(id: string): string {
  return canonicalChampion(id) ?? id;
}
```

- [ ] **Step 2: Extract the period filter**

In `apps/dashboard/lib/queries/player-stats.ts`, add above `getPlayerStats`:

```ts
// Period → GameResult filter, shared with /champion-stats so the two screens count the same games.
export async function playerStatsGameFilter(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
  now: Date,
): Promise<Prisma.GameResultWhereInput> {
  if (period === "season") return getCountedGameFilter(prisma);
  if (period === "year") {
    const { start, end } = seoulYearRange(now);
    return { cancelledAt: null, playedAt: { gte: start, lt: end } };
  }
  return { cancelledAt: null };
}
```

and replace the `gameFilter` declaration inside `getPlayerStats` with:

```ts
  const gameFilter = await playerStatsGameFilter(prisma, period, now);
```

Remove the now-unused `type CountedGameFilter` from the `./counted-games` import (keep `getCountedGameFilter`).

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/player-stats.test.ts`
Expected: PASS (refactor only).

- [ ] **Step 3: Write the failing test**

`apps/dashboard/lib/queries/champion-stats.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getChampionStats, parseChampionStatsMode } from "./champion-stats";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

let seq = 0;
async function member(realName: string, extra: { mergedIntoId?: string } = {}) {
  seq += 1;
  return prisma.member.create({ data: { realName, discordUserId: `d-${seq}`, kakaoNickname: `k-${seq}`, ...extra } });
}

interface Seat {
  memberId?: string; // absent = an outsider: a stat row with no participant
  team?: "BLUE" | "RED";
  position?: string;
  champion?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  withStat?: boolean;
}

// Writes the rows directly: the MMR path is not what these tests are about.
async function game(
  seats: Seat[],
  opts: { winner?: "BLUE" | "RED"; mode?: "RIFT" | "ARAM"; cancelled?: boolean; createdAt?: Date; playedAt?: Date } = {},
) {
  seq += 1;
  const withPuuid = seats.map((s, i) => ({ ...s, puuid: `p-${seq}-${i}` }));
  return prisma.gameResult.create({
    data: {
      playedAt: opts.playedAt ?? new Date("2026-09-01T12:00:00Z"),
      winner: opts.winner ?? "BLUE",
      mode: opts.mode ?? "RIFT",
      createdAt: opts.createdAt,
      cancelledAt: opts.cancelled ? new Date() : null,
      participants: {
        create: withPuuid
          .filter((s) => s.memberId !== undefined)
          .map((s) => ({
            memberId: s.memberId!,
            team: s.team ?? "BLUE",
            mmrBefore: 1000,
            mmrAfter: 1000,
            replayPuuid: s.puuid,
          })),
      },
      replayStats: {
        create: withPuuid
          .filter((s) => s.withStat !== false)
          .map((s) => ({
            puuid: s.puuid,
            gameName: "g",
            tagLine: "t",
            team: s.team ?? "BLUE",
            position: s.position ?? "TOP",
            champion: s.champion ?? "Aatrox",
            level: 18,
            kills: s.kills ?? 1,
            deaths: s.deaths ?? 1,
            assists: s.assists ?? 1,
            cs: 0,
            spell1: 4,
            spell2: 14,
            keystone: 0,
            subStyle: 0,
            items: [],
            damageDealt: 1000,
            damageTaken: 500,
            controlWards: 0,
            wardsPlaced: 0,
            wardsKilled: 0,
            gold: 9000,
            baronKills: 0,
            dragonKills: 0,
            heraldKills: 0,
            hordeKills: 0,
            atakhanKills: 0,
            turretKills: 0,
            inhibitorKills: 0,
          })),
      },
    },
  });
}

describe("parseChampionStatsMode", () => {
  it("defaults to rift", () => {
    expect(parseChampionStatsMode(undefined)).toBe("RIFT");
    expect(parseChampionStatsMode("aram")).toBe("RIFT");
    expect(parseChampionStatsMode("bogus")).toBe("RIFT");
    expect(parseChampionStatsMode("ARAM")).toBe("ARAM");
  });
});

describe("getChampionStats", () => {
  it("sums each member's games per champion, not averages", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, champion: "Ahri", kills: 4, deaths: 2, assists: 6 }], { winner: "BLUE" });
    await game([{ memberId: m.id, champion: "Ahri", kills: 2, deaths: 0, assists: 1, team: "RED" }], { winner: "BLUE" });

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines).toEqual([
      { memberId: m.id, champion: "Ahri", games: 2, wins: 1, kills: 6, deaths: 2, assists: 7, lanes: { TOP: 2 } },
    ]);
  });

  it("leaves outsiders out and lists only members who played this mode", async () => {
    const rift = await member("협곡");
    const aram = await member("칼바람");
    await member("안함");
    await game([{ memberId: rift.id, champion: "Ahri" }, { champion: "Zed" }]);
    await game([{ memberId: aram.id, champion: "Lux" }], { mode: "ARAM" });

    const riftStats = await getChampionStats(prisma, "all", "RIFT");
    const aramStats = await getChampionStats(prisma, "all", "ARAM");

    expect(riftStats.members).toEqual([{ id: rift.id, name: "협곡", games: 1 }]);
    expect(riftStats.lines.map((l) => l.champion)).toEqual(["Ahri"]);
    expect(aramStats.members).toEqual([{ id: aram.id, name: "칼바람", games: 1 }]);
    expect(aramStats.lines.map((l) => l.champion)).toEqual(["Lux"]);
  });

  it("records no lanes in aram", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, position: "MIDDLE" }], { mode: "ARAM" });

    const { lines } = await getChampionStats(prisma, "all", "ARAM");

    expect(lines[0].lanes).toEqual({});
  });

  it("counts a game with an unknown position without giving it a lane", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, position: "" }]);

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines[0]).toMatchObject({ games: 1, lanes: {} });
  });

  it("folds differently cased champion ids into the Data Dragon id", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id, champion: "FiddleSticks" }]);
    await game([{ memberId: m.id, champion: "Fiddlesticks" }]);

    const { lines } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ champion: "Fiddlesticks", games: 2 });
  });

  it("skips cancelled games and participations without a stat row", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }]);
    await game([{ memberId: m.id }], { cancelled: true });
    await game([{ memberId: m.id, withStat: false }]);

    const { lines, members } = await getChampionStats(prisma, "all", "RIFT");

    expect(lines[0].games).toBe(1);
    expect(members[0].games).toBe(1);
  });

  it("never lists a tombstone", async () => {
    const survivor = await member("생존");
    const tomb = await member("묘비", { mergedIntoId: survivor.id });
    await game([{ memberId: tomb.id }]);

    const { lines, members } = await getChampionStats(prisma, "all", "RIFT");

    expect(members).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("applies the same periods as /player-stats", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }], { playedAt: new Date("2025-12-31T14:00:00Z"), createdAt: new Date("2025-12-31T14:00:00Z") }); // 2025-12-31 23:00 KST
    await game([{ memberId: m.id }], { playedAt: new Date("2026-03-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    await prisma.ratingReset.create({ data: { kind: "SOFT", resetAt: new Date("2026-06-01T00:00:00Z"), memberCount: 1 } });
    await game([{ memberId: m.id }], { playedAt: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z") });

    const now = new Date("2026-10-01T03:00:00Z");
    const games = async (period: "year" | "season" | "all") =>
      (await getChampionStats(prisma, period, "RIFT", now)).lines[0].games;

    expect(await games("year")).toBe(2);
    expect(await games("season")).toBe(1);
    expect(await games("all")).toBe(3);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/champion-stats.test.ts`
Expected: FAIL — `Failed to resolve import "./champion-stats"`.

- [ ] **Step 5: Write the implementation**

`apps/dashboard/lib/queries/champion-stats.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName, replayPositionToLane, type MemberChampionLine } from "@lolpamin/core";
import { canonicalChampionId } from "@/lib/ddragon/assets";
import { playerStatsGameFilter, type PlayerStatsPeriod } from "./player-stats";

export type ChampionStatsMode = "RIFT" | "ARAM";

export function parseChampionStatsMode(value: string | undefined): ChampionStatsMode {
  return value === "ARAM" ? "ARAM" : "RIFT";
}

export interface ChampionStatsMember {
  id: string;
  name: string;
  // Replay games in this mode and period — shown on the picker chip.
  games: number;
}

export interface ChampionStatsData {
  members: ChampionStatsMember[];
  lines: MemberChampionLine[];
}

/**
 * Per-(member, champion) sums over replay-backed games of one mode and period. Starting
 * from GameParticipant leaves outsiders out (they have no participant row); absorbed
 * members need no handling because absorbMember moves participant rows onto the survivor.
 * The browser folds the selected members' lines with aggregateChampionStats.
 */
export async function getChampionStats(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
  mode: ChampionStatsMode,
  now: Date = new Date(),
): Promise<ChampionStatsData> {
  const gameFilter = await playerStatsGameFilter(prisma, period, now);
  const participations = await prisma.gameParticipant.findMany({
    where: { replayPuuid: { not: null }, gameResult: { mode, ...gameFilter } },
    select: {
      memberId: true,
      team: true,
      replayPuuid: true,
      member: { select: { realName: true, discordHandle: true, kakaoNickname: true, mergedIntoId: true } },
      gameResult: {
        select: {
          winner: true,
          replayStats: { select: { puuid: true, position: true, champion: true, kills: true, deaths: true, assists: true } },
        },
      },
    },
  });

  const lines = new Map<string, MemberChampionLine>();
  const members = new Map<string, ChampionStatsMember>();
  for (const p of participations) {
    if (p.member.mergedIntoId !== null) continue;
    const stat = p.gameResult.replayStats.find((s) => s.puuid === p.replayPuuid);
    // A replay game always stores all ten players; a missing row is inconsistent data, not a crash.
    if (!stat) continue;

    // Riot does not always case the id like Data Dragon ("FiddleSticks").
    const champion = canonicalChampionId(stat.champion);
    const key = `${p.memberId}\u0000${champion}`;
    const line = lines.get(key) ?? {
      memberId: p.memberId,
      champion,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      lanes: {},
    };
    line.games += 1;
    if (p.team === p.gameResult.winner) line.wins += 1;
    line.kills += stat.kills;
    line.deaths += stat.deaths;
    line.assists += stat.assists;
    // ARAM replays carry a position string too; it means nothing there.
    const lane = mode === "RIFT" ? replayPositionToLane(stat.position) : null;
    if (lane) line.lanes[lane] = (line.lanes[lane] ?? 0) + 1;
    lines.set(key, line);

    const m = members.get(p.memberId) ?? { id: p.memberId, name: getDisplayName(p.member), games: 0 };
    m.games += 1;
    members.set(p.memberId, m);
  }

  return {
    members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    lines: [...lines.values()],
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/champion-stats.test.ts lib/queries/player-stats.test.ts`
Expected: PASS (champion-stats 9 tests, player-stats unchanged).

If the `FiddleSticks` test fails because `Fiddlesticks` is not in `ddragon-map.json`'s `champions`, check `Object.keys(map.champions)` for the actual id and use that pair instead — the point is two casings of one known id.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/ddragon/assets.ts apps/dashboard/lib/queries/player-stats.ts apps/dashboard/lib/queries/champion-stats.ts apps/dashboard/lib/queries/champion-stats.test.ts
git commit -m "feat(champion-stats): per-member champion sums query"
```

---

### Task 3: Page, screen and nav

**Files:**
- Create: `apps/dashboard/components/champion-stats/ChampionIcon.tsx`
- Create: `apps/dashboard/components/champion-stats/ChampionStatsTable.tsx`
- Create: `apps/dashboard/components/champion-stats/ChampionStatsCards.tsx`
- Create: `apps/dashboard/components/champion-stats/ChampionStatsScreen.tsx`
- Create: `apps/dashboard/app/champion-stats/page.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx:14-32` (union), `:81` (nav item)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `aggregateChampionStats`, `ChampionRow`, `ChampionSort`, `laneLabel`, `seoulYearRange` from `@lolpamin/core`; `getChampionStats`, `parseChampionStatsMode`, `ChampionStatsMode`, `ChampionStatsMember`, `ChampionStatsData` from `@/lib/queries/champion-stats`; `parsePlayerStatsPeriod`, `PlayerStatsPeriod` from `@/lib/queries/player-stats`; `MemberPicker` from `@/components/player-stats/MemberPicker` (props `members: {id,name,games}[]`, `selectedIds: Set<string>`, `onChange(ids: Set<string>)`); `championIcon`, `championName` from `@/lib/ddragon/assets`; `formatAvg`, `formatKda`, `formatRate` from `@/lib/player-stats/format`.
- Produces: the `/champion-stats` route.

- [ ] **Step 1: Icon component**

`apps/dashboard/components/champion-stats/ChampionIcon.tsx`:

```tsx
import { championIcon } from "@/lib/ddragon/assets";

// A champion the committed patch does not know draws an empty square, never a broken image.
export function ChampionIcon({ champion, size }: { champion: string; size: number }) {
  const icon = championIcon(champion);
  return icon ? (
    <img src={icon} alt="" width={size} height={size} loading="lazy" className="flex-none rounded-lg" />
  ) : (
    <span className="inline-block flex-none rounded-lg bg-ink/[.08]" style={{ width: size, height: size }} />
  );
}
```

- [ ] **Step 2: Desktop table**

`apps/dashboard/components/champion-stats/ChampionStatsTable.tsx`:

```tsx
import { Fragment } from "react";
import { laneLabel, type ChampionAverages, type ChampionRow } from "@lolpamin/core";
import { championName } from "@/lib/ddragon/assets";
import { formatAvg, formatKda, formatRate } from "@/lib/player-stats/format";
import { ChampionIcon } from "./ChampionIcon";

const GRID = "grid grid-cols-[40px_minmax(0,1fr)_80px_130px_80px_150px_40px] items-center gap-2";

function Cells({ row }: { row: ChampionAverages }) {
  return (
    <>
      <div className="text-right font-mono text-[13px] text-fg">{row.games}</div>
      <div className="text-right text-[13px] text-fg">
        {formatRate(row.winRate)}
        <span className="ml-1.5 text-[11.5px] text-faint">
          {row.wins}승 {row.losses}패
        </span>
      </div>
      <div className="text-right font-mono text-[13px] font-semibold text-fg">{formatKda(row.kda)}</div>
      <div className="text-right font-mono text-[12.5px] text-muted">
        {formatAvg(row.kills)} / {formatAvg(row.deaths)} / {formatAvg(row.assists)}
      </div>
    </>
  );
}

export function ChampionStatsTable({
  rows,
  names,
  showLane,
  expanded,
  onToggle,
}: {
  rows: ChampionRow[];
  names: Map<string, string>;
  showLane: boolean;
  expanded: Set<string>;
  onToggle: (champion: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[.07] bg-surface">
      <div className={`${GRID} border-b border-ink/[.06] bg-surface-2 px-4 py-2.5 text-[12px] font-bold text-muted`}>
        <div className="text-right">#</div>
        <div>챔피언</div>
        <div className="text-right">판수</div>
        <div className="text-right">승률</div>
        <div className="text-right">KDA</div>
        <div className="text-right">K / D / A</div>
        <div />
      </div>
      {rows.map((row, i) => {
        const open = expanded.has(row.champion);
        return (
          <Fragment key={row.champion}>
            <button
              type="button"
              onClick={() => onToggle(row.champion)}
              aria-expanded={open}
              className={`${GRID} w-full border-b border-ink/[.05] px-4 py-2 text-left hover:bg-ink/[.03]`}
            >
              <div className="text-right font-mono text-[12px] text-faint">{i + 1}</div>
              <div className="flex min-w-0 items-center gap-2.5">
                <ChampionIcon champion={row.champion} size={32} />
                <span className="truncate text-[13.5px] font-semibold text-fg">{championName(row.champion)}</span>
              </div>
              <Cells row={row} />
              <div className="text-center text-[12px] text-faint">{open ? "▾" : "▸"}</div>
            </button>
            {open &&
              row.members.map((m) => (
                <div key={m.memberId} className={`${GRID} border-b border-ink/[.04] bg-surface-2 px-4 py-1.5`}>
                  <div />
                  <div className="flex min-w-0 items-center gap-2 pl-10 text-[13px] text-fg">
                    <span className="truncate">{names.get(m.memberId) ?? "이름 미확인"}</span>
                    {showLane && <span className="flex-none text-[11.5px] text-faint">{laneLabel(m.mainLane)}</span>}
                  </div>
                  <Cells row={m} />
                  <div />
                </div>
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Mobile cards**

`apps/dashboard/components/champion-stats/ChampionStatsCards.tsx`:

```tsx
import { laneLabel, type ChampionRow } from "@lolpamin/core";
import { championName } from "@/lib/ddragon/assets";
import { formatKda, formatRate } from "@/lib/player-stats/format";
import { ChampionIcon } from "./ChampionIcon";

export function ChampionStatsCards({
  rows,
  names,
  showLane,
  expanded,
  onToggle,
}: {
  rows: ChampionRow[];
  names: Map<string, string>;
  showLane: boolean;
  expanded: Set<string>;
  onToggle: (champion: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const open = expanded.has(row.champion);
        return (
          <div key={row.champion} className="rounded-xl border border-ink/[.07] bg-surface">
            <button
              type="button"
              onClick={() => onToggle(row.champion)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="w-5 flex-none text-right font-mono text-[12px] text-faint">{i + 1}</span>
              <ChampionIcon champion={row.champion} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-fg">{championName(row.champion)}</div>
                <div className="text-[12px] text-muted">
                  {row.games}판 · {formatRate(row.winRate)} · KDA {formatKda(row.kda)}
                </div>
              </div>
              <span className="flex-none text-[12px] text-faint">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div className="border-t border-ink/[.06] px-3 py-1.5">
                {row.members.map((m) => (
                  <div key={m.memberId} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {names.get(m.memberId) ?? "이름 미확인"}
                      {showLane && <span className="ml-1.5 text-[11.5px] text-faint">{laneLabel(m.mainLane)}</span>}
                    </span>
                    <span className="flex-none text-[12px] text-muted">
                      {m.games}판 · {formatRate(m.winRate)} · {formatKda(m.kda)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Screen**

`apps/dashboard/components/champion-stats/ChampionStatsScreen.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aggregateChampionStats, type ChampionSort } from "@lolpamin/core";
import { MemberPicker } from "@/components/player-stats/MemberPicker";
import type { ChampionStatsData, ChampionStatsMode } from "@/lib/queries/champion-stats";
import type { PlayerStatsPeriod } from "@/lib/queries/player-stats";
import { ChampionStatsCards } from "./ChampionStatsCards";
import { ChampionStatsTable } from "./ChampionStatsTable";

const MODES: Array<{ value: ChampionStatsMode; label: string }> = [
  { value: "RIFT", label: "협곡" },
  { value: "ARAM", label: "칼바람" },
];

const SORTS: Array<{ value: ChampionSort; label: string }> = [
  { value: "games", label: "많이 나온 순" },
  { value: "kdaDesc", label: "KDA 높은 순" },
  { value: "kdaAsc", label: "KDA 낮은 순" },
];

// 올해 → 이번 시즌 → 전체, same order and default as /player-stats.
function periods(year: number): Array<{ value: PlayerStatsPeriod; label: string }> {
  return [
    { value: "year", label: `${year}년` },
    { value: "season", label: "이번 시즌" },
    { value: "all", label: "전체" },
  ];
}

// Defaults (RIFT, year) are left out of the URL.
function href(mode: ChampionStatsMode, period: PlayerStatsPeriod): string {
  const params = new URLSearchParams();
  if (mode !== "RIFT") params.set("mode", mode);
  if (period !== "year") params.set("period", period);
  const query = params.toString();
  return query ? `/champion-stats?${query}` : "/champion-stats";
}

const SEGMENT = "inline-flex rounded-lg bg-ink/[.05] p-0.5 text-[13px]";
function segmentItem(active: boolean): string {
  return `rounded-md px-3 py-1.5 ${active ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted"}`;
}

// Selection, sort, picker and expansion are browser memory only. Sort stays out of the URL
// on purpose: a URL change goes through the server and would remount the screen, dropping
// the member selection.
export function ChampionStatsScreen({
  data,
  mode,
  period,
  year,
}: {
  data: ChampionStatsData;
  mode: ChampionStatsMode;
  period: PlayerStatsPeriod;
  // Seoul's current year, decided on the server so the label and the query agree.
  year: number;
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(data.members.map((m) => m.id)));
  const [sort, setSort] = useState<ChampionSort>("games");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => aggregateChampionStats(data.lines, selectedIds, sort), [data.lines, selectedIds, sort]);
  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const showLane = mode === "RIFT";
  const allSelected = selectedIds.size === data.members.length;

  function toggle(champion: string) {
    const next = new Set(expanded);
    if (next.has(champion)) next.delete(champion);
    else next.add(champion);
    setExpanded(next);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={SEGMENT}>
          {MODES.map((m) => (
            <Link key={m.value} href={href(m.value, period)} className={segmentItem(mode === m.value)}>
              {m.label}
            </Link>
          ))}
        </div>
        <div className={SEGMENT}>
          {periods(year).map((p) => (
            <Link key={p.value} href={href(mode, p.value)} className={segmentItem(period === p.value)}>
              {p.label}
            </Link>
          ))}
        </div>
        <div className={`${SEGMENT} md:ml-auto`}>
          {SORTS.map((s) => (
            <button key={s.value} type="button" onClick={() => setSort(s.value)} className={segmentItem(sort === s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {data.members.length === 0 ? (
        <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">
          이 기간에 리플레이로 등록한 판이 없습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              aria-expanded={pickerOpen}
              className="flex items-center justify-between rounded-xl border border-ink/[.07] bg-surface-2 px-4 py-2.5 text-left text-[13px]"
            >
              <span className="font-semibold text-fg">
                회원 선택
                <span className="ml-2 font-normal text-muted">
                  {allSelected ? `전체 ${data.members.length}명` : `${selectedIds.size}명 선택`}
                </span>
              </span>
              <span className="text-faint">{pickerOpen ? "▴" : "▾"}</span>
            </button>
            {pickerOpen && <MemberPicker members={data.members} selectedIds={selectedIds} onChange={setSelectedIds} />}
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">선택한 회원이 없습니다.</div>
          ) : (
            <>
              <div className="hidden md:block">
                <ChampionStatsTable rows={rows} names={names} showLane={showLane} expanded={expanded} onToggle={toggle} />
              </div>
              <div className="md:hidden">
                <ChampionStatsCards rows={rows} names={names} showLane={showLane} expanded={expanded} onToggle={toggle} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Page**

`apps/dashboard/app/champion-stats/page.tsx`:

```tsx
import { seoulYearRange } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { ChampionStatsScreen } from "@/components/champion-stats/ChampionStatsScreen";
import { prisma } from "@/lib/prisma";
import { getChampionStats, parseChampionStatsMode } from "@/lib/queries/champion-stats";
import { parsePlayerStatsPeriod } from "@/lib/queries/player-stats";

// AppShell and the stats query both read live rows; without this next build bakes a snapshot.
export const dynamic = "force-dynamic";

export default async function ChampionStatsPage({ searchParams }: { searchParams: { mode?: string; period?: string } }) {
  const mode = parseChampionStatsMode(searchParams.mode);
  const period = parsePlayerStatsPeriod(searchParams.period);
  const now = new Date();
  const data = await getChampionStats(prisma, period, mode, now);

  return (
    <AppShell activeNav="champion-stats" pageTitle="챔피언 통계" pageDesc="회원 내전 · 리플레이로 등록한 판 기준 챔피언별 전적">
      {/* key: a mode or period switch remounts the screen so the selection resets with the new data */}
      <ChampionStatsScreen key={`${mode}:${period}`} data={data} mode={mode} period={period} year={seoulYearRange(now).year} />
    </AppShell>
  );
}
```

- [ ] **Step 6: Nav**

In `apps/dashboard/components/AppShell.tsx`, add `| "champion-stats"` to the `activeNav` union right after `| "player-stats"`, and replace line 81:

```tsx
    { key: "champion-stats", label: "챔피언 통계", icon: "trophy", disabled: true },
```

with:

```tsx
    { key: "champion-stats", href: "/champion-stats", label: "챔피언 통계", icon: "trophy" },
```

- [ ] **Step 7: Typecheck**

Run (cwd `apps/dashboard`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual check**

Run: `npm run dev --workspace=dashboard`, open `http://localhost:3000/champion-stats`.
Check:
- Sidebar 「챔피언 통계」 is clickable and highlighted.
- Default: 협곡 + {올해}년 + 많이 나온 순, picker collapsed showing 「전체 N명」.
- Open picker, uncheck a member → bar shows 「K명 선택」, table recomputes. Then switch sort to KDA 높은 순 → selection stays (Review Focus 3). Perfect rows on top; KDA 낮은 순 → Perfect at bottom.
- Expand a champion → member rows with lane label; 칼바람 tab → no lane label.
- 전체 해제 → 「선택한 회원이 없습니다.」
- Narrow the window below 768px → cards, tap to expand.
- Switch the skin on `/admins` to dark/pink → colours follow.

- [ ] **Step 9: Docs**

In `CLAUDE.md`, insert after the `/player-stats` paragraph (the one ending "member selection and block folding are browser memory only."):

```markdown
`/champion-stats` (챔피언 통계) folds the same replay rows per champion, members only
(an outsider has no `GameParticipant`), with 협곡/칼바람 tabs (`?mode=ARAM`, never mixed)
and the `/player-stats` periods (`playerStatsGameFilter`, shared). The server sends
per-(member, champion) **sums** (`getChampionStats`) and the browser folds the selected
members with `aggregateChampionStats` in `packages/core` — sums, because averages cannot be
added across members. Member selection, sort (판수 / KDA 높은·낮은 순, Perfect counts as
highest) and expansion are browser state; sort stays out of the URL because a URL change
remounts the screen and drops the selection. Champion ids are folded through
`canonicalChampionId` (Riot sends `FiddleSticks`). Each member row shows that member's most
played lane on the champion (rift only).
```

In the `## Mobile` section change "Nine read screens plus `/login` (`/`, `/member-info`, `/rift`, `/aram`, `/match-history`, `/inactive`, `/player-stats`, `/events`, `/events/[id]`)" to "Ten read screens plus `/login` (`/`, `/member-info`, `/rift`, `/aram`, `/match-history`, `/inactive`, `/player-stats`, `/champion-stats`, `/events`, `/events/[id]`)".

Also add `/champion-stats` to the `Every participant picker (...)` list in CLAUDE.md, since it uses the same `MemberPicker` search box: `(`/matches`, `/draw/*`, `/player-stats`, `/champion-stats`)`.

- [ ] **Step 10: Full test run**

Run: `npm run test --workspace=@lolpamin/core` and `npm run test --workspace=dashboard`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/components/champion-stats apps/dashboard/app/champion-stats apps/dashboard/components/AppShell.tsx CLAUDE.md
git commit -m "feat(champion-stats): champion stats page with member filter and KDA sort"
```
