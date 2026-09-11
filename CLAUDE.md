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

A member is identified across uploads by a **match key**, not by the nickname
string (`packages/core/src/kakao-match-key.ts`). The group's convention is
`실명/출생연도/게임닉#태그`, and the key keeps only the first two segments — the tail
changes every time someone renames in game or appends a memo, the first two do not.
So `박병준/94/늑 구#kr1 (5시)`, `박병준/94/늑구#KR1` and `박병준/94/늑 구#KR1 밥먹고옴`
are one person; before this they were three. Off-convention nicknames (no digits in
the second segment) fall back to the whole string with case, whitespace and `#._-`
folded away — the same `normalizeForMatch` that `score-account-match.ts` uses. The
key is computed, never stored: at ~40 members `processKakaoExport` loads every row
once and builds a key→member map, which is cheaper than a column that four write
paths would have to keep in sync.

The key cannot tell two 동명이인 of the same birth year apart. `normalizeKakaoNicknames`
catches the visible case — it aborts the whole batch when one group holds two
different `discordUserId`s rather than silently discarding a hand-made link.

KakaoTalk import (`apps/dashboard/lib/kakao-import/`) parses a Korean `.txt` export: `--------------- YYYY년 M월 D일 요일 ---------------` date separators plus `[이름] [오전 H:MM] 본문` headers, with continuation lines folded into the preceding message. A mention is `@` anywhere in a line to end of line (recruitment posts write `1. @닉네임`).
Nothing filters what follows: the 대기 (waitlist) section is not recognised and its
entries count as activity like any other mention — deliberately, since writing your
name in the chatroom is what inactivity measures. The flip side is that an `@` in a
header line (`@태그해서 작성해주세요`) becomes a member too. Idempotency is a **watermark**: only mentions strictly newer than `max(MentionLog.mentionedAt)` are processed, so re-uploading the same file is a no-op. This means the import is append-only in time — a backfill of an older export will be skipped entirely.

`.rofl` 리플레이 임포트(`apps/dashboard/lib/replay-import/`)는 파일 맨 뒤의 **평문 JSON**만
읽는다(`parseRoflMetadata`). 마지막 4바이트가 그 JSON의 길이(u32 LE)이고, `statsJson`은
문자열로 한 번 더 감싸여 있어 두 번 파싱해야 한다. 앞쪽 zstd 청크는 열지 않으므로 압축
의존성도 패치 종속성도 없다. 참가자 값은 전부 문자열이고 `NAME`은 비어 있다 — 신원은
`PUUID`와 `RIOT_ID_GAME_NAME`/`RIOT_ID_TAG_LINE`에서 온다.

`RiotAccount`는 **리플레이에서 관측된 계정으로만** 만든다. 카톡·디코 닉네임에 적힌 Riot
ID와 `Member.riotId`는 사람이 손으로 적은 값이라 오타·태그 누락이 흔하고, 그대로 저장하면
한 사람의 계정이 표기별로 여러 행이 된다. 그 값들은 계정이 아니라 **매칭 힌트**이며
`scoreRiotAccountMatch`가 셋 중 가장 센 신호 하나만 센다. 그 위에 실명 조각 신호가 따로
더해진다 — 인게임 닉에 "우성정글"처럼 실명 조각이 남는 경우를 잡으려고, 회원 실명(없으면
카톡 닉네임 첫 조각)의 전체와 첫 글자를 뗀 조각 둘 다로 게임 닉을 검사해 하나라도 포함되면
`REAL_NAME_FRAGMENT`(45점)를 더한다 — 성을 빼고 짓는 게임 닉이 흔해서다. 포지션은 가산점
전용이라 ID 힌트와 실명 조각이 둘 다 0이면 후보가 되지 않는다. 자동 배정은
`점수 >= 100 && 1위−2위 >= 40`일 때만 한다 — 100점은 손으로 적은 Riot ID가 정확히
맞아떨어진 경우에만 단독으로 나오고, 실명 조각(45)과 포지션(25)은 그 문턱에 못 미쳐
후보 화면에서 관리자 확인을 거치게 할 뿐 자동 배정을 트리거하지 않는다.

