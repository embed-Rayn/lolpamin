# Player Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/player-stats` — every member's rift in-house results aggregated per position from replay stats, with a draw-style member chip filter and collapsible per-member blocks.

**Architecture:** A pure `aggregatePlayerStats` in `packages/core` does all math. `lib/queries/player-stats.ts` loads members + replay-backed RIFT participations (period-filtered) and feeds the core function. The page renders a client `PlayerStatsScreen` that owns selection/collapse state and renders `PlayerStatBlock`s.

**Tech Stack:** Next.js 14 App Router, Prisma, Tailwind (skin tokens), vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-player-stats-design.md`

## Global Constraints

- RIFT only. Only participations with `replayPuuid != null` in non-cancelled games.
- `?period=season` (default, `getCountedGameFilter`) / `?period=all` (`{ cancelledAt: null }`); unknown → `season`.
- Colours: skin tokens only, never hex (CLAUDE.md "Skins").
- UI copy Korean; code/comments/commits English.
- Page declares `export const dynamic = "force-dynamic"`.
- DB test file starts with the `DATABASE_URL_TEST` guard.
- Initial selection = all members; blocks expanded; name order `localeCompare(…, "ko")`.

## Review Focus

- Member with 0 counted games → still listed as a chip (dimmed) and a "기록 없음" block — covered in Task 2 test.
- Replay `position` empty/unknown → counted in total and champions but no lane row — Task 1 test.
- Deaths sum 0 → KDA `null` shown as "Perfect", and treated as the best KDA — Task 1 test.
- Hand-entered game (`replayPuuid` null) or ARAM or cancelled game must not leak in — Task 2 test.
- Participation whose `ReplayPlayerStat` row is missing (data inconsistency) → skipped, no crash — Task 2 test.

---

### Task 1: Core aggregation

**Files:**
- Create: `packages/core/src/player-stats.ts`
- Create: `packages/core/src/player-stats.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

**Interfaces:**
- Produces:
  ```ts
  export interface PlayerGameRow { position: string; champion: string; win: boolean; kills: number; deaths: number; assists: number; damageDealt: number; damageTaken: number; gold: number }
  export interface StatLine { games: number; wins: number; losses: number; winRate: number; kills: number; deaths: number; assists: number; kda: number | null; damageDealt: number; damageTaken: number; gold: number }
  export interface ChampionLine { champion: string; games: number; wins: number; winRate: number }
  export type StatColumn = "winRate" | "kda" | "damageDealt" | "damageTaken" | "gold";
  export interface PlayerStats { total: StatLine | null; lanes: Record<Lane, StatLine | null>; champions: ChampionLine[]; best: Record<StatColumn, Lane[]> }
  export const PLAYER_STAT_LANES: readonly Lane[];
  export function replayPositionToLane(position: string): Lane | null
  export function aggregatePlayerStats(rows: PlayerGameRow[]): PlayerStats
  ```
  `winRate` is a 0–1 fraction; averages are unrounded (the UI formats).

