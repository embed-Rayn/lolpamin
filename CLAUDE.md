# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Management system for a Korean LoL (League of Legends) friend group. Tracks an internal MMR rating per member and detects members who have gone inactive in the group's KakaoTalk open chatroom. Design spec: `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md` (Korean).

npm-workspaces monorepo, one shared Postgres:

- `apps/dashboard` — Next.js 14 App Router admin UI. Member list, account linking, match entry, inactivity report, KakaoTalk export upload, admin login and admin management. Writes are gated on an admin session; reads are public.
- `apps/discord-bot` — discord.js read-only slash commands (`/mmr`, `/랭킹`, `/전적`).
- `packages/db` — Prisma schema + a single shared `prisma` client singleton.
- `packages/core` — pure domain functions (MMR, inactivity, display name, nickname parsing and normalisation, account-match scoring). No I/O, fully unit-tested.

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

`Member` is one human, with a Discord side and a KakaoTalk side that arrive independently. A row holding only one side is a "반쪽(half) 회원". Linking is **reversible**: `absorbMember()` points the Kakao-side row at the survivor via `mergedIntoId` instead of deleting it, leaving a tombstone that keeps its own `kakaoNickname` so future imports still match on the raw string; `releaseMember()` undoes it. Queries therefore filter on `mergedIntoId: null` and treat a survivor whose tombstone holds a nickname as linked. `realName`/`age` are parsed out of the `이름/나이/닉네임태그` nickname format by `parseKakaoNickname`, best-effort only.

MMR is team-average Elo, K=40, applied identically to every player on a team (`packages/core/src/mmr.ts`). Default 1000. On top of the win/loss swing every participant gains a flat bonus — `WIN_POINT` (3) for the winning team, `LOSS_POINT` (1) for the losing one — so a game is worth +23/-19 between even teams and the rating pool inflates. That is deliberate: showing up is always worth something, winning a little more.

Two **quarterly resets** sit at the bottom of `/admins`, both manual admin actions
behind a two-step confirm and neither undoable (`resetAllRatings`). The **soft**
reset (`applySoftReset`) pulls every active member's rating halfway back to 1000, so
the ordering survives while the gaps compress; the **hard** reset (`applyHardReset`)
puts everyone on 1000 and throws the ordering away. Tombstones and recorded
`GameParticipant` deltas are left alone by both.

Both also zero 판/승/패. Those are not stored columns — they are counted from
`GameParticipant`, so the reset writes a `RatingReset` row instead of deleting
anything, and its `resetAt` becomes the **baseline**: only games whose
`GameResult.createdAt` is strictly newer than the newest `resetAt` are counted.
`createdAt`, not `playedAt`, because a play date can be backdated below the
baseline. Games stay in the history screen untouched. The rule lives in
`apps/dashboard/lib/queries/counted-games.ts` (used by `linked-members` and
`inactive`) and is restated in `apps/discord-bot/src/lib/get-game-count.ts`, which
cannot import the dashboard's lib. Deliberately **not** watermarked:
`queries/members.ts`'s `gameCount`, which counts rows the delete-confirm dialog is
about to destroy, not a record.

A consequence: `cancelGameResult` refuses a game entered at or before the newest
`resetAt`. Its `mmrBefore` is a pre-reset rating, so undoing it would revive one
member's old score. Right after a reset nothing is cancellable, which is correct.

Separately from MMR, each member carries a solo-queue `tier` (`MemberTier`, default
`UNRANKED`) that an admin sets by hand. Its score comes from a reference table in
`packages/core/src/tier.ts` — 다1 24 down to 브4 1, master split into LP bands above
that (25–30), 아이언 and 언랭 both 0 — and is never stored, so editing the table
moves every score at once. It feeds `/team-builder` (2.3), where an admin seats both
teams by hand and watches the two totals; that arrangement is browser state and is
never saved. `packages/core` imports the `MemberTier` type from `@lolpamin/db` — the
one place it depends on another workspace, and a type-only import.

The rating was called ELO until the rename; the DB columns are `Member.mmr` and `GameParticipant.mmrBefore/mmrAfter`.

