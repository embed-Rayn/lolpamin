# Replay Game Detail Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an OP.GG-style per-player board (champion, spells, runes, KDA, damage, wards, CS, items, team objectives) for replay-imported games — as a preview on `/replay-import` and behind an expand button on `/match-history`.

**Architecture:** The `.rofl` tail JSON already carries every stat; `parseRoflMetadata` is widened to read them. On save, the ten players' stats go into a new `ReplayPlayerStat` table (outsiders included, no member FK) and each member's `GameParticipant` records the `replayPuuid` it played under, so the board links a stat row to a member and that game's MMR change without consulting `RiotAccount`. One presentational `GameDetailBoard` renders both screens; icons come from a trimmed Data Dragon copy committed under `apps/dashboard/public/ddragon/`.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind (semantic colour tokens), Prisma 5 / Postgres 16, vitest 2, tsx.

**Spec:** `docs/superpowers/specs/2026-09-23-replay-game-detail-design.md`

## Global Constraints

- Colours are never hex in components: use the semantic Tailwind roles (`bg-surface`, `text-muted`, `border-ink/[.06]`, `bg-accent`, `bg-danger`, `text-success-soft`, `text-danger-soft`, `text-orange`…). `text-white` only on a solid `bg-accent` / `bg-danger` fill.
- UI copy is Korean; code, identifiers, comments and commit messages are English.
- Domain logic that needs no I/O goes in `packages/core` with a unit test. DB logic lives in `apps/dashboard/lib/{queries,mutations}/` and takes `prisma` as its first argument. Multi-row writes run inside `prisma.$transaction`.
- Every DB test file keeps the `DATABASE_URL_TEST` guard at the top.
- Mobile: one breakpoint, `md`. Desktop view wrapped in `hidden md:block`, mobile view in `md:hidden`, both fed the same data. `/match-history` must work at 375px. `/replay-import` is desktop-only.
- `packages/core` must not import `node:*` (it ships to the client bundle).
- Error copy is exact: `"리플레이 정보가 일치하지 않습니다."`.
- Missing asset / unknown id renders an empty slot — never throws.
- Existing games are **not** backfilled. Hand-entered and pre-existing games get no expand button.
- Baseline type check: `npx tsc --noEmit -p .` in `apps/dashboard` currently prints exactly 2 errors, both in `lib/draw/candidates.test.ts`. "Type check clean" in this plan means no errors outside that file.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **A member absorbed or released after the game** — the board must name whoever now owns the `GameParticipant` row (the survivor), because it reads `GameParticipant.memberId`, not `RiotAccount`. Pinned in Task 5.
2. **A stat payload that does not belong to the replay key** (stale browser tab after re-upload, tampered request) — save must reject with `"리플레이 정보가 일치하지 않습니다."` and write nothing. Pinned in Task 4.
3. **A deaths=0 player and a team with 0 kills** — ratio shows `Perfect`, kill participation shows 0% rather than `NaN%`. Pinned in Task 2.
4. **An item / spell / rune id missing from the committed Data Dragon (new patch)** — renders an empty square, page does not break. Pinned in Task 3 (`itemIcon` returns `null`).
5. **Preview with a team that has zero members assigned yet** — `calculateTeamMmrChange` throws on an empty team; the preview must fall back to current MMR without a delta instead of crashing the form. Pinned in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/parse-rofl.ts` (modify) | `ReplayPlayerStats` + widened `ReplayPlayer`, reads new keys |
| `packages/core/src/game-detail.ts` (create) | `summarizeReplayTeams`, `killParticipation`, `kdaRatio`, `compareLane` |
| `packages/db/prisma/schema.prisma` (modify) | `ReplayPlayerStat`, `GameParticipant.replayPuuid`, `GameResult.gameLengthMs` |
| `packages/db/src/test-utils.ts` (modify) | reset the new table |
| `apps/dashboard/lib/ddragon/build-map.ts` (create) | pure: ddragon JSON → compact id map |
| `apps/dashboard/lib/ddragon/ddragon-map.json` (generated) | committed id map |
| `apps/dashboard/lib/ddragon/assets.ts` (create) | client-safe icon URL / name lookups |
| `apps/dashboard/scripts/sync-ddragon.ts` (create) | copies needed images + writes map |
| `apps/dashboard/lib/replay-import/replay-key.ts` (modify) | narrower input type |
| `apps/dashboard/lib/replay-import/test-fixture.ts` (modify) | `replayPlayer`, `replayInput` helpers |
| `apps/dashboard/lib/mutations/save-replay-import.ts` (modify) | key check + stat rows + `replayPuuid` |
| `apps/dashboard/lib/game-detail/types.ts` (create) | `GameDetail`, `GameDetailPlayer`, `GameDetailMember` |
| `apps/dashboard/lib/queries/game-history.ts` (modify) | `detail` per row |
| `apps/dashboard/components/GameDetailBoard.tsx` (create) | presentational board, desktop + mobile |
| `apps/dashboard/components/GameHistoryList.tsx` (modify) | ▾ expand button |
| `apps/dashboard/lib/replay-import/preview-mmr.ts` (create) | pure: expected MMR per assigned member |
| `apps/dashboard/lib/replay-import/prepare-import.ts` (modify) | `players`, member `mmr/aramMmr`, `mmrConfig` |
| `apps/dashboard/app/replay-import/actions.ts` (modify) | pass `replay` through |
| `apps/dashboard/components/ReplayImportForm.tsx` (modify) | preview board + send `replay` on save |
| `.gitignore`, `CLAUDE.md`, spec (modify) | ignore raw ddragon/sample, document rules |

---

### Task 1: Parse the full stat set from `.rofl`

**Files:**
- Modify: `packages/core/src/parse-rofl.ts`
- Test: `packages/core/src/parse-rofl.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ReplayPlayerStats {
    puuid: string; gameName: string; tagLine: string; team: "BLUE" | "RED";
    position: string; champion: string; level: number;
    kills: number; deaths: number; assists: number; cs: number;
    spell1: number; spell2: number; keystone: number; subStyle: number;
    items: number[];            // length 7, ITEM0..ITEM6, 0 = empty
    damageDealt: number; damageTaken: number;
    controlWards: number; wardsPlaced: number; wardsKilled: number;
    gold: number;
    baronKills: number; dragonKills: number; heraldKills: number; hordeKills: number;
    atakhanKills: number; turretKills: number; inhibitorKills: number;
  }
  export interface ReplayPlayer extends ReplayPlayerStats {
    win: boolean; wasAfk: boolean; wasLeaver: boolean; secondsDisconnected: number;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("parseRoflMetadata", ...)` in `packages/core/src/parse-rofl.test.ts`:

```ts
  it("reads spells, runes, items, damage, wards, gold and objectives", () => {
    const [first] = parseRoflMetadata(
      buildTenPlayerRofl([
        {
          SUMMONER_SPELL_1: "14",
          SUMMONER_SPELL_2: "4",
          KEYSTONE_ID: "8008",
          PERK_SUB_STYLE: "8400",
          ITEM0: "3047",
          ITEM1: "3076",
          ITEM2: "0",
          ITEM3: "3078",
          ITEM4: "3153",
          ITEM5: "1031",
          ITEM6: "3363",
          TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: "19147",
          TOTAL_DAMAGE_TAKEN: "40584",
          VISION_WARDS_BOUGHT_IN_GAME: "2",
          WARD_PLACED: "8",
          WARD_KILLED: "3",
          GOLD_EARNED: "10026",
          BARON_KILLS: "1",
          DRAGON_KILLS: "2",
          RIFT_HERALD_KILLS: "1",
          HORDE_KILLS: "3",
          ATAKHAN_KILLS: "1",
          TURRETS_KILLED: "4",
          BARRACKS_KILLED: "1",
        },
      ]),
    ).players;

    expect(first).toMatchObject({
      spell1: 14,
      spell2: 4,
      keystone: 8008,
      subStyle: 8400,
      items: [3047, 3076, 0, 3078, 3153, 1031, 3363],
      damageDealt: 19147,
      damageTaken: 40584,
      controlWards: 2,
      wardsPlaced: 8,
      wardsKilled: 3,
      gold: 10026,
      baronKills: 1,
      dragonKills: 2,
      heraldKills: 1,
      hordeKills: 3,
      atakhanKills: 1,
      turretKills: 4,
      inhibitorKills: 1,
    });
  });

  it("reads a missing stat key as 0 and a missing item slot as an empty slot", () => {
    // The default fixture carries none of the new keys — a patch that drops one must not block the import.
    const [first] = parseRoflMetadata(buildTenPlayerRofl()).players;

    expect(first.items).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(first.spell1).toBe(0);
    expect(first.damageDealt).toBe(0);
    expect(first.turretKills).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `packages/core`): `npx vitest run src/parse-rofl.test.ts`
Expected: the two new tests FAIL (`spell1` etc. are `undefined`).

- [ ] **Step 3: Implement**

In `packages/core/src/parse-rofl.ts`, replace the `ReplayPlayer` interface with:

```ts
/** What a replay says about one player and what the detail board shows. Stored per game in ReplayPlayerStat. */
export interface ReplayPlayerStats {
  /** 계정 정체성. 인게임 닉을 바꿔도 변하지 않는다. */
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  /** TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY. 특수한 판에서는 빈 문자열일 수 있다. */
  position: string;
  champion: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  /** summoner.json의 key. */
  spell1: number;
  spell2: number;
  /** runesReforged.json의 핵심 룬 id와 보조 계열 id. */
  keystone: number;
  subStyle: number;
  /** ITEM0..ITEM6. 0은 빈 칸, 마지막은 장신구. */
  items: number[];
  damageDealt: number;
  damageTaken: number;
  controlWards: number;
  wardsPlaced: number;
  wardsKilled: number;
  gold: number;
  baronKills: number;
  dragonKills: number;
  heraldKills: number;
  hordeKills: number;
  atakhanKills: number;
  turretKills: number;
  inhibitorKills: number;
}

export interface ReplayPlayer extends ReplayPlayerStats {
  win: boolean;
  wasAfk: boolean;
  wasLeaver: boolean;
  secondsDisconnected: number;
}
```

Add above `parseRoflMetadata`:

```ts
const ITEM_SLOTS = 7;
```

Replace the `players` mapping body with:

```ts
  const players: ReplayPlayer[] = rawPlayers.map((raw) => ({
    puuid: String(raw.PUUID ?? ""),
    gameName: String(raw.RIOT_ID_GAME_NAME ?? ""),
    tagLine: String(raw.RIOT_ID_TAG_LINE ?? ""),
    team: String(raw.TEAM) === "200" ? "RED" : "BLUE",
    win: String(raw.WIN) === "Win",
    position: String(raw.TEAM_POSITION ?? ""),
    champion: String(raw.SKIN ?? ""),
    kills: toInt(raw.CHAMPIONS_KILLED),
    deaths: toInt(raw.NUM_DEATHS),
    assists: toInt(raw.ASSISTS),
    level: toInt(raw.LEVEL),
    cs: toInt(raw.MINIONS_KILLED) + toInt(raw.NEUTRAL_MINIONS_KILLED),
    wasAfk: toBool(raw.WAS_AFK),
    wasLeaver: toBool(raw.WAS_LEAVER),
    secondsDisconnected: toInt(raw.TIME_SPENT_DISCONNECTED),
    spell1: toInt(raw.SUMMONER_SPELL_1),
    spell2: toInt(raw.SUMMONER_SPELL_2),
    keystone: toInt(raw.KEYSTONE_ID),
    subStyle: toInt(raw.PERK_SUB_STYLE),
    items: Array.from({ length: ITEM_SLOTS }, (_, i) => toInt(raw[`ITEM${i}`])),
    damageDealt: toInt(raw.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
    damageTaken: toInt(raw.TOTAL_DAMAGE_TAKEN),
    controlWards: toInt(raw.VISION_WARDS_BOUGHT_IN_GAME),
    wardsPlaced: toInt(raw.WARD_PLACED),
    wardsKilled: toInt(raw.WARD_KILLED),
    gold: toInt(raw.GOLD_EARNED),
    baronKills: toInt(raw.BARON_KILLS),
    dragonKills: toInt(raw.DRAGON_KILLS),
    heraldKills: toInt(raw.RIFT_HERALD_KILLS),
    hordeKills: toInt(raw.HORDE_KILLS),
    atakhanKills: toInt(raw.ATAKHAN_KILLS),
    turretKills: toInt(raw.TURRETS_KILLED),
    inhibitorKills: toInt(raw.BARRACKS_KILLED),
  }));
```

Also update the doc comment on `parseRoflMetadata` from "필요한 값(참가자·팀·승패·길이)이 전부 꼬리에 있다" to "필요한 값(참가자·팀·승패·길이·상세 스탯)이 전부 꼬리에 있다".

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `packages/core`): `npx vitest run src/parse-rofl.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parse-rofl.ts packages/core/src/parse-rofl.test.ts
git commit -m "feat(core): read spells, runes, items, damage, wards and objectives from rofl"
```

---

### Task 2: Board math in core

**Files:**
- Create: `packages/core/src/game-detail.ts`
- Create: `packages/core/src/game-detail.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ReplayPlayerStats` (Task 1).
- Produces:
  ```ts
  export interface TeamSummary { kills; gold; baron; dragon; herald; horde; atakhan; turret; inhibitor: number }
  export function summarizeReplayTeams(players: ReplayPlayerStats[]): Record<"BLUE" | "RED", TeamSummary>
  export function killParticipation(kills: number, assists: number, teamKills: number): number // 0..100 int
  export function kdaRatio(kills: number, deaths: number, assists: number): string // "Perfect" | "3.25"
  export function compareLane(a: { position: string; gameName: string }, b: { position: string; gameName: string }): number
  ```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/game-detail.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareLane, kdaRatio, killParticipation, summarizeReplayTeams } from "./game-detail";