- [ ] **Step 1: Write the failing test** — `packages/core/src/player-stats.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { aggregatePlayerStats, replayPositionToLane, type PlayerGameRow } from "./player-stats";

function row(over: Partial<PlayerGameRow> = {}): PlayerGameRow {
  return {
    position: "TOP",
    champion: "Aatrox",
    win: true,
    kills: 0,
    deaths: 1,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    gold: 0,
    ...over,
  };
}

describe("replayPositionToLane", () => {
  it("maps the five replay positions onto lanes", () => {
    expect(replayPositionToLane("TOP")).toBe("TOP");
    expect(replayPositionToLane("JUNGLE")).toBe("JUG");
    expect(replayPositionToLane("MIDDLE")).toBe("MID");
    expect(replayPositionToLane("BOTTOM")).toBe("AD");
    expect(replayPositionToLane("UTILITY")).toBe("SUP");
  });

  it("returns null for an empty or unknown position", () => {
    expect(replayPositionToLane("")).toBeNull();
    expect(replayPositionToLane("NONE")).toBeNull();
  });
});

describe("aggregatePlayerStats", () => {
  it("returns empty stats for no games", () => {
    const s = aggregatePlayerStats([]);
    expect(s.total).toBeNull();
    expect(s.lanes).toEqual({ TOP: null, JUG: null, MID: null, AD: null, SUP: null });
    expect(s.champions).toEqual([]);
    expect(s.best).toEqual({ winRate: [], kda: [], damageDealt: [], damageTaken: [], gold: [] });
  });

  it("averages per game and computes kda from sums", () => {
    const s = aggregatePlayerStats([
      row({ win: true, kills: 10, deaths: 4, assists: 6, damageDealt: 30000, damageTaken: 20000, gold: 14000 }),
      row({ win: false, kills: 4, deaths: 7, assists: 8, damageDealt: 20000, damageTaken: 10000, gold: 10000 }),
    ]);
    expect(s.lanes.TOP).toEqual({
      games: 2,
      wins: 1,
      losses: 1,
      winRate: 0.5,
      kills: 7,
      deaths: 5.5,
      assists: 7,
      kda: 28 / 11,
      damageDealt: 25000,
      damageTaken: 15000,
      gold: 12000,
    });
    expect(s.total).toEqual(s.lanes.TOP);
  });

  it("reports kda as null (perfect) when there are no deaths", () => {
    const s = aggregatePlayerStats([row({ kills: 3, deaths: 0, assists: 2 })]);
    expect(s.lanes.TOP?.kda).toBeNull();
  });

  it("counts an unknown position in the total and champions but no lane", () => {
    const s = aggregatePlayerStats([row({ position: "TOP" }), row({ position: "" })]);
    expect(s.lanes.TOP?.games).toBe(1);
    expect(s.total?.games).toBe(2);
    expect(s.champions).toEqual([{ champion: "Aatrox", games: 2, wins: 2, winRate: 1 }]);
  });

  it("ranks champions by games, then wins, then id, and keeps five", () => {
    const s = aggregatePlayerStats([
      row({ champion: "Ahri", win: false }),
      row({ champion: "Ahri", win: false }),
      row({ champion: "Zed", win: true }),
      row({ champion: "Zed", win: false }),
      row({ champion: "Lux" }),
      row({ champion: "Annie" }),
      row({ champion: "Brand" }),
      row({ champion: "Sona" }),
    ]);
    expect(s.champions.map((c) => c.champion)).toEqual(["Zed", "Ahri", "Annie", "Brand", "Lux"]);
    expect(s.champions[1]).toEqual({ champion: "Ahri", games: 2, wins: 0, winRate: 0 });
  });

  it("marks no best values when only one lane was played", () => {
    const s = aggregatePlayerStats([row(), row()]);
    expect(s.best).toEqual({ winRate: [], kda: [], damageDealt: [], damageTaken: [], gold: [] });
  });

  it("marks the best lane per column, keeping ties and treating perfect kda as highest", () => {
    const s = aggregatePlayerStats([
      row({ position: "TOP", win: true, kills: 5, deaths: 1, damageDealt: 100, damageTaken: 50, gold: 10 }),
      row({ position: "MIDDLE", win: true, kills: 1, deaths: 0, damageDealt: 200, damageTaken: 50, gold: 5 }),
      row({ position: "UTILITY", win: false, kills: 0, deaths: 3, damageDealt: 10, damageTaken: 90, gold: 1 }),
    ]);
    expect(s.best).toEqual({
      winRate: ["TOP", "MID"],
      kda: ["MID"],
      damageDealt: ["MID"],
      damageTaken: ["SUP"],
      gold: ["TOP"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `packages/core`): `npx vitest run src/player-stats.test.ts`
Expected: FAIL — cannot resolve `./player-stats`.

- [ ] **Step 3: Implement** — `packages/core/src/player-stats.ts`

```ts
// `type` keeps the Prisma client from booting — same reason as lane.ts.
import type { Lane } from "@lolpamin/db";

// One member's participation in one replay-backed rift game.
export interface PlayerGameRow {
  position: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  gold: number;
}

// Per-game averages; winRate is a 0–1 fraction. kda null means no deaths ("Perfect").
export interface StatLine {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  damageDealt: number;
  damageTaken: number;
  gold: number;
}

export interface ChampionLine {
  champion: string;
  games: number;
  wins: number;
  winRate: number;
}

export type StatColumn = "winRate" | "kda" | "damageDealt" | "damageTaken" | "gold";

export interface PlayerStats {
  total: StatLine | null;
  lanes: Record<Lane, StatLine | null>;
  champions: ChampionLine[];
  // Lanes holding the column's highest value; empty unless 2+ lanes were played.
  best: Record<StatColumn, Lane[]>;
}

