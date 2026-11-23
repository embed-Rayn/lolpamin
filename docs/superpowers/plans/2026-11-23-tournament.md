# Tournament Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tournament` league page (standings, images, game/scrim list, admin `.rofl` upload mapping each side to team 1–4) whose games appear in match history and stats like rift games but never move MMR, switchable off after the event.

**Architecture:** `GameResult` gains `kind` (INTERNAL/TOURNAMENT/SCRIM) and `blueTeamSlot`/`redTeamSlot`. Tournament uploads run through the existing `saveReplayImport` path with a zero MMR delta. Every MMR-bound read/cancel filters `kind: "INTERNAL"`; stats/history/calendar do not. Tournament-only code lives in `app/tournament/`, `components/tournament/`, `lib/tournament/`, `packages/core/src/tournament-standings.ts`.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, vitest, Tailwind semantic tokens.

**Spec:** `docs/superpowers/specs/2026-11-23-tournament-design.md`

## Global Constraints

- Points: win +3, loss −1. Standings count `kind = TOURNAMENT`, `cancelledAt: null` only; scrims excluded; **no reset baseline**.
- Tournament/scrim games are always `mode: "RIFT"`.
- Team slots 1..4; a slot without a `TournamentTeam` row is named `` `${slot}팀` ``. Team name 1–20 chars after trim.
- Images: 5MB, `image/png|jpeg|webp|gif`, max 20. Served `private, no-store`.
- Switch: `SiteSetting.tournamentEnabled`, default `false`.
- Error copy (exact): `"대회 페이지가 꺼져 있습니다."`, `"블루와 레드에 같은 팀을 고를 수 없습니다."`, `"대회 경기는 협곡만 가능합니다."`, `"팀을 골라 주세요."`.
- UI copy Korean; code/comments/commits English. No hex colours — semantic tokens only. Every new DB test file keeps the `DATABASE_URL_TEST` guard. Pages rendering `AppShell` declare `export const dynamic = "force-dynamic"`.
- Mutations take `prisma` first; multi-row writes in `prisma.$transaction`.

## Review Focus

1. Internal game entered **after** a tournament game must still be cancellable, and its cancel button must still show on `/match-history` → Task 5 tests both.
2. `/player-stats?period=season` and `/champion-stats` must include tournament games while `/rift` 판수 excludes them → Task 3 test.
3. Server action called with `kind: "TOURNAMENT"` while switch is off must be refused, even if the UI was stale → Task 4 test.
4. Hand-crafted request with `kind: "SCRIM"`, `mode: "ARAM"`, or missing/equal/out-of-range slots must be refused → Task 4 tests.
5. Visitor fetching a tournament image while switch is off gets 404; admin still gets 200 → Task 6 query test.

---

### Task 1: Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (GameResult, SiteSetting; new enum + 2 models)
- Create: `packages/db/prisma/migrations/20261123120000_tournament/migration.sql` (via `prisma migrate dev --name tournament`, then rename folder timestamp is fine as generated)
- Modify: `packages/db/src/test-utils.ts`

**Interfaces:**
- Produces: `enum GameKind { INTERNAL TOURNAMENT SCRIM }`; `GameResult.kind GameKind @default(INTERNAL)`, `GameResult.blueTeamSlot Int?`, `GameResult.redTeamSlot Int?`, `@@index([kind, cancelledAt])`; `model TournamentTeam { slot Int @id; name String; updatedAt DateTime @updatedAt; updatedById String? }`; `model TournamentImage { id String @id @default(cuid()); position Int; bytes Bytes; type String; createdAt DateTime @default(now()) }`; `SiteSetting.tournamentEnabled Boolean @default(false)`.

- [ ] **Step 1:** Edit schema as above, with one-line English comments on why slots have no FK (default names need no seed rows).
- [ ] **Step 2:** Run `npm run migrate --workspace=@lolpamin/db -- --name tournament` then `npm run generate --workspace=@lolpamin/db`. Expected: migration created, client generated. Apply to test DB: `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy` (from `packages/db`).
- [ ] **Step 3:** Add `tournamentImage.deleteMany()` and `tournamentTeam.deleteMany()` to `resetDatabase`.
- [ ] **Step 4:** Run `npm test --workspace=dashboard`. Expected: all existing tests pass (default `INTERNAL`).
- [ ] **Step 5:** Commit `feat(db): game kind, tournament teams and images`.