`RiotAccount.memberId`는 FK가 `onDelete: Restrict`다. 이 테이블에서 `memberId = null`은
"연결 안 됨"이 아니라 "우리 회원이 아님을 확인함, 다시 묻지 말 것"이라는 확정 상태라서다.
Prisma가 옵셔널 관계에 기본으로 넣는 `SET NULL`을 그대로 뒀다면, 회원을 지웠을 때 그 계정이
조용히 "회원 아님"으로 뒤바뀐다. 그래서 FK는 막아 두고, `deleteMember`가 `GameParticipant`·
`MentionLog`와 같은 모양으로 해당 회원과 그 묘비들의 `RiotAccount`를 직접 지운다.

멱등성은 `GameResult.replayKey`(정렬한 PUUID 10개 + gameLength의 SHA-256)로 잡는다 —
리플레이에는 시간 축이 없어 카톡 임포트의 워터마크 방식을 쓸 수 없다. 유니크 제약 자체는
취소 여부를 보지 않지만, `cancelGameResult`가 취소할 때 그 행의 `replayKey`를 함께
지운다 — 그러지 않으면 매칭을 잘못 지정해 취소한 경기를 고쳐서 다시 올릴 방법이 없어진다.

`saveGameResult`의 "디코 AND 카톡" 규칙에 "PUUID가 있는 `RiotAccount`가 붙어 있으면 갈음"이
더해져 있다(`getLinkedMembers`도 같다). `saveReplayImport`가 계정을 먼저 등록하고 경기를
저장하므로, 리플레이에 배정된 회원은 그 순간 이 조건을 충족한다 — 리플레이가 그 사람이 그
경기를 뛰었다는 1차 증거라는 설계를 그대로 옮긴 것이다. 계정을 먼저 쓰기 때문에, 존재하지
않는 회원 id가 섞여 있으면 `RiotAccount` 쪽 FK 위반이 먼저 터져 알아보기 힘든 Postgres
에러가 나온다 — `saveReplayImport`는 그래서 계정을 쓰기 전에 배정된 회원이 전부 실재하는지
먼저 확인하고, 실패하면 `saveGameResultTx`가 내는 것과 같은
`"One or more participants do not exist"`로 던진다. 짝으로 `absorbMember`가 흡수 대상의
`GameParticipant`와 `RiotAccount`를 생존자로 옮기고 `releaseMember`가 되돌린다. 되돌리는
근거는 두 테이블의 `absorbedFromId`이고, 값은
**비어 있을 때만** 채운다 — 이미 이관된 행의 원주인이 덮이면 되돌릴 길이 없어진다. 생존자와
흡수 대상이 같은 경기에 둘 다 있으면 `@@unique([gameResultId, memberId])`에 막히므로 병합을
거부한다. 이 표식은 영구히 남지 않는다 — `saveReplayImport`가 이미 알고 있는 PUUID를 다른
회원에게 재배정하면(관리자가 매칭을 고쳐 저장한 경우) 그 `RiotAccount`의 `absorbedFromId`를
지운다. 옛 표식을 남겨 두면 나중에 그 묘비를 해제할 때 이제는 관계없는 계정이 엉뚱하게 그
묘비로 돌아간다.

경기 저장은 참가 회원의 `lastActiveAt`도 경기 날짜로 올린다(뒤로 당기지는 않는다). 그래서
`release-member.ts`의 `recomputeLastActiveAt`은 멘션 로그뿐 아니라 취소되지 않은 경기의
`playedAt`도 함께 본다.

`queries/members.ts`의 `isHalfMember`는 `saveGameResult`·`getLinkedMembers`의 완화 조건
("PUUID가 있는 `RiotAccount`가 붙어 있으면 갈음")을 따르지 않는다 — 둘은 서로 다른 질문이다.
`saveGameResult`는 "이 경기를 뛰어도 되는가"를 묻고 리플레이가 그 증거가 된다. `isHalfMember`는
`/members` 화면의 반쪽 배지를 위해 "아직 연결할 일이 남았는가"를 묻고, 라이엇 계정은 디스코드
연결의 필요를 없애지 않는다 — 그래서 라이엇 계정으로 경기를 뛰는 회원도 디코나 카톡 한쪽이
비어 있으면 여전히 반쪽으로 집계된다. 의도적인 차이이고 버그가 아니다.

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