export const PLAYER_STAT_LANES: readonly Lane[] = ["TOP", "JUG", "MID", "AD", "SUP"];

const TOP_CHAMPIONS = 5;
const STAT_COLUMNS: readonly StatColumn[] = ["winRate", "kda", "damageDealt", "damageTaken", "gold"];

const POSITION_TO_LANE: Record<string, Lane> = {
  TOP: "TOP",
  JUNGLE: "JUG",
  MIDDLE: "MID",
  BOTTOM: "AD",
  UTILITY: "SUP",
};

export function replayPositionToLane(position: string): Lane | null {
  return Object.hasOwn(POSITION_TO_LANE, position) ? POSITION_TO_LANE[position] : null;
}

function statLine(rows: PlayerGameRow[]): StatLine | null {
  if (rows.length === 0) return null;
  const games = rows.length;
  const sum = (pick: (r: PlayerGameRow) => number) => rows.reduce((acc, r) => acc + pick(r), 0);
  const wins = rows.filter((r) => r.win).length;
  const kills = sum((r) => r.kills);
  const deaths = sum((r) => r.deaths);
  const assists = sum((r) => r.assists);
  return {
    games,
    wins,
    losses: games - wins,
    winRate: wins / games,
    kills: kills / games,
    deaths: deaths / games,
    assists: assists / games,
    kda: deaths === 0 ? null : (kills + assists) / deaths,
    damageDealt: sum((r) => r.damageDealt) / games,
    damageTaken: sum((r) => r.damageTaken) / games,
    gold: sum((r) => r.gold) / games,
  };
}

function columnValue(line: StatLine, column: StatColumn): number {
  if (column === "kda") return line.kda ?? Number.POSITIVE_INFINITY;
  return line[column];
}

export function aggregatePlayerStats(rows: PlayerGameRow[]): PlayerStats {
  const lanes = {} as Record<Lane, StatLine | null>;
  for (const lane of PLAYER_STAT_LANES) {
    lanes[lane] = statLine(rows.filter((r) => replayPositionToLane(r.position) === lane));
  }

  const byChampion = new Map<string, { games: number; wins: number }>();
  for (const r of rows) {
    const c = byChampion.get(r.champion) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (r.win) c.wins += 1;
    byChampion.set(r.champion, c);
  }
  const champions = [...byChampion.entries()]
    .map(([champion, c]) => ({ champion, games: c.games, wins: c.wins, winRate: c.wins / c.games }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.champion.localeCompare(b.champion))
    .slice(0, TOP_CHAMPIONS);

  const played = PLAYER_STAT_LANES.filter((lane) => lanes[lane] !== null);
  const best = {} as Record<StatColumn, Lane[]>;
  for (const column of STAT_COLUMNS) {
    if (played.length < 2) {
      best[column] = [];
      continue;
    }
    const max = Math.max(...played.map((lane) => columnValue(lanes[lane]!, column)));
    best[column] = played.filter((lane) => columnValue(lanes[lane]!, column) === max);
  }

  return { total: statLine(rows), lanes, champions, best };
}
```

Add to `packages/core/src/index.ts` (after `export * from "./birth-year";`):

```ts
export * from "./player-stats";
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `packages/core`): `npx vitest run src/player-stats.test.ts`
Expected: PASS (all 9).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/player-stats.ts packages/core/src/player-stats.test.ts packages/core/src/index.ts
git commit -m "feat(core): aggregate per-lane player stats from replay rows"
```

---

### Task 2: Query

**Files:**
- Create: `apps/dashboard/lib/queries/player-stats.ts`
- Create: `apps/dashboard/lib/queries/player-stats.test.ts`

**Interfaces:**
- Consumes: `aggregatePlayerStats`, `PlayerStats`, `PlayerGameRow` (Task 1); `getCountedGameFilter` (`./counted-games`); `getDisplayName` (core).
- Produces:
  ```ts
  export type PlayerStatsPeriod = "season" | "all";
  export function parsePlayerStatsPeriod(value: string | undefined): PlayerStatsPeriod
  export interface PlayerStatsMember { id: string; name: string; stats: PlayerStats }
  export async function getPlayerStats(prisma: PrismaClient, period: PlayerStatsPeriod): Promise<PlayerStatsMember[]>
  ```

- [ ] **Step 1: Write the failing test** — `apps/dashboard/lib/queries/player-stats.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getPlayerStats, parsePlayerStatsPeriod } from "./player-stats";

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
  memberId: string;
  team?: "BLUE" | "RED";
  puuid?: string | null;
  position?: string;
  champion?: string;
  kills?: number;
  withStat?: boolean;
}