### Task 2: Standings (core)

**Files:**
- Create: `packages/core/src/tournament-standings.ts`, `packages/core/src/tournament-standings.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TOURNAMENT_SLOTS = [1, 2, 3, 4] as const;
  export const TOURNAMENT_WIN_POINTS = 3;
  export const TOURNAMENT_LOSS_POINTS = -1;
  export function defaultTournamentTeamName(slot: number): string; // `${slot}팀`
  export interface TournamentGame { blueTeamSlot: number; redTeamSlot: number; winner: "BLUE" | "RED"; blueKills: number; redKills: number }
  export interface TournamentStanding { slot: number; name: string; rank: number; played: number; wins: number; losses: number; points: number; killDiff: number }
  export function aggregateTournamentStandings(games: TournamentGame[], names: Record<number, string>): TournamentStanding[];
  ```
  Caller passes only live TOURNAMENT games. Always returns 4 rows. Missing name → default.

- [ ] **Step 1: Failing tests**
  - `no games` → 4 rows, all 0, order slots 1..4, ranks 1,1,1,1 (ties share rank only when fully tied after all tie-breaks incl. H2H — slot order is display only, so equal teams share rank).
  - one game 1팀(blue, 20 kills) beats 3팀(red, 12 kills) → slot1 `{wins:1, losses:0, points:3, killDiff:8}`, slot3 `{wins:0, losses:1, points:-1, killDiff:-8}`; order 1,2,4,3 (2 and 4 at 0 points share rank 2).
  - killDiff sums across games and sides: slot1 as red in a second game losing 5–9 → slot1 killDiff `8 + (5−9) = 4`.
  - two-team H2H: 1 and 2 both 1W1L (points 2) but 2 beat 1 → 2 ranked above 1, even if 1 has the larger killDiff.
  - three-way tie: 1>2, 2>3, 3>1 all 1W1L → H2H wins each 1 → ordered by killDiff ↓; equal killDiff → same rank, ordered by slot.
  - `names` override: `{2: "불꽃"}` → slot2 name `"불꽃"`, others `"N팀"`.
- [ ] **Step 2:** Run `npx vitest run src/tournament-standings.test.ts` (cwd `packages/core`). Expected FAIL (module missing).
- [ ] **Step 3: Implement.** Sort by points ↓, wins ↓; then within each group sharing (points, wins) of size ≥2, compute each member's wins against other group members and sort by that ↓; then killDiff ↓; then slot ↑. Rank = 1 + number of teams strictly ahead on (points, wins, h2h, killDiff).
- [ ] **Step 4:** Run tests. Expected PASS. Export from `index.ts`.
- [ ] **Step 5:** Commit `feat(core): tournament standings`.

### Task 3: Split counted-games filter; bot

**Files:**
- Modify: `apps/dashboard/lib/queries/counted-games.ts`, `apps/dashboard/lib/queries/player-stats.ts:27`, `apps/discord-bot/src/lib/get-game-count.ts`
- Test: `apps/dashboard/lib/queries/counted-games.test.ts` (create), `apps/dashboard/lib/queries/player-stats.test.ts`, `apps/discord-bot/src/lib/get-game-count.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BaselineGameFilter { cancelledAt: null; createdAt?: { gt: Date } }
  export async function getBaselineGameFilter(prisma): Promise<BaselineGameFilter>; // stats: no kind
  export interface CountedGameFilter extends BaselineGameFilter { kind: "INTERNAL" }
  export async function getCountedGameFilter(prisma): Promise<CountedGameFilter>; // = baseline + kind
  ```
  `playerStatsGameFilter("season")` uses `getBaselineGameFilter`. All other existing callers keep `getCountedGameFilter` unchanged.