import type { ReplayPlayerStats } from "./parse-rofl";

function stats(overrides: Partial<ReplayPlayerStats>): ReplayPlayerStats {
  return {
    puuid: "p",
    gameName: "g",
    tagLine: "KR1",
    team: "BLUE",
    position: "TOP",
    champion: "Yone",
    level: 15,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    spell1: 4,
    spell2: 14,
    keystone: 8010,
    subStyle: 8300,
    items: [0, 0, 0, 0, 0, 0, 0],
    damageDealt: 0,
    damageTaken: 0,
    controlWards: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    gold: 0,
    baronKills: 0,
    dragonKills: 0,
    heraldKills: 0,
    hordeKills: 0,
    atakhanKills: 0,
    turretKills: 0,
    inhibitorKills: 0,
    ...overrides,
  };
}

describe("summarizeReplayTeams", () => {
  it("adds each player's kills, gold and objectives into their own team", () => {
    const summary = summarizeReplayTeams([
      stats({ team: "BLUE", kills: 3, gold: 1000, turretKills: 1, dragonKills: 1 }),
      stats({ team: "BLUE", kills: 2, gold: 500, turretKills: 2 }),
      stats({ team: "RED", kills: 7, gold: 3000, baronKills: 1, hordeKills: 3, inhibitorKills: 1, heraldKills: 1, atakhanKills: 1 }),
    ]);

    expect(summary.BLUE).toEqual({
      kills: 5, gold: 1500, baron: 0, dragon: 1, herald: 0, horde: 0, atakhan: 0, turret: 3, inhibitor: 0,
    });
    expect(summary.RED).toEqual({
      kills: 7, gold: 3000, baron: 1, dragon: 0, herald: 1, horde: 3, atakhan: 1, turret: 0, inhibitor: 1,
    });
  });

  it("gives an all-zero summary to a team with no players", () => {
    expect(summarizeReplayTeams([stats({ team: "BLUE", kills: 1 })]).RED.kills).toBe(0);
  });
});

describe("killParticipation", () => {
  it("is (kills + assists) / team kills as a rounded percentage", () => {
    expect(killParticipation(3, 1, 16)).toBe(25);
    expect(killParticipation(15, 4, 35)).toBe(54);
  });

  it("is 0 when the team scored no kills rather than NaN", () => {
    expect(killParticipation(0, 0, 0)).toBe(0);
  });
});

describe("kdaRatio", () => {
  it("is (kills + assists) / deaths to two decimals", () => {
    expect(kdaRatio(3, 5, 1)).toBe("0.80");
    expect(kdaRatio(15, 2, 4)).toBe("9.50");
  });

  it("is Perfect with no deaths", () => {
    expect(kdaRatio(4, 0, 7)).toBe("Perfect");
    expect(kdaRatio(0, 0, 0)).toBe("Perfect");
  });
});