// Writes the rows directly: the MMR path is not what these tests are about.
async function game(
  seats: Seat[],
  opts: { winner?: "BLUE" | "RED"; mode?: "RIFT" | "ARAM"; cancelled?: boolean; createdAt?: Date } = {},
) {
  seq += 1;
  const withPuuid = seats.map((s) => ({ ...s, puuid: s.puuid === undefined ? `p-${seq}-${s.memberId}` : s.puuid }));
  return prisma.gameResult.create({
    data: {
      playedAt: new Date("2026-09-01T12:00:00Z"),
      winner: opts.winner ?? "BLUE",
      mode: opts.mode ?? "RIFT",
      createdAt: opts.createdAt,
      cancelledAt: opts.cancelled ? new Date() : null,
      participants: {
        create: withPuuid.map((s) => ({
          memberId: s.memberId,
          team: s.team ?? "BLUE",
          mmrBefore: 1000,
          mmrAfter: 1000,
          replayPuuid: s.puuid,
        })),
      },
      replayStats: {
        create: withPuuid
          .filter((s) => s.puuid !== null && s.withStat !== false)
          .map((s) => ({
            puuid: s.puuid!,
            gameName: "g",
            tagLine: "t",
            team: s.team ?? "BLUE",
            position: s.position ?? "TOP",
            champion: s.champion ?? "Aatrox",
            level: 18,
            kills: s.kills ?? 1,
            deaths: 1,
            assists: 1,
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

describe("parsePlayerStatsPeriod", () => {
  it("defaults to season", () => {
    expect(parsePlayerStatsPeriod(undefined)).toBe("season");
    expect(parsePlayerStatsPeriod("bogus")).toBe("season");
    expect(parsePlayerStatsPeriod("all")).toBe("all");
  });
});

describe("getPlayerStats", () => {
  it("lists every active member by name, including those with no games", async () => {
    const b = await member("나나");
    const a = await member("가가");
    const survivor = await member("다다");
    await member("다다묘비", { mergedIntoId: survivor.id });
    await game([{ memberId: b.id }]);

    const rows = await getPlayerStats(prisma, "season");

    expect(rows.map((r) => r.name)).toEqual(["가가", "나나", "다다"]);
    expect(rows.find((r) => r.id === a.id)!.stats.total).toBeNull();
    expect(rows.find((r) => r.id === b.id)!.stats.total?.games).toBe(1);
  });

  it("decides the win from the participant's team", async () => {
    const blue = await member("블루");
    const red = await member("레드");
    await game([{ memberId: blue.id, team: "BLUE" }, { memberId: red.id, team: "RED" }], { winner: "RED" });

    const rows = await getPlayerStats(prisma, "all");

    expect(rows.find((r) => r.id === blue.id)!.stats.total?.wins).toBe(0);
    expect(rows.find((r) => r.id === red.id)!.stats.total?.wins).toBe(1);
  });

  it("skips aram, cancelled, hand-entered and stat-less participations", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }]);
    await game([{ memberId: m.id }], { mode: "ARAM" });
    await game([{ memberId: m.id }], { cancelled: true });
    await game([{ memberId: m.id, puuid: null }]);
    await game([{ memberId: m.id, withStat: false }]);

    const [row] = await getPlayerStats(prisma, "all");

    expect(row.stats.total?.games).toBe(1);
  });

  it("uses the stat row matching the participant's puuid", async () => {
    const m = await member("가가");
    const other = await member("나나");
    await game([
      { memberId: m.id, kills: 7, position: "MIDDLE" },
      { memberId: other.id, kills: 2, position: "TOP" },
    ]);

    const rows = await getPlayerStats(prisma, "all");
    const mine = rows.find((r) => r.id === m.id)!.stats;

    expect(mine.lanes.MID?.kills).toBe(7);
    expect(mine.lanes.TOP).toBeNull();
  });

  it("counts only games entered after the latest reset for season, all of them for all", async () => {
    const m = await member("가가");
    await game([{ memberId: m.id }], { createdAt: new Date("2026-06-01T00:00:00Z") });
    await prisma.ratingReset.create({
      data: { kind: "SOFT", resetAt: new Date("2026-07-01T00:00:00Z"), memberCount: 1 },
    });
    await game([{ memberId: m.id }], { createdAt: new Date("2026-08-01T00:00:00Z") });

    expect((await getPlayerStats(prisma, "season"))[0].stats.total?.games).toBe(1);
    expect((await getPlayerStats(prisma, "all"))[0].stats.total?.games).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/player-stats.test.ts`
Expected: FAIL — cannot resolve `./player-stats`.

- [ ] **Step 3: Implement** — `apps/dashboard/lib/queries/player-stats.ts`

```ts
import type { PrismaClient } from "@lolpamin/db";
import { aggregatePlayerStats, getDisplayName, type PlayerGameRow, type PlayerStats } from "@lolpamin/core";
import { getCountedGameFilter, type CountedGameFilter } from "./counted-games";

// season = since the latest rating reset (same baseline as /rift); all = every live game.
export type PlayerStatsPeriod = "season" | "all";

export function parsePlayerStatsPeriod(value: string | undefined): PlayerStatsPeriod {
  return value === "all" ? "all" : "season";
}

export interface PlayerStatsMember {
  id: string;
  name: string;
  stats: PlayerStats;
}

/**
 * Per-member rift stats built from replay rows only. A hand-entered game has no
 * position or KDA, so it is left out and the game count can be lower than /rift's.
 * Absorbed members need no handling: absorbMember moves GameParticipant.memberId
 * onto the survivor.
 */
export async function getPlayerStats(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
): Promise<PlayerStatsMember[]> {
  const gameFilter: CountedGameFilter =
    period === "season" ? await getCountedGameFilter(prisma) : { cancelledAt: null };

  const [members, participations] = await Promise.all([
    prisma.member.findMany({
      where: { mergedIntoId: null },
      select: { id: true, realName: true, discordHandle: true, kakaoNickname: true },
    }),
    prisma.gameParticipant.findMany({
      where: { replayPuuid: { not: null }, gameResult: { mode: "RIFT", ...gameFilter } },
      select: {
        memberId: true,
        team: true,
        replayPuuid: true,
        gameResult: { select: { winner: true, replayStats: true } },
      },
    }),
  ]);

  const rowsByMember = new Map<string, PlayerGameRow[]>();
  for (const p of participations) {
    const stat = p.gameResult.replayStats.find((s) => s.puuid === p.replayPuuid);
    // A replay game always stores all ten players; a missing row is inconsistent data, not a crash.
    if (!stat) continue;
    const rows = rowsByMember.get(p.memberId) ?? [];
    rows.push({
      position: stat.position,
      champion: stat.champion,
      win: p.team === p.gameResult.winner,
      kills: stat.kills,
      deaths: stat.deaths,
      assists: stat.assists,
      damageDealt: stat.damageDealt,
      damageTaken: stat.damageTaken,
      gold: stat.gold,
    });
    rowsByMember.set(p.memberId, rows);
  }

  return members
    .map((m) => ({ id: m.id, name: getDisplayName(m), stats: aggregatePlayerStats(rowsByMember.get(m.id) ?? []) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/player-stats.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/player-stats.ts apps/dashboard/lib/queries/player-stats.test.ts
git commit -m "feat(player-stats): query replay-backed rift stats per member"
```

---

### Task 3: Screen, page and nav

**Files:**
- Create: `apps/dashboard/lib/player-stats/format.ts`
- Create: `apps/dashboard/components/player-stats/MemberPicker.tsx`
- Create: `apps/dashboard/components/player-stats/PlayerStatBlock.tsx`
- Create: `apps/dashboard/components/player-stats/PlayerStatsScreen.tsx`
- Create: `apps/dashboard/app/player-stats/page.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx` (activeNav union + nav item)
- Modify: `CLAUDE.md` (Mobile read-screen list + one domain paragraph)

**Interfaces:**
- Consumes: `getPlayerStats`, `parsePlayerStatsPeriod`, `PlayerStatsMember`, `PlayerStatsPeriod` (Task 2); `PLAYER_STAT_LANES`, `LANE_LABELS`, `StatLine`, `StatColumn` (core); `championIcon`, `championName` (`@/lib/ddragon/assets`).

- [ ] **Step 1: Formatting helpers** — `apps/dashboard/lib/player-stats/format.ts`

```ts
export function formatAvg(value: number): string {
  return value.toFixed(1);
}

export function formatKda(kda: number | null): string {
  return kda === null ? "Perfect" : kda.toFixed(2);
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
```

- [ ] **Step 2: Member picker** — `apps/dashboard/components/player-stats/MemberPicker.tsx`

```tsx
"use client";

import { useState } from "react";

export interface PickerMember {
  id: string;
  name: string;
  games: number;
}

// Same shape as the draw screen's CandidateSetup chip grid, without its draw-only
// parts (manual names, locking).
const FIELD =
  "rounded-lg border border-ink/[.09] bg-page px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent";

export function MemberPicker({
  members,
  selectedIds,
  onChange,
}: {
  members: PickerMember[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink/[.07] bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${FIELD} min-w-0 flex-1`}
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={`${FIELD} font-semibold`} onClick={() => onChange(new Set(members.map((m) => m.id)))}>
          전체 선택
        </button>
        <button type="button" className={`${FIELD} font-semibold`} onClick={() => onChange(new Set())}>
          전체 해제
        </button>
        <span className="text-[12px] text-faint">{selectedIds.size}명 선택</span>
      </div>
      <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto md:grid-cols-8">
        {visible.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
              selectedIds.has(m.id) ? "bg-accent-tint text-accent-soft" : "bg-surface-3 text-muted"
            } ${m.games === 0 ? "opacity-50" : ""}`}
          >
            <input type="checkbox" className="accent-accent" checked={selectedIds.has(m.id)} onChange={() => toggle(m.id)} />
            <span className="truncate">{m.name}</span>
            <span className="ml-auto font-mono text-[11px] text-faint">{m.games}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Member block** — `apps/dashboard/components/player-stats/PlayerStatBlock.tsx`

```tsx
import { LANE_LABELS, PLAYER_STAT_LANES, type StatColumn, type StatLine } from "@lolpamin/core";
import type { Lane } from "@lolpamin/db";
import type { PlayerStatsMember } from "@/lib/queries/player-stats";
import { championIcon, championName } from "@/lib/ddragon/assets";
import { formatAvg, formatInt, formatKda, formatRate } from "@/lib/player-stats/format";

const LANE_BADGE: Record<Lane, string> = { TOP: "TOP", JUG: "JG", MID: "MID", AD: "AD", SUP: "SUP" };
const COLS = "grid-cols-[88px_44px_56px_56px_1.4fr_64px_1fr_1fr_1fr]";

function Summary({ line }: { line: StatLine | null }) {
  if (!line) return <span className="text-[13px] text-faint">기록 없음</span>;
  return (
    <span className="text-[13px] text-muted">
      {line.games}전 {line.wins}승 {line.losses}패 · {formatRate(line.winRate)}
    </span>
  );
}

function LaneBadge({ lane }: { lane: Lane }) {
  return (
    <span className="flex items-center gap-2 font-semibold text-fg">
      <span className="grid h-[22px] w-[26px] place-items-center rounded-md bg-accent-tint text-[9px] font-bold text-accent-soft">
        {LANE_BADGE[lane]}
      </span>
      {LANE_LABELS[lane]}
    </span>
  );
}

function Cell({ children, hi }: { children: React.ReactNode; hi?: boolean }) {
  return <div className={`text-right ${hi ? "font-bold text-accent-soft" : ""}`}>{children}</div>;
}

function Row({ label, line, isBest }: { label: React.ReactNode; line: StatLine | null; isBest: (c: StatColumn) => boolean }) {
  if (!line) {
    return (
      <div className={`grid ${COLS} items-center gap-2 border-b border-ink/[.05] px-3 py-2.5 text-ink/25`}>
        <div className="opacity-60">{label}</div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="text-right">–</div>
        ))}
      </div>
    );
  }
  return (
    <div className={`grid ${COLS} items-center gap-2 border-b border-ink/[.05] px-3 py-2.5 text-fg-2`}>
      <div>{label}</div>
      <Cell>{line.games}</Cell>
      <Cell>{line.wins}-{line.losses}</Cell>
      <Cell hi={isBest("winRate")}>{formatRate(line.winRate)}</Cell>
      <Cell>{formatAvg(line.kills)} / {formatAvg(line.deaths)} / {formatAvg(line.assists)}</Cell>
      <Cell hi={isBest("kda")}>{formatKda(line.kda)}</Cell>
      <Cell hi={isBest("damageDealt")}>{formatInt(line.damageDealt)}</Cell>
      <Cell hi={isBest("damageTaken")}>{formatInt(line.damageTaken)}</Cell>
      <Cell hi={isBest("gold")}>{formatInt(line.gold)}</Cell>
    </div>
  );
}

function MobileLane({ lane, line, isBest }: { lane: Lane; line: StatLine | null; isBest: (c: StatColumn) => boolean }) {
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] ${line ? "text-fg-2" : "text-ink/25"}`}>
      <div className="flex items-center justify-between">
        <LaneBadge lane={lane} />
        {line ? (
          <span>
            {line.games}판 · <span className={isBest("winRate") ? "font-bold text-accent-soft" : ""}>{formatRate(line.winRate)}</span> · KDA{" "}
            <span className={isBest("kda") ? "font-bold text-accent-soft" : ""}>{formatKda(line.kda)}</span>
          </span>
        ) : (
          <span>–</span>
        )}
      </div>
      {line && (
        <div className="mt-1 flex justify-between text-[12px] text-muted">
          <span>{formatAvg(line.kills)}/{formatAvg(line.deaths)}/{formatAvg(line.assists)}</span>
          <span>피해 {formatInt(line.damageDealt)}</span>
          <span>골드 {formatInt(line.gold)}</span>
        </div>
      )}
    </div>
  );
}

export function PlayerStatBlock({
  member,
  collapsed,
  onToggle,
}: {
  member: PlayerStatsMember;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { stats } = member;
  const bestFor = (lane: Lane) => (c: StatColumn) => stats.best[c].includes(lane);
  const noBest = () => false;

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-left md:px-5"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[16px] font-extrabold text-fg">{member.name}</span>
          <Summary line={stats.total} />
        </span>
        <span className="text-[12px] text-faint">{collapsed ? "펼치기 ▾" : "접기 ▴"}</span>
      </button>

      {!collapsed && stats.total && (
        <div className="flex flex-col gap-4 border-t border-ink/[.06] px-4 py-4 md:flex-row md:px-5">
          <div className="min-w-0 flex-1">
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[720px] font-mono text-[13px] tabular-nums">
                <div className={`grid ${COLS} gap-2 border-b border-ink/[.08] px-3 py-2 font-sans text-[11px] font-semibold text-faint`}>
                  <div>포지션</div>
                  <div className="text-right">판</div>
                  <div className="text-right">승-패</div>
                  <div className="text-right">승률</div>
                  <div className="text-right">K / D / A</div>
                  <div className="text-right">KDA</div>
                  <div className="text-right">피해량</div>
                  <div className="text-right">받은 피해</div>
                  <div className="text-right">골드</div>
                </div>
                {PLAYER_STAT_LANES.map((lane) => (
                  <Row key={lane} label={<LaneBadge lane={lane} />} line={stats.lanes[lane]} isBest={bestFor(lane)} />
                ))}
                <div className="bg-surface-2 font-bold [&>div]:border-b-0">
                  <Row label={<span className="font-sans">합계</span>} line={stats.total} isBest={noBest} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 md:hidden">
              {PLAYER_STAT_LANES.map((lane) => (
                <MobileLane key={lane} lane={lane} line={stats.lanes[lane]} isBest={bestFor(lane)} />
              ))}
            </div>
          </div>

          <div className="md:w-[210px] md:flex-none md:border-l md:border-ink/[.06] md:pl-4">
            <div className="mb-1 text-[12px] font-bold text-muted">주 챔피언</div>
            {stats.champions.map((c) => {
              const icon = championIcon(c.champion);
              return (
                <div key={c.champion} className="flex items-center gap-2.5 border-b border-ink/[.05] py-2 last:border-b-0">
                  {icon ? (
                    <img src={icon} alt="" width={32} height={32} loading="lazy" className="rounded-lg" />
                  ) : (
                    <span className="inline-block h-8 w-8 rounded-lg bg-ink/[.08]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-fg">{championName(c.champion)}</div>
                    <div className="text-[11px] text-faint">
                      {c.wins}승 {c.games - c.wins}패 · {formatRate(c.winRate)}
                    </div>
                  </div>
                  <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-soft">
                    {c.games}판
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Screen** — `apps/dashboard/components/player-stats/PlayerStatsScreen.tsx`

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlayerStatsMember, PlayerStatsPeriod } from "@/lib/queries/player-stats";
import { MemberPicker } from "./MemberPicker";
import { PlayerStatBlock } from "./PlayerStatBlock";

const PERIODS: Array<{ value: PlayerStatsPeriod; label: string }> = [
  { value: "season", label: "이번 시즌" },
  { value: "all", label: "전체" },
];

// Selection and fold state are browser memory only: a reload starts from
// everyone selected and everything expanded.
export function PlayerStatsScreen({ members, period }: { members: PlayerStatsMember[]; period: PlayerStatsPeriod }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(members.map((m) => m.id)));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const shown = members.filter((m) => selectedIds.has(m.id));

  function toggleCollapsed(id: string) {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsedIds(next);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-ink/[.05] p-0.5 text-[13px]">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={p.value === "season" ? "/player-stats" : `/player-stats?period=${p.value}`}
              className={`rounded-md px-3 py-1.5 ${
                period === p.value ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 text-[12.5px]">
          <button type="button" className="text-muted hover:text-fg" onClick={() => setCollapsedIds(new Set(members.map((m) => m.id)))}>
            모두 접기
          </button>
          <span className="text-ghost">·</span>
          <button type="button" className="text-muted hover:text-fg" onClick={() => setCollapsedIds(new Set())}>
            모두 펼치기
          </button>
        </div>
      </div>

      <MemberPicker
        members={members.map((m) => ({ id: m.id, name: m.name, games: m.stats.total?.games ?? 0 }))}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />

      {shown.length === 0 ? (
        <div className="rounded-xl bg-surface-3 px-3 py-10 text-center text-[13px] text-muted">선택한 회원이 없습니다.</div>
      ) : (
        shown.map((m) => (
          <PlayerStatBlock key={m.id} member={m} collapsed={collapsedIds.has(m.id)} onToggle={() => toggleCollapsed(m.id)} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Page** — `apps/dashboard/app/player-stats/page.tsx`

```tsx
import { AppShell } from "@/components/AppShell";
import { PlayerStatsScreen } from "@/components/player-stats/PlayerStatsScreen";
import { prisma } from "@/lib/prisma";
import { getPlayerStats, parsePlayerStatsPeriod } from "@/lib/queries/player-stats";

// AppShell and the stats query both read live rows; without this next build bakes a snapshot.
export const dynamic = "force-dynamic";

export default async function PlayerStatsPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parsePlayerStatsPeriod(searchParams.period);
  const members = await getPlayerStats(prisma, period);

  return (
    <AppShell activeNav="player-stats" pageTitle="플레이어 통계" pageDesc="협곡 내전 · 리플레이로 등록한 판 기준 포지션별 전적">
      {/* key: a period switch remounts the screen so the selection resets with the new data */}
      <PlayerStatsScreen key={period} members={members} period={period} />
    </AppShell>
  );
}
```

- [ ] **Step 6: Nav** — `apps/dashboard/components/AppShell.tsx`

Add `| "player-stats"` to the `activeNav` union (after `| "match-history"`), and replace

```ts
    { key: "player-stats", label: "플레이어 통계", icon: "bar-chart", disabled: true },
```

with

```ts
    { key: "player-stats", href: "/player-stats", label: "플레이어 통계", icon: "bar-chart" },
```

- [ ] **Step 7: CLAUDE.md**

In "## Mobile", change `Five read screens plus \`/login\` (\`/\`, \`/member-info\`, \`/rift\`, \`/aram\`, \`/match-history\`, \`/inactive\`)` to `Six read screens plus \`/login\` (\`/\`, \`/member-info\`, \`/rift\`, \`/aram\`, \`/match-history\`, \`/inactive\`, \`/player-stats\`)`.

After the `/match-history` paragraph in the domain section, add:

```md
`/player-stats` aggregates rift results per member per lane from `ReplayPlayerStat`
only — a hand-entered game has no position or KDA, so its count can be lower than
`/rift`'s. `?period=season` (default) uses the same reset baseline as `counted-games`;
`?period=all` drops it. The math is `aggregatePlayerStats` in `packages/core`; member
selection and block folding are browser memory only.
```

- [ ] **Step 8: Verify**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: no errors.
Run (repo root): `npm test`
Expected: all workspaces pass.
Run `npm run dev --workspace=dashboard`, open `http://localhost:3000/player-stats` and `?period=all`; check chips, select/clear all, search, fold one / fold all, 375px width.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/lib/player-stats apps/dashboard/components/player-stats apps/dashboard/app/player-stats apps/dashboard/components/AppShell.tsx CLAUDE.md
git commit -m "feat(player-stats): add per-lane player stats page with member filter"
```