- [ ] **Step 1: Failing tests**
  - `counted-games.test.ts`: `getCountedGameFilter` returns `{ cancelledAt: null, kind: "INTERNAL" }` with no reset; `getBaselineGameFilter` has no `kind`.
  - `members`/`linked-members` style check in `player-stats.test.ts`: a member with one INTERNAL replay game and one TOURNAMENT replay game → `getPlayerStats(prisma, "season")` counts 2 games.
  - `get-game-count.test.ts`: a TOURNAMENT participation is not counted (`getGameCount` → count of INTERNAL only).
  - Existing `/rift` count test (in `members.test.ts`): add a case — a TOURNAMENT game adds nothing to 판수.
  Insert games directly with `prisma.gameResult.create({ data: { ..., kind: "TOURNAMENT", blueTeamSlot: 1, redTeamSlot: 2 } })`.
- [ ] **Step 2:** Run the four files. Expected FAIL.
- [ ] **Step 3:** Implement; update the doc comments (and the bot's "same rule" comment) to say internal only.
- [ ] **Step 4:** Run `npm test`. Expected PASS.
- [ ] **Step 5:** Commit `feat: count only internal games toward records`.

### Task 4: Save tournament replays with zero MMR

**Files:**
- Modify: `apps/dashboard/lib/mutations/save-game-result.ts`, `apps/dashboard/lib/mutations/save-replay-import.ts`, `apps/dashboard/app/replay-import/actions.ts` (pass-through of new fields, revalidate `/tournament`)
- Test: `apps/dashboard/lib/mutations/save-replay-import.test.ts`, `save-game-result.test.ts`

**Interfaces:**
- Produces: `SaveGameResultInput` + `kind?: GameKind` (default `"INTERNAL"`), `blueTeamSlot?: number | null`, `redTeamSlot?: number | null`. Non-INTERNAL: `mmrAfter = mmrBefore`, no `member.update` of the rating, row stores kind + slots. `SaveReplayImportInput` + the same three fields. New entries in `SAVE_REPLAY_IMPORT_ERRORS`: `tournamentDisabled: "대회 페이지가 꺼져 있습니다."`, `sameTeam: "블루와 레드에 같은 팀을 고를 수 없습니다."`, `tournamentMode: "대회 경기는 협곡만 가능합니다."`, `missingTeam: "팀을 골라 주세요."`.
- Validation in `saveReplayImport` (before transaction where possible; enabled check inside tx reading `siteSetting`): non-INTERNAL requires `mode === "RIFT"`, both slots in 1..4 (else `missingTeam`), unequal (`sameTeam`), switch on. INTERNAL with any slot set → treat slots as null (ignore).

- [ ] **Step 1: Failing tests** (`save-replay-import.test.ts`, reuse its fixture):
  - TOURNAMENT save with switch on → every participant's `mmr` unchanged, each `GameParticipant` has `mmrAfter === mmrBefore`, `GameResult.kind === "TOURNAMENT"`, slots stored, `ReplayPlayerStat` count 10, `lastActiveAt` raised to `playedAt`.
  - switch off (no SiteSetting row) → rejects `"대회 페이지가 꺼져 있습니다."`, no GameResult row.
  - `blueTeamSlot: 2, redTeamSlot: 2` → `"블루와 레드에 같은 팀을 고를 수 없습니다."`.
  - `redTeamSlot: 5` or `null` → `"팀을 골라 주세요."`.
  - `kind: "SCRIM", mode: "ARAM"` → `"대회 경기는 협곡만 가능합니다."`.
  - INTERNAL save unchanged (existing tests stay green).
- [ ] **Step 2:** Run file. Expected FAIL.
- [ ] **Step 3:** Implement. In the action, add the new error strings to `messageFor`'s expected list (they are in `SAVE_REPLAY_IMPORT_ERRORS`, so automatic) and `revalidatePath("/tournament")`.
- [ ] **Step 4:** Run `npm run test --workspace=dashboard`. Expected PASS.
- [ ] **Step 5:** Commit `feat(replay-import): save tournament and scrim games without MMR`.

### Task 5: Cancel and history are kind-aware

**Files:**
- Modify: `apps/dashboard/lib/mutations/cancel-game-result.ts`, `apps/dashboard/lib/queries/game-history.ts`, `apps/dashboard/components/GameHistoryList.tsx`, `apps/dashboard/app/match-history/actions.ts` (revalidate `/tournament`)
- Test: `cancel-game-result.test.ts`, `game-history.test.ts`

**Interfaces:**
- Produces: `GameHistoryRow` + `kind: GameKind`, `teamLabels: { blue: string; red: string } | null` (null for INTERNAL; names via `TournamentTeam` rows + `defaultTournamentTeamName`). `getGameHistory` options + `kinds?: GameKind[]` (filter `kind: { in }`; absent = all kinds). `GameHistoryList` gains optional prop `hideMmr?: boolean`; not needed for `/match-history`.
- Cancel rules: INTERNAL — `latest` lookup adds `kind: "INTERNAL"`, otherwise unchanged. TOURNAMENT/SCRIM — only `notFound`/`alreadyCancelled` checks, then set `cancelledAt`, `cancelledById`, `replayKey: null`; no rating writes. Allowed while switch is off.
- `canCancel`: `groupBy` where adds `kind: "INTERNAL"`; non-INTERNAL rows: `canCancel = cancelledAt === null`.

- [ ] **Step 1: Failing tests**
  - cancel: internal game A, then tournament game T (both via `saveReplayImport` or direct rows with deltas) → `cancelGameResult(A)` succeeds and restores A's `mmrBefore`.
  - cancel T → members' `mmr` unchanged, `T.cancelledAt` set, `replayKey` null; works with switch off.
  - cancel T entered before a `RatingReset` → succeeds (no baseline rule).
  - history: with A then T live, row A `canCancel === true`, row T `canCancel === true`; T row has `kind: "TOURNAMENT"`, `teamLabels: { blue: "1팀", red: "불꽃" }` after naming slot 2 `"불꽃"` (T blue=1, red=2).
  - history `kinds: ["TOURNAMENT", "SCRIM"]` returns only T.
- [ ] **Step 2:** Run files. Expected FAIL.
- [ ] **Step 3:** Implement. In `GameHistoryList`, non-INTERNAL rows show a badge `대회` or `스크림` (`bg-accent-soft/15 text-accent-soft`) next to the mode badge and `{blue} vs {red}` text; per-player MMR text shows `-` instead of `1000→1000`.
- [ ] **Step 4:** Run `npm run test --workspace=dashboard`. Expected PASS.
- [ ] **Step 5:** Commit `feat(match-history): tournament games outside the MMR cancel chain`.

### Task 6: Tournament data layer

**Files:**
- Create: `apps/dashboard/lib/tournament/queries.ts`, `apps/dashboard/lib/tournament/mutations.ts`, `apps/dashboard/lib/tournament/tournament.test.ts`

**Interfaces:**
- Consumes: `aggregateTournamentStandings`, `defaultTournamentTeamName`, `TOURNAMENT_SLOTS` (Task 2); `SITE_SETTING_ID` from `lib/queries/site-theme`.
- Produces (queries):
  ```ts
  export async function isTournamentEnabled(prisma): Promise<boolean>;
  export async function getTournamentTeamNames(prisma): Promise<Record<number, string>>; // all 4 slots filled
  export async function getTournamentStandings(prisma): Promise<TournamentStanding[]>;
  export async function listTournamentImageIds(prisma): Promise<string[]>; // by position asc
  export async function getTournamentImageForViewer(prisma, id: string, isAdmin: boolean): Promise<{ bytes: Uint8Array; type: string } | null>; // null if missing or (!enabled && !isAdmin)
  ```
- Produces (mutations; all throw `TournamentValidationError` with Korean copy; all except `setTournamentEnabled` throw `"대회 페이지가 꺼져 있습니다."` when off):
  ```ts
  export class TournamentValidationError extends Error {}
  export async function setTournamentEnabled(prisma, enabled: boolean, adminId: string | null): Promise<void>; // upsert SiteSetting
  export async function renameTournamentTeam(prisma, slot: number, name: string, adminId: string | null): Promise<void>; // "팀 이름은 1~20자입니다." / "없는 팀입니다."
  export async function addTournamentImage(prisma, upload: { bytes: Uint8Array; type: string }): Promise<string>; // copy as EventImage: type/size/20-limit messages
  export async function deleteTournamentImage(prisma, id: string): Promise<void>;
  export async function moveTournamentImage(prisma, id: string, direction: "up" | "down"): Promise<void>; // swap positions, no-op at edges
  ```
  Reuse `EVENT_IMAGE_MAX_BYTES` / `ALLOWED_EVENT_IMAGE_TYPES` from `lib/mutations/event-posts.ts`; own `TOURNAMENT_IMAGE_MAX = 20`.

- [ ] **Step 1: Failing tests**
  - standings: two TOURNAMENT games + one SCRIM + one cancelled TOURNAMENT + one INTERNAL → only the two counted; created before a `RatingReset` still counted.
  - killDiff from `ReplayPlayerStat`: game with blue players' kills summing 18 and red 11 → blue team killDiff 7. `getTournamentStandings` loads `replayStats: { select: { team: true, kills: true } }` and sums per side.
  - names default `"1팀".."4팀"`; after `renameTournamentTeam(2, "  불꽃 ")` → `"불꽃"`; `""` and 21 chars rejected; slot 5 rejected.
  - mutations rejected when off; `setTournamentEnabled(true)` then allowed.
  - images: add 3, move 3rd up (`"up"` = one place earlier in the grid) → order [1,3,2]; 21st rejected; `text/plain` rejected.
  - `getTournamentImageForViewer`: off → visitor null, admin bytes; on → visitor bytes.
- [ ] **Step 2:** Run `npx vitest run lib/tournament/tournament.test.ts` (cwd `apps/dashboard`). Expected FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected PASS.
- [ ] **Step 5:** Commit `feat(tournament): teams, images, standings and switch`.

### Task 7: `/tournament` page

**Files:**
- Create: `apps/dashboard/app/tournament/page.tsx`, `apps/dashboard/app/tournament/actions.ts`, `apps/dashboard/app/api/tournament/images/[id]/route.ts`, `apps/dashboard/components/tournament/TournamentStandingsTable.tsx`, `TournamentTeamNameCell.tsx`, `TournamentImageManager.tsx`, `TournamentImageLightbox.tsx`
- Modify: `apps/dashboard/components/ReplayImportForm.tsx`

**Interfaces:**
- Consumes: Task 6 queries/mutations; `getGameHistory({ kinds, page })` and `GameHistoryList` (Task 5); `saveReplayImportAction` (Task 4).
- Produces: `ReplayImportForm` prop `tournament?: { teams: Record<number, string> }`. When set: mode toggle replaced by 대회/스크림 toggle (default 대회), two `<select>`s 블루 측 팀 / 레드 측 팀 (placeholder 「팀 선택」), save disabled until both chosen and different, `mode` fixed `"RIFT"`, `previewReplayMmr` skipped (board shows `member` with `mmrBefore === mmrAfter`, or null-MMR — pick whichever `GameDetailBoard` renders without a delta), sends `kind`, `blueTeamSlot`, `redTeamSlot`.
- Actions (`"use server"`, each `requireAdmin()`, return `{ error: string | null }`, show only `TournamentValidationError` messages, `revalidatePath("/tournament")`): `renameTournamentTeamAction(slot, name)`, `addTournamentImageAction(formData)` (field `image`), `deleteTournamentImageAction(id)`, `moveTournamentImageAction(id, direction)`.
- Route: `GET` → `getTournamentImageForViewer(prisma, id, admin !== null)`; 404 with `private, no-store` when null; else bytes with `Content-Type`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.

- [ ] **Step 1:** Page: `dynamic = "force-dynamic"`; `admin = getCurrentAdmin()`; `enabled = isTournamentEnabled`; `!enabled && !admin` → `notFound()`. `AppShell activeNav="tournament" pageTitle="대회" pageDesc="1~4팀 리그전 순위와 경기 기록"` (not `desktopOnly`). Sections in order: off-banner for admin when disabled (「대회 페이지가 꺼져 있습니다. 관리자 · 설정에서 켤 수 있습니다.」); 순위표; 이미지 (hidden when none and not admin); 경기 및 스크림 기록 with `?kind=all|TOURNAMENT|SCRIM` links (전체/대회/스크림) and `?page=`; upload section only when `admin && enabled`, wrapped `hidden md:block` with `md:hidden` line 「리플레이 업로드는 PC에서 이용해 주세요」.
- [ ] **Step 2:** Standings table: columns 순위 / 팀 / 승 / 패 / 승점 / 킬득실 (킬득실 shown signed: `+3`, `−2`, `0`); works at 375px (no horizontal scroll — six narrow columns fit). Team cell is `TournamentTeamNameCell` for admins (click → input, Enter/blur saves, Esc cancels, error shown inline), plain text otherwise. Negative points render with `−`.
- [ ] **Step 3:** Image section as a **card grid** (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, gap 3): each card `aspect-[3/4]` rounded `bg-surface-3` with `<img src="/api/tournament/images/{id}" class="object-contain" loading="lazy">`. Click → `TournamentImageLightbox` (client; fixed overlay `bg-black/80`, image `max-h-[90vh] object-contain`, closes on backdrop click / Esc, ←/→ keys and buttons step through ids, wraps at ends). Admin: `<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif">`; files upload **sequentially**, one `addTournamentImageAction` per file, progress `{done}/{total} 업로드 중`, a failed file lists `파일명: 오류` and the loop continues; `router.refresh()` after the loop. Per card admin buttons 앞으로/뒤로/삭제 (삭제 confirms). Empty + admin → dashed card 「이미지를 올려 주세요」 acting as the upload trigger.
- [ ] **Step 4:** Verify by running `npm run dev --workspace=dashboard`, enabling the switch via a temporary `setTournamentEnabled` call or Task 8's panel if done, uploading a fixture `.rofl` as 대회 1팀 vs 2팀, and checking: standings show +3/−1, row appears on `/tournament` and `/match-history` with 대회 badge, `/rift` 판수 unchanged. Run `npm run test --workspace=dashboard`. Expected PASS.
- [ ] **Step 5:** Commit `feat(tournament): league page with standings, images, games and upload`.

### Task 8: Nav, switch panel, docs

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`, `apps/dashboard/app/admins/page.tsx`, `apps/dashboard/app/admins/actions.ts` (or wherever `ThemePanel`'s action lives), `CLAUDE.md`
- Create: `apps/dashboard/components/tournament/TournamentSwitchPanel.tsx`

**Interfaces:**
- Consumes: `isTournamentEnabled`, `setTournamentEnabled` (Task 6).

- [ ] **Step 1:** `AppShell`: read `isTournamentEnabled(prisma)` in the existing `Promise.all`; when enabled, push `{ key: "tournament", href: "/tournament", label: "대회", icon: "trophy" }` after 공지사항 in the 이벤트 group. When disabled, admins also do not see it in the nav (they reach it from the panel link).
- [ ] **Step 2:** `TournamentSwitchPanel` on `/admins` below `ThemePanel`: title 「대회 페이지」, current state 켜짐/꺼짐, one toggle button (켜기/끄기), link 「대회 페이지로 이동」 to `/tournament`, helper text 「끄면 메뉴와 페이지가 방문자에게 숨겨집니다. 경기 기록은 내전 기록에 그대로 남습니다.」. Action `setTournamentEnabledAction(enabled)` → `requireAdmin`, mutation, `revalidatePath("/", "layout")`.
- [ ] **Step 3:** CLAUDE.md: add a `/tournament` paragraph (kind rule, zero MMR, two filters in counted-games, cancel rules, switch, standings no baseline); add `/tournament` to the Mobile read-screen list (count becomes twelve); mention 대회 in the `apps/dashboard` summary line.
- [ ] **Step 4:** Run `npm test`. Manually: switch off → visitor nav has no 대회 and `/tournament` 404s; admin sees banner; switch on → nav shows it.
- [ ] **Step 5:** Commit `feat(tournament): nav entry and admin on/off switch`.