describe("compareLane", () => {
  it("orders top, jungle, mid, bottom, support and puts unknown lanes last by name", () => {
    const players = [
      { position: "UTILITY", gameName: "e" },
      { position: "", gameName: "b" },
      { position: "TOP", gameName: "d" },
      { position: "", gameName: "a" },
      { position: "MIDDLE", gameName: "c" },
    ];

    expect([...players].sort(compareLane).map((p) => p.gameName)).toEqual(["d", "c", "e", "a", "b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `packages/core`): `npx vitest run src/game-detail.test.ts`
Expected: FAIL — cannot resolve `./game-detail`.

- [ ] **Step 3: Implement**

Create `packages/core/src/game-detail.ts`:

```ts
import type { ReplayPlayerStats } from "./parse-rofl";

export interface TeamSummary {
  kills: number;
  gold: number;
  baron: number;
  dragon: number;
  herald: number;
  horde: number;
  atakhan: number;
  turret: number;
  inhibitor: number;
}

function emptySummary(): TeamSummary {
  return { kills: 0, gold: 0, baron: 0, dragon: 0, herald: 0, horde: 0, atakhan: 0, turret: 0, inhibitor: 0 };
}

/**
 * Team totals for the board's middle strip. The replay has no team-level objective
 * record — each player carries the objectives they last-hit — so the team's count is
 * the sum over its players.
 */
export function summarizeReplayTeams(players: ReplayPlayerStats[]): Record<"BLUE" | "RED", TeamSummary> {
  const summary = { BLUE: emptySummary(), RED: emptySummary() };
  for (const p of players) {
    const t = summary[p.team];
    t.kills += p.kills;
    t.gold += p.gold;
    t.baron += p.baronKills;
    t.dragon += p.dragonKills;
    t.herald += p.heraldKills;
    t.horde += p.hordeKills;
    t.atakhan += p.atakhanKills;
    t.turret += p.turretKills;
    t.inhibitor += p.inhibitorKills;
  }
  return summary;
}

/** Share of the team's kills this player took part in, as a whole percentage. */
export function killParticipation(kills: number, assists: number, teamKills: number): number {
  if (teamKills === 0) return 0;
  return Math.round(((kills + assists) / teamKills) * 100);
}

/** "(K+A)/D" to two decimals, or "Perfect" for a deathless game. */
export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** Sorts a team top → support. ARAM and odd games have no lane, so those fall back to name order. */
export function compareLane(
  a: { position: string; gameName: string },
  b: { position: string; gameName: string },
): number {
  const rank = (position: string) => {
    const i = LANE_ORDER.indexOf(position);
    return i === -1 ? LANE_ORDER.length : i;
  };
  return rank(a.position) - rank(b.position) || a.gameName.localeCompare(b.gameName);
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./game-detail";
```

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `packages/core`): `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/game-detail.ts packages/core/src/game-detail.test.ts packages/core/src/index.ts
git commit -m "feat(core): team totals, kill participation, kda ratio and lane order for the game board"
```

---

### Task 3: Data Dragon assets and lookups

**Files:**
- Create: `apps/dashboard/lib/ddragon/build-map.ts`
- Create: `apps/dashboard/lib/ddragon/build-map.test.ts`
- Create: `apps/dashboard/lib/ddragon/assets.ts`
- Create: `apps/dashboard/lib/ddragon/assets.test.ts`
- Create: `apps/dashboard/scripts/sync-ddragon.ts`
- Generated + committed: `apps/dashboard/lib/ddragon/ddragon-map.json`, `apps/dashboard/public/ddragon/**`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  ```ts
  // build-map.ts
  export interface DdragonMap {
    version: string;
    champions: Record<string, string>;                      // "Trundle" → "트런들"
    items: Record<string, string>;                          // "3047" → "판금 장화"
    spells: Record<string, { file: string; name: string }>; // "4" → { file: "SummonerFlash.png", name: "점멸" }
    runes: Record<string, { icon: string; name: string }>;  // "8008" → { icon: "perk-images/Styles/...png", name }
  }
  export function buildDdragonMap(input: DdragonSources): DdragonMap
  // assets.ts (client-safe)
  export function championIcon(id: string): string | null
  export function itemIcon(id: number): string | null
  export function spellIcon(key: number): string | null
  export function runeIcon(id: number): string | null
  export function championName(id: string): string
  export function itemName(id: number): string
  export function spellName(key: number): string
  export function runeName(id: number): string
  ```
  Icon URLs are root-relative: `/ddragon/champion/Trundle.png`, `/ddragon/item/3047.png`, `/ddragon/spell/SummonerFlash.png`, `/ddragon/perk-images/Styles/...png`.

- [ ] **Step 1: Write the failing test for the map builder**

Create `apps/dashboard/lib/ddragon/build-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDdragonMap } from "./build-map";

const sources = {
  version: "16.18.1",
  champion: { data: { Trundle: { id: "Trundle", name: "트런들" } } },
  item: { data: { "3047": { name: "판금 장화" } } },
  summoner: {
    data: {
      SummonerFlash: { key: "4", name: "점멸", image: { full: "SummonerFlash.png" } },
      SummonerDot: { key: "14", name: "점화", image: { full: "SummonerDot.png" } },
    },
  },
  runes: [
    {
      id: 8000,
      name: "정밀",
      icon: "perk-images/Styles/7201_Precision.png",
      slots: [
        { runes: [{ id: 8008, name: "치명적 속도", icon: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png" }] },
        { runes: [{ id: 9111, name: "승전보", icon: "perk-images/Styles/Precision/Triumph.png" }] },
      ],
    },
  ],
};

describe("buildDdragonMap", () => {
  it("keys spells by their numeric key, the way the replay stores them", () => {
    expect(buildDdragonMap(sources).spells).toEqual({
      "4": { file: "SummonerFlash.png", name: "점멸" },
      "14": { file: "SummonerDot.png", name: "점화" },
    });
  });

  it("keeps rune styles and keystones only — the board never shows minor runes", () => {
    const { runes } = buildDdragonMap(sources);
    expect(Object.keys(runes).sort()).toEqual(["8000", "8008"]);
    expect(runes["8008"]).toEqual({ icon: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png", name: "치명적 속도" });
  });

  it("maps champion and item ids to their Korean names", () => {
    const map = buildDdragonMap(sources);
    expect(map.version).toBe("16.18.1");
    expect(map.champions).toEqual({ Trundle: "트런들" });
    expect(map.items).toEqual({ "3047": "판금 장화" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/ddragon/build-map.test.ts`
Expected: FAIL — cannot resolve `./build-map`.

- [ ] **Step 3: Implement the map builder**

Create `apps/dashboard/lib/ddragon/build-map.ts`:

```ts
// Pure: turns the Data Dragon JSON files into the small lookup the board ships to the
// browser. The full JSONs are megabytes of tooltips; the board needs ids, names and file names.

export interface DdragonMap {
  version: string;
  champions: Record<string, string>;
  items: Record<string, string>;
  spells: Record<string, { file: string; name: string }>;
  runes: Record<string, { icon: string; name: string }>;
}

interface RuneEntry {
  id: number;
  name: string;
  icon: string;
}

export interface DdragonSources {
  version: string;
  champion: { data: Record<string, { id: string; name: string }> };
  item: { data: Record<string, { name: string }> };
  summoner: { data: Record<string, { key: string; name: string; image: { full: string } }> };
  runes: Array<RuneEntry & { slots: Array<{ runes: RuneEntry[] }> }>;
}

export function buildDdragonMap(input: DdragonSources): DdragonMap {
  const champions = Object.fromEntries(Object.values(input.champion.data).map((c) => [c.id, c.name]));
  const items = Object.fromEntries(Object.entries(input.item.data).map(([id, item]) => [id, item.name]));
  // The replay stores SUMMONER_SPELL_1 as summoner.json's numeric "key", not its string id.
  const spells = Object.fromEntries(
    Object.values(input.summoner.data).map((s) => [s.key, { file: s.image.full, name: s.name }]),
  );
  // The board shows the keystone (first slot) and the secondary tree's style icon.
  const runes: DdragonMap["runes"] = {};
  for (const style of input.runes) {
    runes[String(style.id)] = { icon: style.icon, name: style.name };
    for (const keystone of style.slots[0]?.runes ?? []) {
      runes[String(keystone.id)] = { icon: keystone.icon, name: keystone.name };
    }
  }
  return { version: input.version, champions, items, spells, runes };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/ddragon/build-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the sync script**

Create `apps/dashboard/scripts/sync-ddragon.ts`:

```ts
// npx tsx scripts/sync-ddragon.ts ../../16.18.1   (apps/dashboard 에서 실행)
// Copies only the images the game board uses out of a Data Dragon dump into public/ddragon/
// and writes lib/ddragon/ddragon-map.json. The dump itself stays out of git (mission/ alone
// is 58MB). Re-run with a newer dump when a patch adds items or champions.
// tsx does not resolve the "@/" alias, so imports are relative.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildDdragonMap, type DdragonSources } from "../lib/ddragon/build-map";

const source = process.argv[2];
if (!source || !existsSync(join(source, "data", "ko_KR"))) {
  console.error("usage: npx tsx scripts/sync-ddragon.ts <ddragon dump dir, e.g. ../../16.18.1>");
  process.exit(1);
}

const dashboardRoot = resolve(__dirname, "..");
const outDir = join(dashboardRoot, "public", "ddragon");
const mapPath = join(dashboardRoot, "lib", "ddragon", "ddragon-map.json");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(source, "data", "ko_KR", name), "utf8")) as T;
}

const sources: DdragonSources = {
  version: basename(resolve(source)),
  champion: readJson("champion.json"),
  item: readJson("item.json"),
  summoner: readJson("summoner.json"),
  runes: readJson("runesReforged.json"),
};
const map = buildDdragonMap(sources);

// Start clean so an image removed upstream does not linger.
rmSync(outDir, { recursive: true, force: true });

let copied = 0;
let missing = 0;
function copy(relativeFromImg: string, relativeTo: string): void {
  const from = join(source, "img", relativeFromImg);
  if (!existsSync(from)) {
    missing += 1;
    return;
  }
  const to = join(outDir, relativeTo);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}

for (const id of Object.keys(map.champions)) copy(join("champion", `${id}.png`), join("champion", `${id}.png`));
for (const id of Object.keys(map.items)) copy(join("item", `${id}.png`), join("item", `${id}.png`));
for (const spell of Object.values(map.spells)) copy(join("spell", spell.file), join("spell", spell.file));
for (const rune of Object.values(map.runes)) copy(rune.icon, rune.icon);

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(`ddragon ${map.version}: copied ${copied} images, ${missing} listed but absent, map → ${mapPath}`);
```

- [ ] **Step 6: Run the script and ignore the raw dump**

Run (cwd `apps/dashboard`): `npx tsx scripts/sync-ddragon.ts ../../16.18.1`
Expected: prints `ddragon 16.18.1: copied N images, ...` and creates `public/ddragon/{champion,item,spell,perk-images}` plus `lib/ddragon/ddragon-map.json`.

Check size: `du -sh public/ddragon` — expected well under 20MB.

Append to the repo-root `.gitignore`:

```gitignore

# Raw Data Dragon dumps (e.g. 16.18.1/) — only the trimmed copy under
# apps/dashboard/public/ddragon/ is committed; see apps/dashboard/scripts/sync-ddragon.ts
/[0-9]*.[0-9]*.[0-9]*/

# Reference screenshots and real replays — replays carry players' Riot IDs
sample/
```

Run: `git status --short` — expected: `16.18.1/` and `sample/` no longer listed.

- [ ] **Step 7: Write the failing test for the lookups**

Create `apps/dashboard/lib/ddragon/assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { championIcon, itemIcon, itemName, runeIcon, spellIcon, spellName } from "./assets";

describe("ddragon assets", () => {
  it("builds root-relative icon urls for known ids", () => {
    expect(championIcon("Trundle")).toBe("/ddragon/champion/Trundle.png");
    expect(itemIcon(3047)).toBe("/ddragon/item/3047.png");
    expect(spellIcon(4)).toBe("/ddragon/spell/SummonerFlash.png");
    expect(runeIcon(8000)).toBe("/ddragon/perk-images/Styles/7201_Precision.png");
  });

  it("returns null for an empty slot or an id the committed patch does not know", () => {
    expect(itemIcon(0)).toBeNull();
    expect(itemIcon(999999)).toBeNull();
    expect(spellIcon(0)).toBeNull();
    expect(runeIcon(0)).toBeNull();
    expect(championIcon("")).toBeNull();
    expect(championIcon("NotAChampion")).toBeNull();
  });

  it("names things in Korean and falls back to an empty string", () => {
    expect(spellName(4)).toBe("점멸");
    expect(itemName(999999)).toBe("");
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/ddragon/assets.test.ts`
Expected: FAIL — cannot resolve `./assets`.

- [ ] **Step 9: Implement the lookups**

Create `apps/dashboard/lib/ddragon/assets.ts`:

```ts
// Client-safe icon and name lookups over the committed Data Dragon map. Anything the
// committed patch does not know (an item added in a later patch) resolves to null / "",
// and the board draws an empty square — a stale asset folder must never break a page.
import rawMap from "./ddragon-map.json";
import type { DdragonMap } from "./build-map";

const map = rawMap as DdragonMap;
const BASE = "/ddragon";

export function championIcon(id: string): string | null {
  return id && map.champions[id] !== undefined ? `${BASE}/champion/${id}.png` : null;
}

export function itemIcon(id: number): string | null {
  return id !== 0 && map.items[String(id)] !== undefined ? `${BASE}/item/${id}.png` : null;
}

export function spellIcon(key: number): string | null {
  const spell = map.spells[String(key)];
  return spell ? `${BASE}/spell/${spell.file}` : null;
}

export function runeIcon(id: number): string | null {
  const rune = map.runes[String(id)];
  return rune ? `${BASE}/${rune.icon}` : null;
}

export function championName(id: string): string {
  return map.champions[id] ?? id;
}

export function itemName(id: number): string {
  return map.items[String(id)] ?? "";
}

export function spellName(key: number): string {
  return map.spells[String(key)]?.name ?? "";
}

export function runeName(id: number): string {
  return map.runes[String(id)]?.name ?? "";
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/ddragon`
Expected: PASS. If `runeIcon(8000)` differs, open `lib/ddragon/ddragon-map.json`, read the real `runes["8000"].icon`, and fix the expected string in the test (the path comes from the dump, not from us).

- [ ] **Step 11: Commit**

```bash
git add .gitignore apps/dashboard/lib/ddragon apps/dashboard/scripts/sync-ddragon.ts apps/dashboard/public/ddragon
git commit -m "feat(dashboard): commit a trimmed Data Dragon 16.18.1 for the game board"
```

---

### Task 4: Store replay stats on save

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260923140000_add_replay_player_stats/migration.sql` (generated)
- Modify: `packages/db/src/test-utils.ts`
- Modify: `apps/dashboard/lib/replay-import/replay-key.ts`
- Modify: `apps/dashboard/lib/replay-import/test-fixture.ts`
- Modify: `apps/dashboard/lib/mutations/save-replay-import.ts`
- Modify: `apps/dashboard/app/replay-import/actions.ts`
- Test: `apps/dashboard/lib/mutations/save-replay-import.test.ts`

**Interfaces:**
- Consumes: `ReplayPlayer`, `ReplayPlayerStats` (Task 1).
- Produces:
  ```ts
  // replay-key.ts
  export function computeReplayKey(meta: { gameLengthMs: number; players: ReadonlyArray<{ puuid: string }> }): string
  // save-replay-import.ts
  export interface SaveReplayImportInput { ...existing; replay: { gameLengthMs: number; players: ReplayPlayer[] } }
  SAVE_REPLAY_IMPORT_ERRORS.replayMismatch === "리플레이 정보가 일치하지 않습니다."
  // test-fixture.ts
  export function replayPlayer(puuid: string, team: "BLUE" | "RED", overrides?: Partial<ReplayPlayer>): ReplayPlayer
  export function replayInput(assignments: Array<{ puuid: string; team: "BLUE" | "RED" }>, gameLengthMs?: number):
    { replayKey: string; replay: { gameLengthMs: number; players: ReplayPlayer[] } }
  // Prisma: prisma.replayPlayerStat, GameParticipant.replayPuuid, GameResult.gameLengthMs, GameResult.replayStats
  // SaveReplayImportActionInput gains `replay: { gameLengthMs: number; players: ReplayPlayer[] }`
  ```

- [ ] **Step 1: Schema**

In `packages/db/prisma/schema.prisma`, inside `model GameResult` add after the `replayKey` line block:

```prisma
  // 리플레이로 저장한 판만 값이 있다. 상세 화면의 분당 CS가 이 값으로 나눈다.
  gameLengthMs Int?
```

and after `participants GameParticipant[]`:

```prisma
  replayStats  ReplayPlayerStat[]
```

Inside `model GameParticipant` add after `mmrAfter Int`:

```prisma
  // 이 회원이 이 경기를 뛴 라이엇 계정. 상세 화면이 ReplayPlayerStat.puuid로 이 행을 찾아
  // 회원명과 그 판의 MMR 변화를 붙인다. 읽는 시점의 RiotAccount를 보지 않는 이유는 나중에
  // 계정 주인을 바꿔도 과거 경기의 표시가 변하지 않아야 해서다. 손으로 입력한 경기는 null.
  replayPuuid  String?
```

Add a new model after `GameParticipant`:

```prisma
// 리플레이에 기록된 한 선수의 스탯. 외부인도 행을 가지므로 회원 FK가 없다 — 회원·MMR은
// 같은 경기의 GameParticipant.replayPuuid로 찾는다. 경기는 지워지지 않고 취소만 되므로
// cascade도 두지 않는다.
model ReplayPlayerStat {
  id           String     @id @default(uuid())
  gameResultId String
  gameResult   GameResult @relation(fields: [gameResultId], references: [id])

  puuid    String
  gameName String
  tagLine  String
  team     Team
  position String
  champion String
  level    Int

  kills   Int
  deaths  Int
  assists Int
  cs      Int

  spell1   Int
  spell2   Int
  keystone Int
  subStyle Int
  items    Int[]

  damageDealt  Int
  damageTaken  Int
  controlWards Int
  wardsPlaced  Int
  wardsKilled  Int
  gold         Int

  baronKills     Int
  dragonKills    Int
  heraldKills    Int
  hordeKills     Int
  atakhanKills   Int
  turretKills    Int
  inhibitorKills Int

  @@unique([gameResultId, puuid])
}
```

- [ ] **Step 2: Migrate dev and test databases, regenerate the client**

Postgres must be up (`docker compose up -d`, from PowerShell — see CLAUDE.md).

Run (repo root):
```bash
npm run migrate --workspace=@lolpamin/db -- --name add_replay_player_stats
```
Expected: a new folder `packages/db/prisma/migrations/<timestamp>_add_replay_player_stats/` with `CREATE TABLE "ReplayPlayerStat"` and two `ALTER TABLE ... ADD COLUMN` lines; the client regenerates.

Apply to the test DB (bash, repo root):
```bash
cd packages/db && DATABASE_URL="$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d= -f2- | tr -d '"')" npx prisma migrate deploy; cd ../..
```
Expected: `1 migration applied` (or "All migrations have been successfully applied").

In `packages/db/src/test-utils.ts`, add as the line directly **before** `await client.gameParticipant.deleteMany();`:

```ts
  await client.replayPlayerStat.deleteMany();
```

- [ ] **Step 3: Narrow `computeReplayKey`'s input**

In `apps/dashboard/lib/replay-import/replay-key.ts` replace the import and signature:

```ts
import { createHash } from "node:crypto";

// ...existing doc comment stays, add one line at its end:
//  * 저장 시에는 클라이언트가 돌려보낸 선수 배열로 다시 계산해 요청의 키와 맞는지 확인한다.
export function computeReplayKey(meta: { gameLengthMs: number; players: ReadonlyArray<{ puuid: string }> }): string {
  const puuids = meta.players.map((p) => p.puuid).sort();
  return createHash("sha256").update(`${puuids.join(",")}|${meta.gameLengthMs}`).digest("hex");
}
```

(Remove the now-unused `import type { ReplayMetadata } from "@lolpamin/core";`.)

- [ ] **Step 4: Test helpers**

Append to `apps/dashboard/lib/replay-import/test-fixture.ts`:

```ts
import type { ReplayPlayer } from "@lolpamin/core";
import { computeReplayKey } from "./replay-key";

/** One parsed replay player with plausible stats — what the preview hands back on save. */
export function replayPlayer(puuid: string, team: "BLUE" | "RED", overrides: Partial<ReplayPlayer> = {}): ReplayPlayer {
  return {
    puuid,
    gameName: `name-${puuid}`,
    tagLine: "KR1",
    team,
    win: team === "BLUE",
    position: "TOP",
    champion: "Yone",
    level: 15,
    kills: 1,
    deaths: 2,
    assists: 3,
    cs: 145,
    wasAfk: false,
    wasLeaver: false,
    secondsDisconnected: 0,
    spell1: 4,
    spell2: 14,
    keystone: 8010,
    subStyle: 8300,
    items: [3047, 0, 0, 0, 0, 0, 3364],
    damageDealt: 10000,
    damageTaken: 12000,
    controlWards: 1,
    wardsPlaced: 5,
    wardsKilled: 2,
    gold: 9000,
    baronKills: 0,
    dragonKills: 0,
    heraldKills: 0,
    hordeKills: 0,
    atakhanKills: 0,
    turretKills: 0,
    inhibitorKills: 0,
    ...overrides,
  };
}

/** The replayKey + replay payload saveReplayImport expects for these slots, key computed to match. */
export function replayInput(assignments: Array<{ puuid: string; team: "BLUE" | "RED" }>, gameLengthMs = 1584502) {
  const replay = { gameLengthMs, players: assignments.map((a) => replayPlayer(a.puuid, a.team)) };
  return { replayKey: computeReplayKey(replay), replay };
}
```

Move the two new `import` lines to the top of the file with the other imports (the file currently has none; put them at line 1).

- [ ] **Step 5: Port the existing save tests to the new input**

In `apps/dashboard/lib/mutations/save-replay-import.test.ts`:

1. Change the fixture import line to:
   ```ts
   import { buildRoflFixture, replayInput, tenPlayers } from "../replay-import/test-fixture";
   ```
   and add `import { parseRoflMetadata } from "@lolpamin/core";`.

2. In every `saveReplayImport(prisma, { replayKey: "key-N", ..., assignments: [...] })` call (keys `key-aram`, `key-1` … `key-12`), hoist the assignments array into a `const assignments = [...]` declared just before the call, delete the `replayKey: "key-N",` line, and spread `...replayInput(assignments),` as the first property. Example — the "saves the game with the given mode" test becomes:

   ```ts
    const assignments = [assignment("p-blue2", "BLUE", blue.id), assignment("p-red2", "RED", red.id)];
    const result = await saveReplayImport(prisma, {
      ...replayInput(assignments),
      playedAt: new Date("2026-09-16T12:00:00Z"),
      winner: "BLUE",
      assignments,
      mode: "ARAM",
    });
   ```

3. In "registers a riot account for every assigned slot and records the game", replace `expect(game.replayKey).toBe("key-1");` with `expect(game.replayKey).toBe(replayInput(assignments).replayKey);`.

4. In "refuses a replay that was already imported", build `input` as:
   ```ts
    const assignments = [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)];
    const input = {
      ...replayInput(assignments),
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE" as const,
      assignments,
    };
   ```

5. In "clears replayKey on cancellation so the same replay can be re-imported", pass the parsed replay alongside the prepared key:
   ```ts
    const bytes = buildRoflFixture(tenPlayers());
    const { replayKey } = await prepareReplayImport(prisma, bytes);
    const meta = parseRoflMetadata(bytes);

    const saved = await saveReplayImport(prisma, {
      replayKey,
      replay: { gameLengthMs: meta.gameLengthMs, players: meta.players },
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments: [assignment("puuid-0", "BLUE", blue.id), assignment("puuid-5", "RED", red.id)],
    });
   ```

- [ ] **Step 6: Write the new failing tests**

Append inside `describe("saveReplayImport", ...)`:

```ts
  it("stores every player's stats, outsiders included, and the game length", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const assignments = [
      assignment("p-blue", "BLUE", blue.id),
      assignment("p-red", "RED", red.id),
      assignment("p-outsider", "RED", null),
    ];
    const input = replayInput(assignments, 1743915);

    const result = await saveReplayImport(prisma, {
      ...input,
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments,
    });

    const rows = await prisma.replayPlayerStat.findMany({ where: { gameResultId: result.gameResultId } });
    expect(rows.map((r) => r.puuid).sort()).toEqual(["p-blue", "p-outsider", "p-red"]);
    const outsider = rows.find((r) => r.puuid === "p-outsider")!;
    expect(outsider).toMatchObject({ team: "RED", champion: "Yone", damageDealt: 10000, items: [3047, 0, 0, 0, 0, 0, 3364] });

    const game = await prisma.gameResult.findUniqueOrThrow({ where: { id: result.gameResultId } });
    expect(game.gameLengthMs).toBe(1743915);
  });

  it("records which riot account each member played the game on", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const assignments = [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)];

    const result = await saveReplayImport(prisma, {
      ...replayInput(assignments),
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments,
    });

    const participants = await prisma.gameParticipant.findMany({ where: { gameResultId: result.gameResultId } });
    expect(Object.fromEntries(participants.map((p) => [p.memberId, p.replayPuuid]))).toEqual({
      [blue.id]: "p-blue",
      [red.id]: "p-red",
    });
  });

  it("refuses stats that do not belong to the replay key and writes nothing", async () => {
    // A stale tab after a re-upload, or a hand-edited request, must not attach another game's stats.
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const assignments = [assignment("p-blue", "BLUE", blue.id), assignment("p-red", "RED", red.id)];
    const { replayKey } = replayInput(assignments);
    const other = replayInput([assignment("p-blue", "BLUE", blue.id), assignment("p-someone", "RED", null)]);

    await expect(
      saveReplayImport(prisma, {
        replayKey,
        replay: other.replay,
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments,
      }),
    ).rejects.toThrow(SAVE_REPLAY_IMPORT_ERRORS.replayMismatch);

    expect(await prisma.gameResult.count()).toBe(0);
    expect(await prisma.riotAccount.count()).toBe(0);
    expect(await prisma.replayPlayerStat.count()).toBe(0);
  });

  it("refuses an assignment for a puuid the replay does not contain", async () => {
    const blue = await linkedMember("blue");
    const red = await linkedMember("red");
    const { replayKey, replay } = replayInput([
      assignment("p-blue", "BLUE", blue.id),
      assignment("p-red", "RED", red.id),
    ]);

    await expect(
      saveReplayImport(prisma, {
        replayKey,
        replay,
        playedAt: new Date("2026-09-05T12:00:00Z"),
        winner: "BLUE",
        assignments: [assignment("p-blue", "BLUE", blue.id), assignment("p-intruder", "RED", red.id)],
      }),
    ).rejects.toThrow(SAVE_REPLAY_IMPORT_ERRORS.replayMismatch);
  });
```

- [ ] **Step 7: Run to verify failure**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/save-replay-import.test.ts`
Expected: the four new tests FAIL (`replayMismatch` undefined / no rows); ported tests may pass or fail on unknown `replay` key — either is fine at this step.

- [ ] **Step 8: Implement the save**

In `apps/dashboard/lib/mutations/save-replay-import.ts`:

Imports:

```ts
import type { GameMode, PrismaClient } from "@lolpamin/db";
import type { ReplayPlayer } from "@lolpamin/core";
import { saveGameResultTx, type SaveGameResultOutput } from "./save-game-result";
import { computeReplayKey } from "../replay-import/replay-key";
```

Add to `SaveReplayImportInput` (after `replayKey`):

```ts
  /**
   * 미리보기가 파일에서 읽은 그대로의 경기 정보. 파일을 다시 올리지 않으려고 클라이언트가
   * 돌려보내므로, 저장 전에 replayKey를 다시 계산해 같은 경기인지 확인한다.
   */
  replay: { gameLengthMs: number; players: ReplayPlayer[] };
```

Add to `SAVE_REPLAY_IMPORT_ERRORS`:

```ts
  replayMismatch: "리플레이 정보가 일치하지 않습니다.",
```

In `saveReplayImport`, destructure `replay` too, and put this before the existing duplicate-member check:

```ts
  const { replayKey, replay, playedAt, winner, assignments, createdById = null, mode = "RIFT" } = input;

  // 클라이언트가 돌려보낸 스탯이 이 키의 경기인지 확인한다. 수치 조작까지 막지는 않는다 —
  // 관리자 전용 경로이고, 막으려는 것은 다른 경기(오래된 탭, 재업로드)의 스탯이 끼어드는 일이다.
  const replayPuuids = new Set(replay.players.map((p) => p.puuid));
  if (computeReplayKey(replay) !== replayKey || assignments.some((a) => !replayPuuids.has(a.puuid))) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.replayMismatch);
  }
```

Inside the transaction, after `const result = await saveGameResultTx(...)` and before the `lastActiveAt` update, add:

```ts
      for (const a of assignments) {
        if (a.memberId === null) continue;
        await tx.gameParticipant.update({
          where: { gameResultId_memberId: { gameResultId: result.gameResultId, memberId: a.memberId } },
          data: { replayPuuid: a.puuid },
        });
      }
      await tx.gameResult.update({
        where: { id: result.gameResultId },
        data: { gameLengthMs: replay.gameLengthMs },
      });
      // 필드를 하나씩 고른다 — 클라이언트가 보낸 객체를 그대로 펼치면 모르는 키가 섞여 들어와
      // createMany가 거부한다.
      await tx.replayPlayerStat.createMany({
        data: replay.players.map((p) => ({
          gameResultId: result.gameResultId,
          puuid: p.puuid,
          gameName: p.gameName,
          tagLine: p.tagLine,
          team: p.team,
          position: p.position,
          champion: p.champion,
          level: p.level,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.cs,
          spell1: p.spell1,
          spell2: p.spell2,
          keystone: p.keystone,
          subStyle: p.subStyle,
          items: p.items,
          damageDealt: p.damageDealt,
          damageTaken: p.damageTaken,
          controlWards: p.controlWards,
          wardsPlaced: p.wardsPlaced,
          wardsKilled: p.wardsKilled,
          gold: p.gold,
          baronKills: p.baronKills,
          dragonKills: p.dragonKills,
          heraldKills: p.heraldKills,
          hordeKills: p.hordeKills,
          atakhanKills: p.atakhanKills,
          turretKills: p.turretKills,
          inhibitorKills: p.inhibitorKills,
        })),
      });
```

In `apps/dashboard/app/replay-import/actions.ts`, add to `SaveReplayImportActionInput` after `replayKey`:

```ts
  /** 미리보기가 받은 경기 정보를 그대로 돌려보낸다. 서버가 replayKey로 대조한다. */
  replay: { gameLengthMs: number; players: ReplayPlayer[] };
```

with `import type { ReplayPlayer } from "@lolpamin/core";` at the top. (`saveReplayImportAction` already spreads `...input`, so no body change.)

- [ ] **Step 9: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/save-replay-import.test.ts lib/replay-import`
Expected: all PASS.

`ReplayImportForm.tsx` now fails to type-check: its `saveReplayImportAction({...})` call lacks `replay`. The real value (`prepared.players`) only exists after Task 8, so add a placeholder to that call now:
```ts
        // Task 8 replaces this with the preview's own players.
        replay: { gameLengthMs: prepared.gameLengthMs, players: [] },
```
Until Task 8 lands, a real save from the UI fails with `replayMismatch` — expected. Tasks 4–8 ship together; do not deploy between them.

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: only the 2 baseline errors in `lib/draw/candidates.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add packages/db apps/dashboard/lib/replay-import apps/dashboard/lib/mutations/save-replay-import.ts apps/dashboard/lib/mutations/save-replay-import.test.ts apps/dashboard/app/replay-import/actions.ts apps/dashboard/components/ReplayImportForm.tsx
git commit -m "feat(replay-import): store every player's replay stats and the account each member played on"
```

---

### Task 5: Game detail in the history query

**Files:**
- Create: `apps/dashboard/lib/game-detail/types.ts`
- Modify: `apps/dashboard/lib/queries/game-history.ts`
- Test: `apps/dashboard/lib/queries/game-history.test.ts`

**Interfaces:**
- Consumes: Prisma `replayStats`, `replayPuuid`, `gameLengthMs` (Task 4); `replayInput` (Task 4); `absorbMember(prisma, loserId, survivorId)`.
- Produces:
  ```ts
  // lib/game-detail/types.ts
  export interface GameDetailMember { name: string; mmrBefore: number; mmrAfter: number | null }
  export interface GameDetailPlayer extends ReplayPlayerStats { member: GameDetailMember | null }
  export interface GameDetail { winner: "BLUE" | "RED"; mode: GameMode; gameLengthMs: number; players: GameDetailPlayer[] }
  // game-history.ts
  GameHistoryRow.detail: GameDetail | null
  ```

- [ ] **Step 1: Types**

Create `apps/dashboard/lib/game-detail/types.ts`:

```ts
import type { ReplayPlayerStats } from "@lolpamin/core";
import type { GameMode } from "@lolpamin/db";

/**
 * The member behind a replay player. mmrAfter is null only in the upload preview when the
 * change cannot be computed yet (a team with no member assigned).
 */
export interface GameDetailMember {
  name: string;
  mmrBefore: number;
  mmrAfter: number | null;
}

export interface GameDetailPlayer extends ReplayPlayerStats {
  /** null for an outsider — someone who played but is not one of our members. */
  member: GameDetailMember | null;
}

export interface GameDetail {
  winner: "BLUE" | "RED";
  mode: GameMode;
  gameLengthMs: number;
  players: GameDetailPlayer[];
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/dashboard/lib/queries/game-history.test.ts` add imports:

```ts
import { saveReplayImport } from "@/lib/mutations/save-replay-import";
import { absorbMember } from "@/lib/mutations/absorb-member";
import { replayInput } from "@/lib/replay-import/test-fixture";
```

and append inside `describe("getGameHistory", ...)`:

```ts
  it("has no detail for a hand-entered game", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    await playGame([blue], [red], "BLUE");

    const [row] = (await getGameHistory()).rows;

    expect(row.detail).toBeNull();
  });

  it("attaches the replay board with members, their mmr change and outsiders", async () => {
    const blue = await createLinkedMember("블루", 1000);
    const red = await createLinkedMember("레드", 1000);
    const assignments = [
      { puuid: "p-blue", gameName: "name-p-blue", tagLine: "KR1", team: "BLUE" as const, memberId: blue.id },
      { puuid: "p-red", gameName: "name-p-red", tagLine: "KR1", team: "RED" as const, memberId: red.id },
      { puuid: "p-out", gameName: "name-p-out", tagLine: "KR9", team: "RED" as const, memberId: null },
    ];
    await saveReplayImport(prisma, {
      ...replayInput(assignments, 1743915),
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments,
    });

    const [row] = (await getGameHistory()).rows;

    expect(row.detail).not.toBeNull();
    expect(row.detail!.gameLengthMs).toBe(1743915);
    expect(row.detail!.winner).toBe("BLUE");
    const byPuuid = new Map(row.detail!.players.map((p) => [p.puuid, p]));
    expect(byPuuid.get("p-blue")!.member).toEqual({
      name: "블루",
      mmrBefore: 1000,
      mmrAfter: row.winners[0].mmrAfter,
    });
    expect(byPuuid.get("p-out")!.member).toBeNull();
    expect(byPuuid.get("p-out")!.champion).toBe("Yone");
  });

  it("names the survivor on a replay the absorbed member played", async () => {
    // The board follows GameParticipant.memberId, which absorbMember moves to the survivor.
    const blue = await createLinkedMember("블루", 1000);
    const kakaoOnly = await prisma.member.create({ data: { realName: "카톡쪽", kakaoNickname: "유대혁/95/유대혁#KR1" } });
    const survivor = await prisma.member.create({ data: { realName: "생존자", discordUserId: "d-survivor" } });
    const assignments = [
      { puuid: "p-blue", gameName: "name-p-blue", tagLine: "KR1", team: "BLUE" as const, memberId: blue.id },
      { puuid: "p-half", gameName: "name-p-half", tagLine: "KR1", team: "RED" as const, memberId: kakaoOnly.id },
    ];
    await saveReplayImport(prisma, {
      ...replayInput(assignments),
      playedAt: new Date("2026-09-05T12:00:00Z"),
      winner: "BLUE",
      assignments,
    });

    await absorbMember(prisma, kakaoOnly.id, survivor.id);

    const [row] = (await getGameHistory()).rows;
    const half = row.detail!.players.find((p) => p.puuid === "p-half")!;
    expect(half.member?.name).toBe("생존자");
  });
```

- [ ] **Step 3: Run to verify failure**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/game-history.test.ts`
Expected: new tests FAIL (`row.detail` is `undefined`).

- [ ] **Step 4: Implement**

In `apps/dashboard/lib/queries/game-history.ts`:

Add import: `import type { GameDetail } from "@/lib/game-detail/types";`

Add to `GameHistoryRow` after `losers`:

```ts
  // 리플레이로 저장한 판의 상세 보드. 손으로 입력한 판과 이 기능 이전에 올린 판은 null이다.
  detail: GameDetail | null;
```

In the `findMany` `include`, add `replayStats: true,` next to `participants`.

In `rows = games.map((game) => { ... })`, before `return {`, add:

```ts
    // 보드의 회원·MMR은 그 판을 뛴 계정(replayPuuid)으로 찾는다. 읽는 시점의 RiotAccount가
    // 아니라서 계정 주인이 나중에 바뀌어도 과거 경기의 표시는 그대로이고, 흡수는
    // GameParticipant.memberId를 옮기므로 생존자 이름이 자연스럽게 따라온다.
    const participantByPuuid = new Map(
      game.participants.filter((p) => p.replayPuuid !== null).map((p) => [p.replayPuuid!, p]),
    );
    const detail: GameDetail | null =
      game.replayStats.length === 0 || game.gameLengthMs === null
        ? null
        : {
            winner: game.winner as "BLUE" | "RED",
            mode: game.mode,
            gameLengthMs: game.gameLengthMs,
            players: game.replayStats.map(({ id: _id, gameResultId: _gameResultId, ...stat }) => {
              const participant = participantByPuuid.get(stat.puuid);
              return {
                ...stat,
                team: stat.team as "BLUE" | "RED",
                member: participant
                  ? {
                      name: playerName(participant.member),
                      mmrBefore: participant.mmrBefore,
                      mmrAfter: participant.mmrAfter,
                    }
                  : null,
              };
            }),
          };
```

and add `detail,` to the returned row object.

- [ ] **Step 5: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/game-history.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/game-detail/types.ts apps/dashboard/lib/queries/game-history.ts apps/dashboard/lib/queries/game-history.test.ts
git commit -m "feat(match-history): load the replay board for each replay-imported game"
```

---

### Task 6: `GameDetailBoard` component

**Files:**
- Create: `apps/dashboard/components/GameDetailBoard.tsx`

**Interfaces:**
- Consumes: `GameDetail`, `GameDetailPlayer` (Task 5); `summarizeReplayTeams`, `killParticipation`, `kdaRatio`, `compareLane` (Task 2); ddragon lookups (Task 3).
- Produces: `export function GameDetailBoard({ detail }: { detail: GameDetail }): JSX.Element`

There is no component test harness in this repo (vitest runs in node, no DOM). This task is verified by type check here and visually in Tasks 7–8.

- [ ] **Step 1: Write the component**

Create `apps/dashboard/components/GameDetailBoard.tsx`:

```tsx
// OP.GG-style board for one replay-imported game: each team's five players with champion,
// spells, runes, KDA, damage, wards, CS and items, and the teams' objectives between them.
// Purely presentational — both /match-history and the /replay-import preview feed it a GameDetail.
import { compareLane, kdaRatio, killParticipation, summarizeReplayTeams, type TeamSummary } from "@lolpamin/core";
import type { GameDetail, GameDetailPlayer } from "@/lib/game-detail/types";
import {
  championIcon,
  championName,
  itemIcon,
  itemName,
  runeIcon,
  runeName,
  spellIcon,
  spellName,
} from "@/lib/ddragon/assets";

const TEAMS = ["BLUE", "RED"] as const;
type TeamSide = (typeof TEAMS)[number];

const TEAM_LABEL: Record<TeamSide, string> = { BLUE: "블루팀", RED: "레드팀" };

// Desktop columns: player | KDA | damage | wards | CS | items.
const GRID = "grid grid-cols-[minmax(0,1fr)_112px_150px_72px_80px_214px] items-center gap-x-3";

const RIFT_OBJECTIVES: Array<[keyof TeamSummary, string]> = [
  ["baron", "바론"],
  ["dragon", "용"],
  ["herald", "전령"],
  ["horde", "유충"],
  ["atakhan", "아타칸"],
  ["turret", "포탑"],
  ["inhibitor", "억제기"],
];
// ARAM has no epic monsters; only structures mean anything there.
const ARAM_OBJECTIVES = RIFT_OBJECTIVES.filter(([key]) => key === "turret" || key === "inhibitor");

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function Icon({ src, title, className }: { src: string | null; title: string; className: string }) {
  // An id the committed patch does not know is drawn as an empty square, never a broken image.
  if (src === null) return <span className={`inline-block bg-ink/[.08] ${className}`} title={title} />;
  return <img src={src} alt={title} title={title} loading="lazy" className={className} />;
}

function ratioClass(ratio: string): string {
  if (ratio === "Perfect") return "text-orange";
  const value = Number(ratio);
  if (value >= 5) return "text-orange";
  if (value >= 3) return "text-success-soft";
  return "text-muted";
}

function MemberLine({ player }: { player: GameDetailPlayer }) {
  if (player.member === null) return <span className="text-faint">#{player.tagLine}</span>;
  const { name, mmrBefore, mmrAfter } = player.member;
  if (mmrAfter === null) {
    return (
      <span>
        {name} · <span className="font-mono">{mmrBefore}</span>
      </span>
    );
  }
  const delta = mmrAfter - mmrBefore;
  return (
    <span>
      {name} ·{" "}
      <span className="font-mono">
        {mmrBefore}→{mmrAfter}
      </span>{" "}
      <span className={`font-mono ${delta >= 0 ? "text-success-soft" : "text-danger-soft"}`}>
        ({delta > 0 ? `+${delta}` : delta})
      </span>
    </span>
  );
}

function Portrait({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    <div className={`relative flex-none ${box}`}>
      <Icon src={championIcon(player.champion)} title={championName(player.champion)} className={`${box} rounded-full`} />
      <span className="absolute -bottom-1 -right-1 rounded-full bg-page px-1 font-mono text-[10px] leading-4 text-fg-2">
        {player.level}
      </span>
    </div>
  );
}

function Spells({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-[19px] w-[19px]" : "h-4 w-4";
  return (
    <div className="flex flex-none flex-col gap-0.5">
      <Icon src={spellIcon(player.spell1)} title={spellName(player.spell1)} className={`${box} rounded`} />
      <Icon src={spellIcon(player.spell2)} title={spellName(player.spell2)} className={`${box} rounded`} />
    </div>
  );
}

function Runes({ player }: { player: GameDetailPlayer }) {
  return (
    <div className="flex flex-none flex-col gap-0.5">
      <Icon src={runeIcon(player.keystone)} title={runeName(player.keystone)} className="h-[19px] w-[19px] rounded-full bg-page" />
      <Icon src={runeIcon(player.subStyle)} title={runeName(player.subStyle)} className="h-[19px] w-[19px] p-0.5" />
    </div>
  );
}

function Items({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-7 w-7" : "h-6 w-6";
  return (
    <div className="flex gap-0.5">
      {player.items.map((id, slot) => (
        <Icon key={slot} src={itemIcon(id)} title={itemName(id)} className={`${box} rounded`} />
      ))}
    </div>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const width = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-sm bg-ink/[.08]">
      <div className={`h-full rounded-sm ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

interface RowContext {
  teamKills: number;
  minutes: number;
  maxDealt: number;
  maxTaken: number;
}

function DesktopRow({ player, ctx }: { player: GameDetailPlayer; ctx: RowContext }) {
  const ratio = kdaRatio(player.kills, player.deaths, player.assists);
  return (
    <div className={`${GRID} px-4 py-2`}>
      <div className="flex min-w-0 items-center gap-2">
        <Portrait player={player} size="lg" />
        <Spells player={player} size="lg" />
        <Runes player={player} />
        <div className="min-w-0 pl-1">
          <div className="truncate text-[13.5px] font-bold text-fg">{player.gameName}</div>
          <div className="truncate text-[12px] text-muted">
            <MemberLine player={player} />
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="font-mono text-[12.5px] text-fg-2">
          {player.kills}/{player.deaths}/{player.assists}{" "}
          <span className="text-faint">({killParticipation(player.kills, player.assists, ctx.teamKills)}%)</span>
        </div>
        <div className={`font-mono text-[12.5px] font-bold ${ratioClass(ratio)}`}>
          {ratio === "Perfect" ? ratio : `${ratio}:1`}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11.5px] text-muted">
        <span className="text-center">{formatNumber(player.damageDealt)}</span>
        <span className="text-center">{formatNumber(player.damageTaken)}</span>
        <Bar value={player.damageDealt} max={ctx.maxDealt} className="bg-danger" />
        <Bar value={player.damageTaken} max={ctx.maxTaken} className="bg-ink/[.35]" />
      </div>
      <div className="text-center font-mono text-[12px] text-muted">
        <div>{player.controlWards}</div>
        <div>
          {player.wardsPlaced} / {player.wardsKilled}
        </div>
      </div>
      <div className="text-center font-mono text-[12px] text-muted">
        <div>{player.cs}</div>
        <div>분당 {ctx.minutes === 0 ? 0 : Math.round((player.cs / ctx.minutes) * 10) / 10}</div>
      </div>
      <Items player={player} size="lg" />
    </div>
  );
}

function MobileRow({ player, ctx }: { player: GameDetailPlayer; ctx: RowContext }) {
  const ratio = kdaRatio(player.kills, player.deaths, player.assists);
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Portrait player={player} size="sm" />
        <Spells player={player} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-fg">{player.gameName}</div>
          <div className="truncate text-[11.5px] text-muted">
            <MemberLine player={player} />
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="font-mono text-[12px] text-fg-2">
            {player.kills}/{player.deaths}/{player.assists}
          </div>
          <div className={`font-mono text-[11.5px] font-bold ${ratioClass(ratio)}`}>
            {ratio === "Perfect" ? ratio : `${ratio}:1`}
            <span className="ml-1 font-normal text-faint">
              {killParticipation(player.kills, player.assists, ctx.teamKills)}%
            </span>
          </div>
        </div>
      </div>
      <div className="pl-10">
        <Items player={player} size="sm" />
      </div>
    </div>
  );
}

function TeamBlock({
  team,
  detail,
  players,
  ctx,
}: {
  team: TeamSide;
  detail: GameDetail;
  players: GameDetailPlayer[];
  ctx: RowContext;
}) {
  const won = detail.winner === team;
  const tint = won ? "bg-accent/[.07]" : "bg-danger/[.07]";
  const header = (
    <>
      <span className={`font-bold ${won ? "text-accent-soft" : "text-danger-soft"}`}>{won ? "승리" : "패배"}</span>{" "}
      <span className="text-faint">({TEAM_LABEL[team]})</span>
    </>
  );
  return (
    <div>
      <div className="hidden md:block">
        <div className={`${GRID} border-b border-ink/[.06] px-4 py-2 text-[12.5px] text-faint`}>
          <div>{header}</div>
          <div className="text-center">KDA</div>
          <div className="text-center">피해량</div>
          <div className="text-center">와드</div>
          <div className="text-center">CS</div>
          <div className="text-center">아이템</div>
        </div>
        <div className={`divide-y divide-ink/[.05] ${tint}`}>
          {players.map((p) => (
            <DesktopRow key={p.puuid} player={p} ctx={ctx} />
          ))}
        </div>
      </div>
      <div className="md:hidden">
        <div className="border-b border-ink/[.06] px-3 py-2 text-[12.5px]">{header}</div>
        <div className={`divide-y divide-ink/[.05] ${tint}`}>
          {players.map((p) => (
            <MobileRow key={p.puuid} player={p} ctx={ctx} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Objectives({ summary, objectives, align }: { summary: TeamSummary; objectives: typeof RIFT_OBJECTIVES; align: "start" | "end" }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted ${align === "end" ? "md:justify-end" : ""}`}>
      {objectives.map(([key, label]) => (
        <span key={key}>
          {label} <span className="font-mono text-fg-2">{summary[key]}</span>
        </span>
      ))}
    </div>
  );
}

function VersusBar({ label, blue, red }: { label: string; blue: number; red: number }) {
  const total = blue + red;
  const bluePct = total === 0 ? 50 : Math.round((blue / total) * 100);
  return (
    <div className="relative flex h-6 overflow-hidden rounded text-[12px] font-bold text-white">
      <div className="flex items-center bg-accent pl-2" style={{ width: `${bluePct}%` }}>
        {formatNumber(blue)}
      </div>
      <div className="flex flex-1 items-center justify-end bg-danger pr-2">{formatNumber(red)}</div>
      <span className="absolute inset-0 flex items-center justify-center">{label}</span>
    </div>
  );
}

export function GameDetailBoard({ detail }: { detail: GameDetail }) {
  const summary = summarizeReplayTeams(detail.players);
  const objectives = detail.mode === "ARAM" ? ARAM_OBJECTIVES : RIFT_OBJECTIVES;
  const minutes = detail.gameLengthMs / 60000;
  const maxDealt = Math.max(0, ...detail.players.map((p) => p.damageDealt));
  const maxTaken = Math.max(0, ...detail.players.map((p) => p.damageTaken));
  const teamPlayers = (team: TeamSide) => detail.players.filter((p) => p.team === team).sort(compareLane);
  const ctx = (team: TeamSide): RowContext => ({ teamKills: summary[team].kills, minutes, maxDealt, maxTaken });

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[.07] bg-surface">
      <TeamBlock team="BLUE" detail={detail} players={teamPlayers("BLUE")} ctx={ctx("BLUE")} />
      <div className="grid grid-cols-1 items-center gap-2 border-y border-ink/[.06] bg-surface-2 px-4 py-3 md:grid-cols-[1fr_2fr_1fr]">
        <Objectives summary={summary.BLUE} objectives={objectives} align="start" />
        <div className="flex flex-col gap-1.5">
          <VersusBar label="총 킬" blue={summary.BLUE.kills} red={summary.RED.kills} />
          <VersusBar label="총 골드" blue={summary.BLUE.gold} red={summary.RED.gold} />
        </div>
        <Objectives summary={summary.RED} objectives={objectives} align="end" />
      </div>
      <TeamBlock team="RED" detail={detail} players={teamPlayers("RED")} ctx={ctx("RED")} />
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: only the 2 baseline errors.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/components/GameDetailBoard.tsx
git commit -m "feat(dashboard): game detail board for replay-imported games"
```

---

### Task 7: Expand button on `/match-history`

**Files:**
- Modify: `apps/dashboard/components/GameHistoryList.tsx`

**Interfaces:**
- Consumes: `GameHistoryRow.detail` (Task 5), `GameDetailBoard` (Task 6).

- [ ] **Step 1: Implement**

In `apps/dashboard/components/GameHistoryList.tsx`:

Add import: `import { GameDetailBoard } from "@/components/GameDetailBoard";`

Inside `GameHistoryList`, next to the other state:

```tsx
  // 펼친 판. 쪽을 넘기면 다른 판이 오므로 URL에 남기지 않는다.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
```

In the header row (`<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">`), replace the admin cancel button block with a right-aligned group holding both buttons:

```tsx
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && row.canCancel && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleCancel(row.id)}
                  className="rounded-lg bg-raised px-3 py-1.5 text-[13px] font-bold text-fg-2 transition-colors hover:bg-raised-hover disabled:opacity-35"
                >
                  되돌리기
                </button>
              )}
              {row.detail !== null && (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-expanded={expanded.has(row.id)}
                  aria-label={expanded.has(row.id) ? "상세 접기" : "상세 보기"}
                  className="rounded-lg bg-raised px-2.5 py-1.5 text-[13px] font-bold text-fg-2 transition-colors hover:bg-raised-hover"
                >
                  <span className={`inline-block transition-transform ${expanded.has(row.id) ? "rotate-180" : ""}`}>▾</span>
                </button>
              )}
            </div>
```

After the winners/losers block (the closing `</div>` of `<div className="mt-3 flex flex-col gap-1.5 text-[13.5px]">`), add:

```tsx
          {row.detail !== null && expanded.has(row.id) && (
            <div className="mt-4">
              <GameDetailBoard detail={row.detail} />
            </div>
          )}
```

Note: the card has `opacity-60` when cancelled; that dims the board too, which is intended (spec: 취소된 경기도 흐리게).

- [ ] **Step 2: Type check**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: only the 2 baseline errors.

- [ ] **Step 3: Verify in the browser**

Seed one replay game in the dev DB by uploading `sample/KR-8387164987.rofl` — this is only possible after Task 8. So here: run `npm run dev --workspace=dashboard`, open `http://localhost:3000/match-history`, and confirm existing (hand-entered / old replay) games show **no** ▾ button and the page renders unchanged. Full visual check happens in Task 8 Step 7.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/GameHistoryList.tsx
git commit -m "feat(match-history): expand a replay-imported game into its detail board"
```

---

### Task 8: Preview on `/replay-import` and send the stats on save

**Files:**
- Create: `apps/dashboard/lib/replay-import/preview-mmr.ts`
- Create: `apps/dashboard/lib/replay-import/preview-mmr.test.ts`
- Modify: `apps/dashboard/lib/replay-import/prepare-import.ts`
- Test: `apps/dashboard/lib/replay-import/prepare-import.test.ts`
- Modify: `apps/dashboard/components/ReplayImportForm.tsx`

**Interfaces:**
- Consumes: `calculateTeamMmrChange`, `MmrConfig` from `@lolpamin/core`; `getMmrConfig(prisma)` from `@/lib/queries/mmr-config`; `GameDetail` (Task 5); `GameDetailBoard` (Task 6).
- Produces:
  ```ts
  // preview-mmr.ts
  export function previewReplayMmr(input: {
    assignments: Array<{ team: "BLUE" | "RED"; memberId: string | null }>;
    ratingOf: (memberId: string) => number;
    winner: "BLUE" | "RED";
    config: MmrConfig;
  }): Map<string, { mmrBefore: number; mmrAfter: number | null }>
  // prepare-import.ts
  MemberOption gains { mmr: number; aramMmr: number }
  PreparedReplayImport gains { players: ReplayPlayer[]; mmrConfig: MmrConfig }
  ```

- [ ] **Step 1: Write the failing test for the preview math**

Create `apps/dashboard/lib/replay-import/preview-mmr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateTeamMmrChange, DEFAULT_MMR_CONFIG } from "@lolpamin/core";
import { previewReplayMmr } from "./preview-mmr";

const ratings: Record<string, number> = { a: 1000, b: 1100, c: 1200 };
const ratingOf = (id: string) => ratings[id];

describe("previewReplayMmr", () => {
  it("applies the same team delta the save will, using the stored config", () => {
    const config = { k: 20, winPoint: 5, lossPoint: 2 };
    const preview = previewReplayMmr({
      assignments: [
        { team: "BLUE", memberId: "a" },
        { team: "BLUE", memberId: "b" },
        { team: "RED", memberId: "c" },
        { team: "RED", memberId: null },
      ],
      ratingOf,
      winner: "RED",
      config,
    });

    const { blueDelta, redDelta } = calculateTeamMmrChange({
      blueRatings: [1000, 1100],
      redRatings: [1200],
      winner: "RED",
      config,
    });
    expect(preview.get("a")).toEqual({ mmrBefore: 1000, mmrAfter: 1000 + blueDelta });
    expect(preview.get("b")).toEqual({ mmrBefore: 1100, mmrAfter: 1100 + blueDelta });
    expect(preview.get("c")).toEqual({ mmrBefore: 1200, mmrAfter: 1200 + redDelta });
    expect(preview.size).toBe(3);
  });

  it("shows current mmr without a change while one team has no member yet", () => {
    // calculateTeamMmrChange throws on an empty team; the form must not crash mid-assignment.
    const preview = previewReplayMmr({
      assignments: [
        { team: "BLUE", memberId: "a" },
        { team: "RED", memberId: null },
      ],
      ratingOf,
      winner: "BLUE",
      config: DEFAULT_MMR_CONFIG,
    });

    expect(preview.get("a")).toEqual({ mmrBefore: 1000, mmrAfter: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/replay-import/preview-mmr.test.ts`
Expected: FAIL — cannot resolve `./preview-mmr`.

- [ ] **Step 3: Implement the preview math**

Create `apps/dashboard/lib/replay-import/preview-mmr.ts`:

```ts
import { calculateTeamMmrChange, type MmrConfig } from "@lolpamin/core";

/**
 * The MMR each assigned member would end on if the admin saved right now — the upload
 * preview's stand-in for GameParticipant.mmrBefore/mmrAfter, which do not exist yet.
 * Uses the same team-average formula and stored config the save uses. While one team has
 * no member assigned the change is undefined (the save would refuse too), so members
 * show their current rating with mmrAfter null.
 */
export function previewReplayMmr(input: {
  assignments: Array<{ team: "BLUE" | "RED"; memberId: string | null }>;
  ratingOf: (memberId: string) => number;
  winner: "BLUE" | "RED";
  config: MmrConfig;
}): Map<string, { mmrBefore: number; mmrAfter: number | null }> {
  const ids = (team: "BLUE" | "RED") =>
    input.assignments.filter((a) => a.team === team && a.memberId !== null).map((a) => a.memberId!);
  const blue = ids("BLUE");
  const red = ids("RED");

  const result = new Map<string, { mmrBefore: number; mmrAfter: number | null }>();
  if (blue.length === 0 || red.length === 0) {
    for (const id of [...blue, ...red]) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: null });
    return result;
  }

  const { blueDelta, redDelta } = calculateTeamMmrChange({
    blueRatings: blue.map(input.ratingOf),
    redRatings: red.map(input.ratingOf),
    winner: input.winner,
    config: input.config,
  });
  for (const id of blue) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: input.ratingOf(id) + blueDelta });
  for (const id of red) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: input.ratingOf(id) + redDelta });
  return result;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/replay-import/preview-mmr.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the prepared payload**

Append inside the top-level `describe` of `apps/dashboard/lib/replay-import/prepare-import.test.ts`:

```ts
  it("hands the preview every player's stats, members' ratings and the stored mmr config", async () => {
    await prisma.member.create({ data: { realName: "레이팅", mmr: 1234, aramMmr: 987 } });
    await prisma.mmrSetting.create({ data: { id: "singleton", k: 30, winPoint: 4, lossPoint: 2 } });

    const prepared = await prepareReplayImport(prisma, buildRoflFixture(tenPlayers()));

    expect(prepared.players).toHaveLength(10);
    expect(prepared.players[0]).toHaveProperty("items");
    expect(prepared.members.find((m) => m.label.startsWith("레이팅"))).toMatchObject({ mmr: 1234, aramMmr: 987 });
    expect(prepared.mmrConfig).toEqual({ k: 30, winPoint: 4, lossPoint: 2 });
  });
```

Check that `prepare-import.test.ts` already imports `buildRoflFixture`, `tenPlayers` and has a `prisma` test client (it does — see its line ~217 test). If the `mmrSetting` model requires more columns (e.g. `updatedById`), read `packages/db/prisma/schema.prisma`'s `model MmrSetting` and add only the required ones.

- [ ] **Step 6: Run it to verify it fails, then implement**

Run (cwd `apps/dashboard`): `npx vitest run lib/replay-import/prepare-import.test.ts`
Expected: new test FAILS (`prepared.players` undefined).

In `apps/dashboard/lib/replay-import/prepare-import.ts`:

Imports:

```ts
import type { MmrConfig, ReplayPlayer } from "@lolpamin/core";
import { getMmrConfig } from "../queries/mmr-config";
```

(extend the existing `import type { ReplayPlayer } from "@lolpamin/core";` rather than duplicating it.)

`MemberOption` becomes:

```ts
export interface MemberOption {
  id: string;
  label: string;
  /** 미리보기의 예상 MMR용. 모드에 따라 둘 중 하나를 쓴다. */
  mmr: number;
  aramMmr: number;
}
```

`PreparedReplayImport` gains:

```ts
  /** 파일에서 읽은 10명 전체. 미리보기 보드가 그리고, 저장할 때 그대로 돌려보낸다. */
  players: ReplayPlayer[];
  /** 미리보기가 저장과 같은 계산을 하도록 /admins에 저장된 설정을 함께 내린다. */
  mmrConfig: MmrConfig;
```

In the `prisma.member.findMany` `select`, add `mmr: true, aramMmr: true,`. Extend the `Promise.all` to three entries: `const [accounts, members, mmrConfig] = await Promise.all([..., ..., getMmrConfig(prisma)]);`.

In the returned object: add `players: meta.players,` and `mmrConfig,`, and change the `members` mapping to
`members: members.map((m) => ({ id: m.id, label: memberLabel(m), mmr: m.mmr, aramMmr: m.aramMmr })),`.

Run (cwd `apps/dashboard`): `npx vitest run lib/replay-import`
Expected: all PASS.

- [ ] **Step 7: Wire the form**

In `apps/dashboard/components/ReplayImportForm.tsx`:

Imports:

```ts
import { GameDetailBoard } from "@/components/GameDetailBoard";
import type { GameDetail } from "@/lib/game-detail/types";
import { previewReplayMmr } from "@/lib/replay-import/preview-mmr";
```

After the `labelOf` line, add:

```tsx
  // 미리보기 보드. 배정·모드를 바꿀 때마다 예상 MMR을 다시 계산한다.
  const previewDetail = useMemo<GameDetail | null>(() => {
    if (!prepared) return null;
    const ratingOf = (memberId: string) => {
      const m = prepared.members.find((option) => option.id === memberId);
      return m ? (mode === "ARAM" ? m.aramMmr : m.mmr) : 1000;
    };
    const preview = previewReplayMmr({
      assignments: prepared.slots.map((s) => ({ team: s.team, memberId: state[s.puuid]?.memberId ?? null })),
      ratingOf,
      winner: prepared.winner,
      config: prepared.mmrConfig,
    });
    return {
      winner: prepared.winner,
      mode,
      gameLengthMs: prepared.gameLengthMs,
      players: prepared.players.map((p) => {
        const memberId = state[p.puuid]?.memberId ?? null;
        const mmr = memberId ? preview.get(memberId) : undefined;
        return { ...p, member: memberId && mmr ? { name: labelOf(memberId), ...mmr } : null };
      }),
    };
  }, [prepared, state, mode]);
```

In `handleSave`, replace the temporary `replay: { gameLengthMs: prepared.gameLengthMs, players: [] },` from Task 4 with:

```ts
        replay: { gameLengthMs: prepared.gameLengthMs, players: prepared.players },
```

In the JSX, directly after the `경기 날짜` `<label>…</label>` and before the slot grid `<div className="grid grid-cols-1 gap-3 md:grid-cols-2">`, add:

```tsx
          {previewDetail && <GameDetailBoard detail={previewDetail} />}
```

- [ ] **Step 8: Type check and run the whole dashboard suite**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: only the 2 baseline errors.

Run (repo root): `npm test`
Expected: all workspaces PASS.

- [ ] **Step 9: Verify in the browser**

Run `npm run dev --workspace=dashboard`, log in as admin, open `http://localhost:3000/replay-import`, upload `sample/KR-8387164987.rofl`.

Check:
- The board appears above the slot cards: 블루팀 on top (패배, red tint), 레드팀 below (승리, blue tint), five rows each ordered top→support.
- Every row shows a champion portrait with level, two spell icons (e.g. 트런들 row: 점화 + 점멸), keystone + secondary style, KDA with `(xx%)`, ratio, two damage numbers with bars, `0` / `8 / 2` wards for 드랍더비추, CS `168` / `분당 5.8`, seven item icons.
- Middle strip: 레드 포탑 10, 블루 포탑 3; 레드 유충 3; total kills/gold bars.
- Assigning a member to a slot makes `이름 · 1000→10xx (+xx)` appear; while one team has no member, only the current MMR shows.
- Switch 게임 모드 to 칼바람: objectives shrink to 포탑/억제기 and the MMR line uses 칼바람 MMR.
- Save. Then open `/match-history`: the new game has a ▾ button; clicking it shows the same board with stored `mmrBefore→mmrAfter`. At a 375px viewport (devtools), the mobile two-line rows render with no horizontal scroll.
- Switch the skin on `/admins` to `dark` and `pink`: board stays legible (no hex colours).

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/lib/replay-import apps/dashboard/components/ReplayImportForm.tsx
git commit -m "feat(replay-import): preview the game board with expected mmr before saving"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-23-replay-game-detail-design.md`

- [ ] **Step 1: CLAUDE.md**

In `CLAUDE.md`, after the paragraph that starts with "멱등성은 `GameResult.replayKey`" add a new paragraph:

```markdown
리플레이로 저장한 판은 **10명 전원**(외부인 포함)의 스탯을 `ReplayPlayerStat`에 남긴다 —
챔피언·주문·룬·KDA·피해량·와드·CS·골드·아이템·오브젝트 킬. 회원 FK가 없고, 회원과 그 판의
MMR 변화는 같은 경기의 `GameParticipant.replayPuuid`(그 회원이 뛴 계정)로 찾는다. 읽는 시점의
`RiotAccount`를 보지 않으므로 계정 주인을 나중에 바꿔도 과거 경기 표시는 그대로이고, 흡수는
`GameParticipant.memberId`를 옮기므로 생존자 이름이 따라온다. 저장 액션은 파일을 다시 받지 않고
미리보기가 받은 선수 배열을 돌려받는다 — 그래서 `saveReplayImport`가 그 배열로 `replayKey`를
다시 계산해 요청의 키와 다르면 `"리플레이 정보가 일치하지 않습니다."`로 거부한다. 이 기능 이전에
올린 판과 손 입력 판은 스탯이 없어 `/match-history`에 확장 버튼이 붙지 않는다(보강하지 않는다).
`GameResult.gameLengthMs`도 리플레이 판에만 있다.

아이콘은 `apps/dashboard/public/ddragon/`에 커밋된 Data Dragon 일부다. 원본 덤프(`16.18.1/` 같은
버전 폴더, 101MB)는 gitignore이고, `npx tsx scripts/sync-ddragon.ts <덤프>`(apps/dashboard에서)가
보드에 쓰는 이미지만 복사하고 `lib/ddragon/ddragon-map.json`을 만든다. 새 패치의 아이템·챔피언은
덤프를 교체해 스크립트를 다시 돌리기 전까지 빈 칸으로 나온다 — 모르는 id는 예외 없이 빈 칸이다.
```

Also in the `.rofl` paragraph (starts "`.rofl` 리플레이 임포트"), nothing changes — it still reads only the tail JSON.

- [ ] **Step 2: Spec corrections**

In `docs/superpowers/specs/2026-09-23-replay-game-detail-design.md`:
- Under "데이터 모델", after the `GameParticipant.replayPuuid` sentence, add: "`GameResult`에 `gameLengthMs Int?`를 추가한다. 분당 CS를 기록 화면에서도 계산하려면 경기 길이가 필요하다. 리플레이 판에만 값이 있다."
- Under "화면 → 가운데 띠", replace "오브젝트 아이콘은 인라인 SVG로 그린다(ddragon에 없음)." with "오브젝트는 한글 라벨(바론·용·전령·유충·아타칸·포탑·억제기)과 수로 표시한다 — ddragon에 아이콘이 없고, 글자가 더 알아보기 쉽다."

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-23-replay-game-detail-design.md
git commit -m "docs: record the replay stat table, replayPuuid linkage and the ddragon sync"
```