Inactivity: >= 7 days since `lastActiveAt` (falling back to `createdAt`); 14+ days is flagged more severely. Only members with a KakaoTalk side are eligible — someone with no chatroom presence cannot be "inactive".

KakaoTalk import (`apps/dashboard/lib/kakao-import/`) parses a Korean `.txt` export: `--------------- YYYY년 M월 D일 요일 ---------------` date separators plus `[이름] [오전 H:MM] 본문` headers, with continuation lines folded into the preceding message. A mention is `@` anywhere in a line to end of line (recruitment posts write `1. @닉네임`). Idempotency is a **watermark**: only mentions strictly newer than `max(MentionLog.mentionedAt)` are processed, so re-uploading the same file is a no-op. This means the import is append-only in time — a backfill of an older export will be skipped entirely.

## Deployment

The OCI instance runs `docker-compose.prod.yml`: a Postgres container with no
published host port, plus a dashboard and a discord-bot image built from
`apps/*/Dockerfile`. The dashboard's `CMD` runs `prisma migrate deploy` before
`next start` — a schema mismatch keeps the container down rather than serving
against the wrong shape. The bot never migrates.

Server-side `.env` follows `.env.prod.example`, not `.env.example`: it has
`POSTGRES_PASSWORD` and the admin bootstrap pair, no `DATABASE_URL` (compose
composes it), and `COOKIE_SECURE="false"` because the service is plain HTTP.

The server checkout is a plain file copy, not a git clone. Deploying means
syncing the tree and rebuilding, so anything not committed here exists only
there — commit 2026-09-02 `import: production tree as deployed` recovered four
feature tracks that had been in exactly that position.

Access lives in the repo-root `.env` (`OCI_INSTANCE_IP`, `_SSH_PORT`, `_SSH_USER`,
`_SSH_KEY_PATH`, `_SERVICE_PORT`=3200). The deploy is three commands:

```bash
git archive main | ssh -i "$KEY" -p "$PORT" "$USER@$IP" 'tar x -C ~/lolpamin'
ssh ... 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml build'
ssh ... 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml up -d'
```

Every docker command on the server needs `sudo` — `ubuntu` is not in the `docker`
group (`id -nG` gives `ubuntu adm cdrom sudo dip lxd`), and without it the error
is `permission denied while trying to connect to the docker API`. `sudo` is
passwordless. Note `git archive` only overwrites: a file deleted in git stays on
the server until someone removes it by hand.

## Known inconsistencies

## Conventions

- Domain logic goes in `packages/core` as a pure function with a unit test; DB-touching logic goes in `apps/dashboard/lib/{queries,mutations}/` and takes `prisma` as its first argument (so tests can inject a test client). Multi-row writes go inside `prisma.$transaction`.
- UI copy, command names, and report labels are Korean; code, identifiers, comments, and commit messages are English.
- Answer the user in Korean. Chat replies, explanations and questions are Korean; code, identifiers, comments, commit messages and file contents stay English unless they are user-facing UI copy.
- Plans and specs live in `docs/superpowers/`. The checkboxes in those plan files were never ticked during implementation — read git log, not the checkboxes, to judge progress.
- `data/` is gitignored: real chat exports contain members' real names. `.env.example` holds placeholders only — real values go in `.env`.
- Pages that read the DB must declare `export const dynamic = "force-dynamic"`. `AppShell` itself queries Postgres for the sidebar badge, so this applies to every page that renders it, not just the ones with their own query — without it `next build` bakes a snapshot and `next start` serves stale rows.

## Local environment notes

Host port 5434, not 5432: a native Windows `postgresql-x64-18` service already owns 5432 and another project's container owns 5433. Docker still reports a successful `5432:5432` mapping in that situation while the native service actually answers, which surfaces as Prisma `P1000: Authentication failed` — check `Get-NetTCPConnection -LocalPort 5432` before believing the mapping.

Docker Desktop is a per-user install here and is not on PATH; the CLI lives at `%LOCALAPPDATA%/Programs/DockerDesktop/resources/bin`. Docker commands must run from PowerShell.
