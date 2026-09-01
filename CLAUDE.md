# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Management system for a Korean LoL (League of Legends) friend group. Tracks an internal MMR rating per member and detects members who have gone inactive in the group's KakaoTalk open chatroom. Design spec: `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md` (Korean).

npm-workspaces monorepo, one shared Postgres:

- `apps/dashboard` — Next.js 14 App Router admin UI. Member list, account linking, match entry, inactivity report, KakaoTalk export upload.
- `apps/discord-bot` — discord.js read-only slash commands (`/mmr`, `/랭킹`, `/전적`).
- `packages/db` — Prisma schema + a single shared `prisma` client singleton.
- `packages/core` — pure domain functions (MMR, merge, inactivity, display name, nickname parsing). No I/O, fully unit-tested.

Workspace packages are consumed as TypeScript source (`main`/`types` point at `src/index.ts`); Next transpiles them via `transpilePackages`. There is no build step for `packages/*`.

A third app, `apps/kakao-bot`, was deleted (commit `7bab687`): the unofficial `node-kakao` library no longer authenticates against KakaoTalk servers. Manual `.txt` export upload replaced it. See `docs/superpowers/reports/2026-08-25-kakao-bot-completion.md`.

## Commands

```bash
cp .env.example .env                              # fill in values first — compose reads POSTGRES_PASSWORD from it
docker compose up -d                              # Postgres 16, published on host port 5434
docker compose exec postgres createdb -U lolpamin lolpamin_test   # once, for the integration tests

npm install
npm run generate --workspace=@lolpamin/db         # prisma generate (after schema edits)
npm run migrate  --workspace=@lolpamin/db         # prisma migrate dev
npm run seed     --workspace=@lolpamin/db

npm test                                          # all workspaces
npm run test --workspace=dashboard                # one workspace
npx vitest run lib/kakao-import/parse-export.test.ts   # single file (cwd = the workspace)
npx vitest run -t "handles a tie"                 # single test by name

npm run dev --workspace=dashboard                 # http://localhost:3000
npm run dev --workspace=discord-bot
npm run deploy-commands --workspace=discord-bot   # register slash commands with the guild
```

There is no lint step configured.

## Testing

Two tiers, both vitest:

- `packages/core` — pure unit tests, no DB.
- `apps/*` — integration tests hit a **real Postgres test database** (`DATABASE_URL_TEST`) and call `resetDatabase()` in `beforeEach`. Create that DB before running them.

Every DB test file starts with a guard that throws if `DATABASE_URL_TEST` is unset — without it Prisma silently falls back to `DATABASE_URL` and `resetDatabase()` wipes the dev data. Keep that guard when adding test files.

`apps/dashboard/vitest.config.ts` sets `fileParallelism: false` because all integration files share one database and their resets would race. Do not turn it back on.

All three env consumers read the single repo-root `.env`: the bots via `--env-file=../../.env`, the dashboard via `process.loadEnvFile()` in `next.config.js`, and vitest via the same call in each `vitest.config.ts`. Nothing loads it implicitly — a new entry point needs its own load.

## Domain model and its non-obvious rules

`Member` is one human, with a Discord side and a KakaoTalk side that arrive independently. A row holding only one side is a "반쪽(half) 회원". `linkMembers()` merges the Kakao-side row **into** the Discord-side row: it repoints `MentionLog` and `GameParticipant`, deletes the Kakao row *before* copying `kakaoUserId` onto the survivor (unique constraint would otherwise reject the update), and never rewrites `kakaoNickname` — the raw nickname string is the match key for future re-imports. `realName`/`age` are parsed out of the `이름/나이/닉네임태그` nickname format by `parseKakaoNickname`, best-effort only.

MMR is team-average Elo, K=32, applied identically to every player on a team (`packages/core/src/mmr.ts`). Default 1000. On top of the win/loss swing every participant — winners and losers alike — gains `PARTICIPATION_POINT` (1), so a game is worth +17/-15 between even teams and the rating pool inflates by one point per player per game. That is deliberate: showing up is always worth something.

The rating was called ELO until the rename; the DB columns are `Member.mmr` and `GameParticipant.mmrBefore/mmrAfter`.

Inactivity: >= 14 days since `lastActiveAt` (falling back to `createdAt`); 30+ days is flagged more severely. Only members with a KakaoTalk side are eligible — someone with no chatroom presence cannot be "inactive".

KakaoTalk import (`apps/dashboard/lib/kakao-import/`) parses a Korean `.txt` export: `--------------- YYYY년 M월 D일 요일 ---------------` date separators plus `[이름] [오전 H:MM] 본문` headers, with continuation lines folded into the preceding message. A mention is `@` anywhere in a line to end of line (recruitment posts write `1. @닉네임`). Idempotency is a **watermark**: only mentions strictly newer than `max(MentionLog.mentionedAt)` are processed, so re-uploading the same file is a no-op. This means the import is append-only in time — a backfill of an older export will be skipped entirely.

## Known inconsistencies

- `getLinkedMembers()` (match builder pool) treats `kakaoUserId OR kakaoNickname` as linked, but `saveGameResult()` still requires `kakaoUserId`. Members created by the `.txt` import only ever get `kakaoNickname`, so they can be added to a team and then fail on save.
- Display name fallback differs per surface: `getDisplayName()` in core is `realName ?? discordHandle ?? kakaoNickname ?? "이름 미확인"`, but `/mmr` and `/전적` build their own shorter chain.
- Slash command names are Korean (`랭킹`, `전적`). If the Discord API rejects them, the documented fallback is renaming to `ranking`/`record` and re-deploying.

## Conventions

- Domain logic goes in `packages/core` as a pure function with a unit test; DB-touching logic goes in `apps/dashboard/lib/{queries,mutations}/` and takes `prisma` as its first argument (so tests can inject a test client). Multi-row writes go inside `prisma.$transaction`.
- UI copy, command names, and report labels are Korean; code, identifiers, comments, and commit messages are English.
- Plans and specs live in `docs/superpowers/`. The checkboxes in those plan files were never ticked during implementation — read git log, not the checkboxes, to judge progress.
- `data/` is gitignored: real chat exports contain members' real names. `.env.example` holds placeholders only — real values go in `.env`.
- Pages that read the DB must declare `export const dynamic = "force-dynamic"`. `AppShell` itself queries Postgres for the sidebar badge, so this applies to every page that renders it, not just the ones with their own query — without it `next build` bakes a snapshot and `next start` serves stale rows.

## Local environment notes

Host port 5434, not 5432: a native Windows `postgresql-x64-18` service already owns 5432 and another project's container owns 5433. Docker still reports a successful `5432:5432` mapping in that situation while the native service actually answers, which surfaces as Prisma `P1000: Authentication failed` — check `Get-NetTCPConnection -LocalPort 5432` before believing the mapping.

Docker Desktop is a per-user install here and is not on PATH; the CLI lives at `%LOCALAPPDATA%/Programs/DockerDesktop/resources/bin`. Docker commands must run from PowerShell.
