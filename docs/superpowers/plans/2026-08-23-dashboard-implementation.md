# Dashboard App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/dashboard`, the admin web app for the LoL guild integration system — account mapping between Discord/KakaoTalk identities, game result entry with ELO recalculation, and an inactivity report — plus the shared `packages/db` and `packages/core` it depends on.

**Architecture:** npm-workspaces monorepo. `packages/db` holds the Prisma schema/client shared by every app (dashboard now, discord-bot/kakao-bot later). `packages/core` holds pure, framework-free business logic (ELO math, member merging, inactivity detection) so it can be unit-tested without a database. `apps/dashboard` is a Next.js (App Router) app: server components read data directly via Prisma, mutations go through thin Server Actions that call testable functions in `lib/mutations/`.

**Tech Stack:** TypeScript (strict), Next.js 14 (App Router), Prisma 5 + PostgreSQL, Tailwind CSS, Vitest, npm workspaces, Docker Compose (local Postgres).

**Spec:** `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md`

## Global Constraints

- Node.js >= 20, npm workspaces (no pnpm/yarn).
- TypeScript `strict: true` in every package/app. No `any`.
- Database: PostgreSQL only (per spec) — no SQLite substitution, including in tests. Local dev/test Postgres runs via Docker Compose.
- No automated UI/E2E tests (per spec: "UI는 소규모 내부 도구이므로 수동 테스트로 충분"). Only `packages/core` (pure logic) and `lib/mutations/*` (integration, against a real test Postgres) get automated tests.
- All monetary/rating values are integers. ELO K-factor is `32` (fixed constant, not configurable in this plan).
- Dashboard UI text is Korean, matching the approved mockup's copy exactly where quoted below.
- Dark theme only — no light mode toggle.
- The dashboard never sends messages to Discord or KakaoTalk (per spec, out of scope) — it only reads/writes its own database.

## Design Reference

This plan implements the screens approved in the Claude Design mockup "LoL Guild Admin" (project `d3966142-7456-4c7a-99e9-3cdc112a73de`). The mockup isn't committed to this repo, so the tokens needed to match it are captured here.

**Fonts:** `Pretendard` (variable, via `cdn.jsdelivr.net/gh/orioncactus/pretendard`) for body text, `'JetBrains Mono'` (Google Fonts) for numbers/IDs/timestamps, `'Noto Sans KR'` as fallback.

**Color tokens** (use as Tailwind arbitrary values, e.g. `bg-[#0E1117]`):
| Token | Hex | Use |
|---|---|---|
| bg-base | `#0E1117` | page background |
| bg-sidebar | `#12161F` | sidebar |
| bg-card | `#151A24` | cards, table containers |
| bg-input | `#0F131B` | inputs |
| text-primary | `#E6EAF2` | main text |
| text-muted | `#6E7889` / `#7A8496` | secondary text |
| text-faint | `#5C6577` | placeholders, disabled |
| accent-blue | `#4472C4` / `#5865F2` (Discord brand) | blue team, discord accents, primary actions |
| accent-red | `#E05A5A` / `#EE8B8B` | red team, danger/long-inactive |
| accent-yellow | `#FFC000` / `#F2C75C` (Kakao brand) | kakao accents, high-ELO |
| accent-orange | `#ED7D31` / `#F2985C` | warnings, "미연결" badge, 14+ day inactivity |
| accent-green | `#70AD47` / `#9BD173` | success, bot-online dot, ELO gain |
| border-subtle | `rgba(255,255,255,.06–.09)` | card/table borders |

**Copy strings to reuse verbatim:** sidebar title "롤파민" / "내부 운영 도구", nav labels "회원 관리" / "게임 결과 입력" / "미활동 리포트", "봇 연동 상태", "Discord Bot · 정상", "KakaoTalk Bot · 정상", member table headers "실명/라이엇 ID/ELO/마지막 활동/계정 연결", "미연결" badge, mapping panel hint "양쪽에서 한 개씩 골라 연결하세요. 연결하면 하나의 회원 데이터로 합쳐집니다.", "+ 신규 회원으로 등록" *(see Design Decision 3 — dropped)*, match screen "5v5 내전 · 승/패 방식 · K값 32", team labels "BLUE TEAM" / "RED TEAM", "결과 저장 · ELO 반영", footnote "저장 시 Discord 봇의 ELO 테이블이 즉시 갱신되고 #내전-기록 채널에 요약이 게시됩니다." *(display only — this plan does not implement that notification; see Design Decision 4)*, inactive report headers "2주 이상 카톡방 멘션 없음" / "30일 이상" / "전체 회원 중 비율", note "자동 발송이나 강제 탈퇴 기능은 없습니다."

## Design Decisions (deviations from the raw mockup / gaps it left open)

The mockup is a static, hard-coded prototype. A few of its interactions imply a data model or behavior the approved spec doesn't define. These decisions resolve them; they don't change the approved spec's data model, they fill in implementation-level gaps.

1. **Unified "pending account" model.** The mockup's `DISCORD_POOL`/`KAKAO_POOL` look like a separate entity from `MEMBERS`. This plan does **not** introduce a second entity — a "pending" account is simply a `Member` row where one of `discordUserId`/`kakaoUserId` is null, exactly as the spec's data model already allows. This avoids building an unspecified ingestion pipeline for a "raw sightings" table that only the not-yet-built bots would ever populate.
2. **Linking merges two half-`Member` rows into one.** Given a half-record missing `kakaoUserId` and a half-record missing `discordUserId`, linking them keeps one row (the Discord-side row, arbitrarily) and merges the other side's fields into it, then deletes the now-redundant row, inside a transaction. Merge rule (`packages/core/src/merge-members.ts`): prefer non-null `realName`/`riotId`, keep the higher `elo` (only one side should realistically have game history), keep the later of the two `lastActiveAt` values.
3. **"+ 신규 회원으로 등록" button is dropped.** Under decision 1, every pending account is already a `Member` row and already visible in the member table — there's nothing left to "register." Do not implement this button.
4. **No Discord notification on save.** The footnote about posting to `#내전-기록` describes the *discord-bot's* future job, not the dashboard's (per spec, out of scope for this system entirely). The dashboard only writes to its own database.
5. **`realName` is nullable.** A freshly-seen pending account (e.g. a Discord user who has never been mapped) has no confirmed real name yet. The spec's `Member.realName` is relaxed to nullable; the UI falls back to the platform handle/nickname when it's null.
6. **Team labels use uppercase `"BLUE" | "RED"`** as the literal type and Prisma enum values throughout (state, core functions, DB), rather than the mockup's lowercase JS strings — purely a naming consistency choice, no behavior change.

---

## File Structure

```
/ (repo root)
  package.json                      # npm workspaces root
  tsconfig.base.json
  docker-compose.yml                # local Postgres for dev + tests
  .env.example
/packages
  /db
    package.json
    prisma/schema.prisma
    prisma/seed.ts
    src/index.ts                    # exports `prisma` singleton + re-exports Prisma types
    src/test-utils.ts                # resetDatabase() for integration tests
  /core
    package.json
    tsconfig.json
    src/elo.ts
    src/elo.test.ts
    src/merge-members.ts
    src/merge-members.test.ts
    src/inactivity.ts
    src/inactivity.test.ts
    src/index.ts                    # re-exports the above
/apps
  /dashboard
    package.json
    next.config.js
    tailwind.config.ts
    tsconfig.json
    app/layout.tsx
    app/globals.css
    app/page.tsx                    # redirects to /members
    app/members/page.tsx
    app/members/actions.ts          # 'use server' thin wrapper
    app/matches/page.tsx
    app/matches/actions.ts          # 'use server' thin wrapper
    app/inactive/page.tsx
    components/AppShell.tsx         # sidebar + header, shared by every page
    components/NavLink.tsx
    components/StatCard.tsx
    components/MemberFilters.tsx    # search input + filter buttons (client)
    components/MemberTable.tsx
    components/AccountMappingPanel.tsx  # client component
    components/MatchBuilder.tsx     # client component: pool + teams + preview
    components/InactiveTable.tsx
    lib/prisma.ts                   # re-exports packages/db singleton
    lib/mutations/link-members.ts
    lib/mutations/link-members.test.ts
    lib/mutations/save-game-result.ts
    lib/mutations/save-game-result.test.ts
    lib/queries/members.ts
    lib/queries/inactive.ts
```

---

### Task 1: Monorepo & local Postgres scaffold

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces: a `docker compose up -d` command that gives every later task a `DATABASE_URL` to connect to; an npm workspaces root that `packages/*` and `apps/*` join.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "lolpamin",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: lolpamin
      POSTGRES_PASSWORD: lolpamin
      POSTGRES_DB: lolpamin
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 4: Create `.env.example`**

```
DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin"
DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test"
```

Copy it to `.env` (not committed) before running anything else.

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
.env
.next/
dist/
*.tsbuildinfo
```

- [ ] **Step 6: Start Postgres and verify it's reachable**

Run: `docker compose up -d`
Then: `docker compose exec postgres pg_isready -U lolpamin`
Expected: `accepting connections`

Also create the test database (the app DB is created automatically by the `POSTGRES_DB` env var above; the test DB needs a manual create once):
Run: `docker compose exec postgres psql -U lolpamin -c "CREATE DATABASE lolpamin_test;"`

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json docker-compose.yml .env.example .gitignore
git commit -m "chore: scaffold npm workspaces monorepo and local Postgres"
```

---

### Task 2: `packages/db` — Prisma schema and client

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/test-utils.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var from Task 1.
- Produces: `prisma` (singleton `PrismaClient`) and all Prisma-generated model types (`Member`, `GameResult`, `GameParticipant`, `MentionLog`, `Team`) from `@lolpamin/db`; `resetDatabase(prisma: PrismaClient): Promise<void>` from `@lolpamin/db/test-utils`.

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@lolpamin/db",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Team {
  BLUE
  RED
}

model Member {
  id              String   @id @default(uuid())
  realName        String?
  riotId          String?
  discordUserId   String?  @unique
  discordHandle   String?
  discordJoinedAt DateTime?
  kakaoUserId     String?  @unique
  kakaoNickname   String?
  elo             Int      @default(1000)
  lastActiveAt    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  mentionLogs  MentionLog[]
  participants GameParticipant[]
}

model GameResult {
  id        String   @id @default(uuid())
  playedAt  DateTime
  winner    Team
  createdAt DateTime @default(now())

  participants GameParticipant[]
}

model GameParticipant {
  id           String     @id @default(uuid())
  gameResultId String
  gameResult   GameResult @relation(fields: [gameResultId], references: [id])
  memberId     String
  member       Member     @relation(fields: [memberId], references: [id])
  team         Team
  eloBefore    Int
  eloAfter     Int

  @@unique([gameResultId, memberId])
}

model MentionLog {
  id          String   @id @default(uuid())
  memberId    String
  member      Member   @relation(fields: [memberId], references: [id])
  mentionedAt DateTime
  rawMessage  String?
}
```

- [ ] **Step 3: Install dependencies and run the first migration**

Run (from repo root): `npm install`
Run: `npm run migrate --workspace=@lolpamin/db -- --name init`
Expected: migration succeeds and `packages/db/prisma/migrations/<timestamp>_init/` is created.

- [ ] **Step 4: Create `packages/db/src/index.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
```

- [ ] **Step 5: Create `packages/db/src/test-utils.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.gameParticipant.deleteMany();
  await client.gameResult.deleteMany();
  await client.mentionLog.deleteMany();
  await client.member.deleteMany();
}
```

- [ ] **Step 6: Verify the client generates and connects**

Run: `npm run generate --workspace=@lolpamin/db`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/db package.json package-lock.json
git commit -m "feat(db): add Prisma schema, client singleton, and test reset helper"
```

---

### Task 3: `packages/db` — seed script

**Files:**
- Create: `packages/db/prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma` from `packages/db/src/index.ts`, schema from Task 2.
- Produces: a runnable seed populating realistic dev data (full members, half members on each side, mention logs, one past game result) so every dashboard screen has data to render before the bots exist.

- [ ] **Step 1: Create `packages/db/prisma/seed.ts`**

```typescript
import { prisma } from "../src/index";

async function main() {
  await prisma.gameParticipant.deleteMany();
  await prisma.gameResult.deleteMany();
  await prisma.mentionLog.deleteMany();
  await prisma.member.deleteMany();

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const fullMembers = await Promise.all(
    [
      { realName: "김도현", riotId: "칼바람장인#KR1", discordUserId: "d-dohyun", discordHandle: "dohyun_kr", kakaoUserId: "k-dohyun", kakaoNickname: "도현", elo: 1482, days: 0 },
      { realName: "박서준", riotId: "미드갱킹#KR1", discordUserId: "d-seojun", discordHandle: "seojun.p", kakaoUserId: "k-seojun", kakaoNickname: "서준찡", elo: 1618, days: 1 },
      { realName: "정우성", riotId: "정글의왕#KR1", discordUserId: "d-woosung", discordHandle: "woosung", kakaoUserId: "k-woosung", kakaoNickname: "우성", elo: 1701, days: 1 },
      { realName: "신유진", riotId: "유진미드#KR1", discordUserId: "d-yujin", discordHandle: "yujin.s", kakaoUserId: "k-yujin", kakaoNickname: "유진", elo: 1573, days: 17 },
      { realName: "배성민", riotId: "성민탑#KR1", discordUserId: "d-sungmin", discordHandle: "sungmin.b", kakaoUserId: "k-sungmin", kakaoNickname: "성민", elo: 1489, days: 33 },
    ].map((m) =>
      prisma.member.create({
        data: {
          realName: m.realName,
          riotId: m.riotId,
          discordUserId: m.discordUserId,
          discordHandle: m.discordHandle,
          kakaoUserId: m.kakaoUserId,
          kakaoNickname: m.kakaoNickname,
          elo: m.elo,
          lastActiveAt: daysAgo(m.days),
        },
      })
    )
  );

  // Half members: Discord-only (no Kakao yet)
  await prisma.member.create({
    data: { discordUserId: "d-nightowl", discordHandle: "nightowl_92", discordJoinedAt: daysAgo(21) },
  });
  await prisma.member.create({
    data: { discordUserId: "d-ttoro", discordHandle: "ttoro.exe", discordJoinedAt: daysAgo(9) },
  });

  // Half members: Kakao-only (no Discord yet)
  await prisma.member.create({
    data: { kakaoUserId: "k-owl", kakaoNickname: "올빼미", lastActiveAt: daysAgo(2) },
  });
  await prisma.member.create({
    data: { kakaoUserId: "k-ttoro2", kakaoNickname: "또로", lastActiveAt: daysAgo(0) },
  });

  await prisma.mentionLog.create({
    data: { memberId: fullMembers[0].id, mentionedAt: daysAgo(0) },
  });

  const [blue1, blue2, red1, red2] = fullMembers;
  const game = await prisma.gameResult.create({
    data: { playedAt: daysAgo(1), winner: "BLUE" },
  });
  await prisma.gameParticipant.createMany({
    data: [
      { gameResultId: game.id, memberId: blue1.id, team: "BLUE", eloBefore: 1466, eloAfter: 1482 },
      { gameResultId: game.id, memberId: blue2.id, team: "BLUE", eloBefore: 1602, eloAfter: 1618 },
      { gameResultId: game.id, memberId: red1.id, team: "RED", eloBefore: 1717, eloAfter: 1701 },
      { gameResultId: game.id, memberId: red2.id, team: "RED", eloBefore: 1589, eloAfter: 1573 },
    ],
  });

  console.log(`Seeded ${fullMembers.length + 4} members.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the seed and verify row counts**

Run: `npm run seed --workspace=@lolpamin/db`
Expected: prints `Seeded 9 members.` with no errors.

Verify: `docker compose exec postgres psql -U lolpamin -c "SELECT count(*) FROM \"Member\";"`
Expected: `9`

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(db): add dev seed data for members, mentions, and one game"
```

---

### Task 4: `packages/core` — ELO calculation

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/elo.ts`
- Create: `packages/core/src/elo.test.ts`

**Interfaces:**
- Produces: `ELO_K: number`, `calculateTeamEloChange(input: TeamEloInput): TeamEloResult` where
  `TeamEloInput = { blueRatings: number[]; redRatings: number[]; winner: "BLUE" | "RED" }`
  `TeamEloResult = { blueDelta: number; redDelta: number; expectedBlueWinRate: number }`.

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@lolpamin/core",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test — `packages/core/src/elo.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { calculateTeamEloChange, ELO_K } from "./elo";

describe("calculateTeamEloChange", () => {
  it("has a K-factor of 32", () => {
    expect(ELO_K).toBe(32);
  });

  it("splits the K-factor evenly when both teams have equal average rating", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1500, 1500],
      redRatings: [1500, 1500],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.5, 5);
    expect(result.blueDelta).toBe(16);
    expect(result.redDelta).toBe(-16);
  });

  it("gives the underdog a bigger gain when the favorite (higher avg) wins as favorite penalty is smaller", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "BLUE",
    });
    expect(result.expectedBlueWinRate).toBeCloseTo(0.7597, 3);
    expect(result.blueDelta).toBe(8);
    expect(result.redDelta).toBe(-8);
  });

  it("rewards the underdog heavily when they upset the favorite", () => {
    const result = calculateTeamEloChange({
      blueRatings: [1700, 1500],
      redRatings: [1500, 1300],
      winner: "RED",
    });
    expect(result.blueDelta).toBe(-24);
    expect(result.redDelta).toBe(24);
  });

  it("throws if a team has no players", () => {
    expect(() =>
      calculateTeamEloChange({ blueRatings: [], redRatings: [1500], winner: "BLUE" })
    ).toThrow("Both teams must have at least one player");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run --root packages/core`
Expected: FAIL — `Cannot find module './elo'`

- [ ] **Step 5: Create `packages/core/src/elo.ts`**

```typescript
export const ELO_K = 32;

export type TeamSide = "BLUE" | "RED";

export interface TeamEloInput {
  blueRatings: number[];
  redRatings: number[];
  winner: TeamSide;
}

export interface TeamEloResult {
  blueDelta: number;
  redDelta: number;
  expectedBlueWinRate: number;
}

function average(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function calculateTeamEloChange({
  blueRatings,
  redRatings,
  winner,
}: TeamEloInput): TeamEloResult {
  if (blueRatings.length === 0 || redRatings.length === 0) {
    throw new Error("Both teams must have at least one player");
  }

  const blueAvg = average(blueRatings);
  const redAvg = average(redRatings);
  const expectedBlueWinRate = 1 / (1 + Math.pow(10, (redAvg - blueAvg) / 400));

  const blueScore = winner === "BLUE" ? 1 : 0;
  const redScore = 1 - blueScore;

  const blueDelta = Math.round(ELO_K * (blueScore - expectedBlueWinRate));
  const redDelta = Math.round(ELO_K * (redScore - (1 - expectedBlueWinRate)));

  return { blueDelta, redDelta, expectedBlueWinRate };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --root packages/core`
Expected: PASS (5 tests)

- [ ] **Step 7: Create `packages/core/src/index.ts`**

```typescript
export * from "./elo";
```

- [ ] **Step 8: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/src/elo.ts packages/core/src/elo.test.ts packages/core/src/index.ts
git commit -m "feat(core): add team ELO calculation with tests"
```

---

### Task 5: `packages/core` — member merge logic

**Files:**
- Create: `packages/core/src/merge-members.ts`
- Create: `packages/core/src/merge-members.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond plain data (no Prisma import — keeps `packages/core` framework-free).
- Produces: `MemberLike` type and `mergeMembers(primary: MemberLike, secondary: MemberLike): Omit<MemberLike, "id">` — used by `apps/dashboard/lib/mutations/link-members.ts` (Task 10).

- [ ] **Step 1: Write the failing test — `packages/core/src/merge-members.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { mergeMembers } from "./merge-members";

describe("mergeMembers", () => {
  it("keeps the primary side's platform id and takes the secondary's missing platform id", () => {
    const primary = {
      id: "discord-half",
      realName: "최민재",
      riotId: null,
      discordUserId: "d-1",
      kakaoUserId: null,
      elo: 1390,
      lastActiveAt: null,
    };
    const secondary = {
      id: "kakao-half",
      realName: null,
      riotId: "재현정글#KR2",
      discordUserId: null,
      kakaoUserId: "k-1",
      elo: 1000,
      lastActiveAt: new Date("2026-08-20T00:00:00Z"),
    };

    const merged = mergeMembers(primary, secondary);

    expect(merged.discordUserId).toBe("d-1");
    expect(merged.kakaoUserId).toBe("k-1");
    expect(merged.realName).toBe("최민재");
    expect(merged.riotId).toBe("재현정글#KR2");
    expect(merged.elo).toBe(1390);
    expect(merged.lastActiveAt).toEqual(new Date("2026-08-20T00:00:00Z"));
  });

  it("prefers the later lastActiveAt of the two sides", () => {
    const older = new Date("2026-08-01T00:00:00Z");
    const newer = new Date("2026-08-20T00:00:00Z");
    const merged = mergeMembers(
      { id: "a", realName: "a", riotId: null, discordUserId: "d", kakaoUserId: null, elo: 1000, lastActiveAt: newer },
      { id: "b", realName: null, riotId: null, discordUserId: null, kakaoUserId: "k", elo: 1000, lastActiveAt: older }
    );
    expect(merged.lastActiveAt).toEqual(newer);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --root packages/core`
Expected: FAIL — `Cannot find module './merge-members'`

- [ ] **Step 3: Create `packages/core/src/merge-members.ts`**

```typescript
export interface MemberLike {
  id: string;
  realName: string | null;
  riotId: string | null;
  discordUserId: string | null;
  kakaoUserId: string | null;
  elo: number;
  lastActiveAt: Date | null;
}

export function mergeMembers(
  primary: MemberLike,
  secondary: MemberLike
): Omit<MemberLike, "id"> {
  const laterOf = (a: Date | null, b: Date | null): Date | null => {
    if (!a) return b;
    if (!b) return a;
    return a.getTime() >= b.getTime() ? a : b;
  };

  return {
    realName: primary.realName ?? secondary.realName,
    riotId: primary.riotId ?? secondary.riotId,
    discordUserId: primary.discordUserId ?? secondary.discordUserId,
    kakaoUserId: primary.kakaoUserId ?? secondary.kakaoUserId,
    elo: Math.max(primary.elo, secondary.elo),
    lastActiveAt: laterOf(primary.lastActiveAt, secondary.lastActiveAt),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root packages/core`
Expected: PASS (7 tests total)

- [ ] **Step 5: Update `packages/core/src/index.ts`**

```typescript
export * from "./elo";
export * from "./merge-members";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/merge-members.ts packages/core/src/merge-members.test.ts packages/core/src/index.ts
git commit -m "feat(core): add member merge logic for account linking"
```

---

### Task 6: `packages/core` — inactivity detection

**Files:**
- Create: `packages/core/src/inactivity.ts`
- Create: `packages/core/src/inactivity.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `INACTIVITY_THRESHOLD_DAYS = 14`, `LONG_INACTIVITY_THRESHOLD_DAYS = 30`, `MemberActivity = { id: string; kakaoUserId: string | null; lastActiveAt: Date | null; createdAt: Date }`, `getInactiveMembers(members: MemberActivity[], now: Date): Array<{ id: string; daysSinceActive: number }>` (sorted longest-inactive first) — used by `apps/dashboard/lib/queries/inactive.ts` (Task 15).

- [ ] **Step 1: Write the failing test — `packages/core/src/inactivity.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { getInactiveMembers, INACTIVITY_THRESHOLD_DAYS } from "./inactivity";

const NOW = new Date("2026-08-23T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("getInactiveMembers", () => {
  it("excludes members with no kakaoUserId (nothing to measure)", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: null, lastActiveAt: daysAgo(100), createdAt: daysAgo(100) }],
      NOW
    );
    expect(result).toEqual([]);
  });

  it("excludes members active within the threshold", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: daysAgo(13), createdAt: daysAgo(30) }],
      NOW
    );
    expect(result).toEqual([]);
  });

  it("includes members at or beyond the threshold, with days since active", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: daysAgo(14), createdAt: daysAgo(60) }],
      NOW
    );
    expect(result).toEqual([{ id: "1", daysSinceActive: 14 }]);
    expect(INACTIVITY_THRESHOLD_DAYS).toBe(14);
  });

  it("falls back to createdAt when lastActiveAt is null, treating them as inactive since joining", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: null, createdAt: daysAgo(20) }],
      NOW
    );
    expect(result).toEqual([{ id: "1", daysSinceActive: 20 }]);
  });

  it("sorts by days inactive, longest first", () => {
    const result = getInactiveMembers(
      [
        { id: "short", kakaoUserId: "k1", lastActiveAt: daysAgo(15), createdAt: daysAgo(60) },
        { id: "long", kakaoUserId: "k2", lastActiveAt: daysAgo(40), createdAt: daysAgo(60) },
      ],
      NOW
    );
    expect(result.map((r) => r.id)).toEqual(["long", "short"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --root packages/core`
Expected: FAIL — `Cannot find module './inactivity'`

- [ ] **Step 3: Create `packages/core/src/inactivity.ts`**

```typescript
export const INACTIVITY_THRESHOLD_DAYS = 14;
export const LONG_INACTIVITY_THRESHOLD_DAYS = 30;

export interface MemberActivity {
  id: string;
  kakaoUserId: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
}

export interface InactiveMemberResult {
  id: string;
  daysSinceActive: number;
}

export function getInactiveMembers(
  members: MemberActivity[],
  now: Date
): InactiveMemberResult[] {
  return members
    .filter((m) => m.kakaoUserId !== null)
    .map((m) => {
      const referenceDate = m.lastActiveAt ?? m.createdAt;
      const daysSinceActive = Math.floor(
        (now.getTime() - referenceDate.getTime()) / 86_400_000
      );
      return { id: m.id, daysSinceActive };
    })
    .filter((m) => m.daysSinceActive >= INACTIVITY_THRESHOLD_DAYS)
    .sort((a, b) => b.daysSinceActive - a.daysSinceActive);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root packages/core`
Expected: PASS (12 tests total)

- [ ] **Step 5: Update `packages/core/src/index.ts`**

```typescript
export * from "./elo";
export * from "./merge-members";
export * from "./inactivity";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/inactivity.ts packages/core/src/inactivity.test.ts packages/core/src/index.ts
git commit -m "feat(core): add inactivity detection for the Kakao mention report"
```

---

### Task 7: `apps/dashboard` — Next.js + Tailwind scaffold and shared shell

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/next.config.js`
- Create: `apps/dashboard/tailwind.config.ts`
- Create: `apps/dashboard/postcss.config.js`
- Create: `apps/dashboard/app/globals.css`
- Create: `apps/dashboard/app/layout.tsx`
- Create: `apps/dashboard/app/page.tsx`
- Create: `apps/dashboard/lib/prisma.ts`
- Create: `apps/dashboard/components/NavLink.tsx`
- Create: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `prisma` from `@lolpamin/db` (Task 2).
- Produces: `<AppShell activeNav={...} pageTitle={...} pageDesc={...}>{children}</AppShell>` used by every page in Tasks 8/12/15; `prisma` re-export from `apps/dashboard/lib/prisma.ts`.

- [ ] **Step 1: Create `apps/dashboard/package.json`**

```json
{
  "name": "dashboard",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@lolpamin/core": "*",
    "@lolpamin/db": "*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/dashboard/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/dashboard/next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lolpamin/core", "@lolpamin/db"],
};

module.exports = nextConfig;
```

- [ ] **Step 4: Create `apps/dashboard/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "'Noto Sans KR'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create `apps/dashboard/postcss.config.js`**

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create `apps/dashboard/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap");
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css");

html,
body {
  margin: 0;
  padding: 0;
  background: #0e1117;
  color: #e6eaf2;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-thumb {
  background: #2a3242;
  border-radius: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
```

- [ ] **Step 7: Create `apps/dashboard/lib/prisma.ts`**

```typescript
export { prisma } from "@lolpamin/db";
```

- [ ] **Step 8: Create `apps/dashboard/components/NavLink.tsx`**

```tsx
import Link from "next/link";

export interface NavLinkProps {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
}

export function NavLink({ href, label, icon, active, badge }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
        active ? "bg-[#20293A] text-white font-bold" : "text-[#95A0B2] font-medium hover:bg-[#1B2130] hover:text-[#E6EAF2]"
      }`}
    >
      <span className={`w-4 text-center font-mono text-[11px] ${active ? "text-[#8FB4F5]" : "text-[#4E576A]"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded-full bg-[#ED7D31]/[.16] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[#F2985C]">
          {badge}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 9: Create `apps/dashboard/components/AppShell.tsx`**

```tsx
import { prisma } from "@/lib/prisma";
import { NavLink } from "./NavLink";

export interface AppShellProps {
  activeNav: "members" | "matches" | "inactive";
  pageTitle: string;
  pageDesc: string;
  children: React.ReactNode;
}

export async function AppShell({ activeNav, pageTitle, pageDesc, children }: AppShellProps) {
  const [totalCount, inactiveNavCount] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { kakaoUserId: { not: null } } }),
  ]);

  const navItems = [
    { key: "members" as const, href: "/members", label: "회원 관리", icon: "01" },
    { key: "matches" as const, href: "/matches", label: "게임 결과 입력", icon: "02" },
    { key: "inactive" as const, href: "/inactive", label: "미활동 리포트", icon: "03", badge: String(inactiveNavCount) },
  ];

  return (
    <div className="flex min-h-screen bg-[#0E1117] font-sans text-[#E6EAF2]">
      <aside className="sticky top-0 flex h-screen w-[232px] flex-none flex-col gap-6 border-r border-white/[.07] bg-[#12161F] p-3.5">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-gradient-to-br from-[#4472C4] to-[#1E3461] text-sm font-extrabold text-white">
            롤
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[13.5px] font-bold">롤파민</div>
            <div className="text-[10.5px] text-[#6E7889]">내부 운영 도구</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <div className="px-2 pb-2 text-[10px] font-bold tracking-wider text-[#5C6577]">운영</div>
          {navItems.map((n) => (
            <NavLink key={n.key} href={n.href} label={n.label} icon={n.icon} active={activeNav === n.key} badge={n.badge} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 rounded-[10px] border border-white/[.06] bg-[#161B26] p-3">
            <div className="text-[10.5px] font-semibold text-[#6E7889]">봇 연동 상태</div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#B7C0D0]">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#70AD47]" />
              Discord Bot · 정상
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#B7C0D0]">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#70AD47]" />
              KakaoTalk Bot · 정상
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[58px] flex-none items-center justify-between border-b border-white/[.07] bg-[#0E1117]/85 px-7 backdrop-blur">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 text-[15.5px] font-bold">{pageTitle}</h1>
            <span className="text-[11.5px] text-[#6E7889]">{pageDesc}</span>
          </div>
          <div className="text-[11.5px] text-[#8A94A6]">
            회원 <span className="font-mono font-semibold text-[#E6EAF2]">{totalCount}</span>명
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 10: Create `apps/dashboard/app/layout.tsx`**

```tsx
import "./globals.css";

export const metadata = {
  title: "롤파민 · 내부 운영 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Create `apps/dashboard/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/members");
}
```

- [ ] **Step 12: Install and verify the dev server boots**

Run: `npm install`
Run: `npm run dev --workspace=dashboard`
Visit `http://localhost:3000` — expect a redirect to `/members`, which 404s until Task 8 (that 404 is expected here; the goal of this step is confirming the shell/layout/Tailwind pipeline compiles with no errors in the terminal).
Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 13: Commit**

```bash
git add apps/dashboard package.json package-lock.json
git commit -m "feat(dashboard): scaffold Next.js app, Tailwind theme, and shared AppShell"
```

---

### Task 8: Members page — stats and table (server-rendered)

**Files:**
- Create: `apps/dashboard/lib/queries/members.ts`
- Create: `apps/dashboard/components/StatCard.tsx`
- Create: `apps/dashboard/components/MemberTable.tsx`
- Create: `apps/dashboard/app/members/page.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 7), `AppShell` (Task 7).
- Produces: `getMemberListData(filter, query): Promise<MemberListData>` — consumed by `app/members/page.tsx` now and extended by `MemberFilters` in Task 9 via URL search params (no new export needed, just wired to `searchParams`).

- [ ] **Step 1: Create `apps/dashboard/lib/queries/members.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import type { Member } from "@lolpamin/db";

export type MemberFilter = "all" | "half" | "inactive";

export interface MemberRow {
  id: string;
  name: string;
  riot: string;
  elo: number;
  lastActiveLabel: string;
  daysSinceActive: number | null;
  discordLabel: string;
  discordLinked: boolean;
  kakaoLabel: string;
  kakaoLinked: boolean;
  isHalf: boolean;
}

export interface MemberListData {
  totalCount: number;
  halfCount: number;
  unassignedCount: number;
  averageElo: number;
  rows: MemberRow[];
}

function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function toRow(m: Member, now: Date): MemberRow {
  const days = daysSince(m.lastActiveAt, now);
  return {
    id: m.id,
    name: m.realName ?? m.discordHandle ?? m.kakaoNickname ?? "이름 미확인",
    riot: m.riotId ?? "미등록",
    elo: m.elo,
    lastActiveLabel: days === null ? "기록 없음" : days === 0 ? "오늘" : `${days}일 전`,
    daysSinceActive: days,
    discordLabel: m.discordUserId ? `Discord ${m.discordHandle ?? m.discordUserId}` : "Discord 없음",
    discordLinked: m.discordUserId !== null,
    kakaoLabel: m.kakaoUserId ? `카톡 ${m.kakaoNickname ?? m.kakaoUserId}` : "카톡 없음",
    kakaoLinked: m.kakaoUserId !== null,
    isHalf: !m.discordUserId || !m.kakaoUserId,
  };
}

export async function getMemberListData(
  filter: MemberFilter,
  query: string
): Promise<MemberListData> {
  const now = new Date();
  const allMembers = await prisma.member.findMany({ orderBy: { createdAt: "asc" } });

  const totalCount = allMembers.length;
  const halfCount = allMembers.filter((m) => !m.discordUserId || !m.kakaoUserId).length;
  const unassignedCount = halfCount;
  const averageElo = totalCount === 0
    ? 0
    : Math.round(allMembers.reduce((sum, m) => sum + m.elo, 0) / totalCount);

  const trimmedQuery = query.trim().toLowerCase();
  const rows = allMembers
    .map((m) => toRow(m, now))
    .filter((row) => {
      if (filter === "half" && !row.isHalf) return false;
      if (filter === "inactive" && (row.daysSinceActive === null || row.daysSinceActive < 14)) return false;
      if (trimmedQuery && !row.name.toLowerCase().includes(trimmedQuery) && !row.riot.toLowerCase().includes(trimmedQuery)) {
        return false;
      }
      return true;
    });

  return { totalCount, halfCount, unassignedCount, averageElo, rows };
}
```

- [ ] **Step 2: Create `apps/dashboard/components/StatCard.tsx`**

```tsx
export interface StatCardProps {
  label: string;
  value: number | string;
  unit: string;
  colorClassName: string;
}

export function StatCard({ label, value, unit, colorClassName }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[11px] border border-white/[.06] bg-[#151A24] px-4 py-3.5">
      <div className="text-[11px] font-medium text-[#7A8496]">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-[23px] font-bold tracking-tight ${colorClassName}`}>{value}</span>
        <span className="text-[11px] text-[#6E7889]">{unit}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/components/MemberTable.tsx`**

```tsx
import type { MemberRow } from "@/lib/queries/members";

export function MemberTable({ rows }: { rows: MemberRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
      <div className="grid grid-cols-[180px_1fr_92px_132px_210px] gap-0 border-b border-white/[.06] bg-[#12161F] px-4.5 py-2.5 text-[10.5px] font-bold tracking-wide text-[#6E7889]">
        <div>실명</div>
        <div>라이엇 ID</div>
        <div className="text-right">ELO</div>
        <div className="text-right">마지막 활동</div>
        <div className="pl-5">계정 연결</div>
      </div>
      {rows.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-[180px_1fr_92px_132px_210px] items-center border-b border-white/[.04] px-4.5 py-2.5 text-[12.5px] hover:bg-[#181E29]"
        >
          <div className="truncate font-semibold">{m.name}</div>
          <div className={`truncate pr-3 font-mono text-[11.5px] ${m.riot === "미등록" ? "text-[#5C6577]" : "text-[#9FB0CC]"}`}>
            {m.riot}
          </div>
          <div className={`text-right font-mono text-[13px] font-bold ${m.elo >= 1600 ? "text-[#F2C75C]" : "text-[#E6EAF2]"}`}>
            {m.elo}
          </div>
          <div
            className={`text-right font-mono text-[11.5px] ${
              m.daysSinceActive !== null && m.daysSinceActive >= 30
                ? "text-[#EE8B8B]"
                : m.daysSinceActive !== null && m.daysSinceActive >= 14
                ? "text-[#F2985C]"
                : "text-[#8A94A6]"
            }`}
          >
            {m.lastActiveLabel}
          </div>
          <div className="flex gap-1.5 pl-5">
            <span
              className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${
                m.discordLinked
                  ? "border-[#5865F2]/30 bg-[#5865F2]/[.13] text-[#8FA9F5]"
                  : "border-white/[.07] bg-white/[.03] text-[#5C6577]"
              }`}
            >
              {m.discordLabel}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${
                m.kakaoLinked
                  ? "border-[#FFC000]/30 bg-[#FFC000]/[.12] text-[#F2C75C]"
                  : "border-white/[.07] bg-white/[.03] text-[#5C6577]"
              }`}
            >
              {m.kakaoLabel}
            </span>
            {m.isHalf && (
              <span className="rounded-md border border-[#ED7D31]/35 bg-[#ED7D31]/[.16] px-2 py-0.5 text-[10.5px] font-extrabold text-[#F2985C]">
                미연결
              </span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Create `apps/dashboard/app/members/page.tsx`**

```tsx
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { MemberTable } from "@/components/MemberTable";
import { getMemberListData, type MemberFilter } from "@/lib/queries/members";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  const filter = (searchParams.filter ?? "all") as MemberFilter;
  const query = searchParams.q ?? "";
  const data = await getMemberListData(filter, query);

  return (
    <AppShell
      activeNav="members"
      pageTitle="회원 관리 · 계정 매핑"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
      <div className="flex flex-col gap-5.5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="전체 회원" value={data.totalCount} unit="명" colorClassName="text-[#E6EAF2]" />
          <StatCard label="미연결(반쪽) 회원" value={data.halfCount} unit="명" colorClassName="text-[#F2985C]" />
          <StatCard label="미배정 계정" value={data.unassignedCount} unit="건" colorClassName="text-[#F2C75C]" />
          <StatCard label="평균 ELO" value={data.averageElo} unit="점" colorClassName="text-[#8FB4F5]" />
        </div>
        <MemberTable rows={data.rows} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Manually verify against the seeded data**

Run: `npm run dev --workspace=dashboard`, visit `http://localhost:3000/members`.
Expected: 9 stat-card total, 4 half-linked, table lists all 9 seeded members with correct badges and "미연결" tags on the 4 half rows.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/queries/members.ts apps/dashboard/components/StatCard.tsx apps/dashboard/components/MemberTable.tsx apps/dashboard/app/members/page.tsx
git commit -m "feat(dashboard): render member stats and table from seeded data"
```

---

### Task 9: Members page — search and filter controls

**Files:**
- Create: `apps/dashboard/components/MemberFilters.tsx`
- Modify: `apps/dashboard/app/members/page.tsx`

**Interfaces:**
- Consumes: `MemberFilter` type (Task 8).
- Produces: a client component that updates the page's `?filter=&q=` search params, which `MembersPage` (Task 8) already reads.

- [ ] **Step 1: Create `apps/dashboard/components/MemberFilters.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberFilter } from "@/lib/queries/members";

const FILTERS: Array<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "half", label: "미연결만" },
  { key: "inactive", label: "미활동만" },
];

export function MemberFilters({ activeFilter, query }: { activeFilter: MemberFilter; query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { filter?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    router.push(`/members?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between border-b border-white/[.06] px-4.5 py-3.5">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-[13.5px] font-bold">전체 회원</h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => updateParams({ filter: f.key })}
              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${
                activeFilter === f.key
                  ? "border-[#4472C4]/45 bg-[#4472C4]/[.18] text-[#8FB4F5]"
                  : "border-white/[.09] bg-transparent text-[#7A8496]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="이름 · 라이엇 ID 검색"
        className="w-56 rounded-lg border border-white/[.09] bg-[#0F131B] px-2.5 py-1.5 text-xs text-[#E6EAF2] outline-none focus:border-[#4472C4]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `apps/dashboard/app/members/page.tsx`**

Replace the `<MemberTable rows={data.rows} />` line with:

```tsx
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberFilters activeFilter={filter} query={query} />
          <MemberTable rows={data.rows} />
        </section>
```

Remove the `<section>` wrapper that used to be inside `MemberTable.tsx`'s top-level return (change its root element from `<section className="overflow-hidden ...">` to a plain `<>` fragment) so the header row/table nest correctly under the new wrapping `<section>` from `MemberFilters`+`MemberTable`. Update the import list at the top of `page.tsx` to add `import { MemberFilters } from "@/components/MemberFilters";`.

- [ ] **Step 3: Manually verify filtering and search**

Run: `npm run dev --workspace=dashboard`, visit `/members`.
- Click "미연결만" — expect exactly the 4 half-linked seeded rows.
- Type "도현" in the search box — expect exactly 김도현's row.
- Click "전체" — expect all rows back.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/MemberFilters.tsx apps/dashboard/components/MemberTable.tsx apps/dashboard/app/members/page.tsx
git commit -m "feat(dashboard): add member search and filter controls"
```

---

### Task 10: Account mapping — link mutation

**Files:**
- Create: `apps/dashboard/lib/mutations/link-members.ts`
- Create: `apps/dashboard/lib/mutations/link-members.test.ts`

**Interfaces:**
- Consumes: `mergeMembers` from `@lolpamin/core` (Task 5), `PrismaClient` type from `@lolpamin/db` (Task 2).
- Produces: `linkMembers(prisma: PrismaClient, discordSideId: string, kakaoSideId: string): Promise<Member>` — used by the server action in Task 11.

- [ ] **Step 1: Write the failing integration test — `apps/dashboard/lib/mutations/link-members.test.ts`**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { linkMembers } from "./link-members";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("linkMembers", () => {
  it("merges a discord-only half member with a kakao-only half member into one row", async () => {
    const discordSide = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "minjae0", elo: 1390 },
    });
    const kakaoSide = await prisma.member.create({
      data: { kakaoUserId: "k-1", kakaoNickname: "재현정글", lastActiveAt: new Date("2026-08-20T00:00:00Z") },
    });

    const merged = await linkMembers(prisma, discordSide.id, kakaoSide.id);

    expect(merged.discordUserId).toBe("d-1");
    expect(merged.kakaoUserId).toBe("k-1");
    expect(merged.elo).toBe(1390);

    const remaining = await prisma.member.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(discordSide.id);
  });

  it("throws if the discord-side member already has a kakaoUserId", async () => {
    const alreadyFull = await prisma.member.create({
      data: { discordUserId: "d-2", kakaoUserId: "k-2" },
    });
    const kakaoSide = await prisma.member.create({ data: { kakaoUserId: "k-3" } });

    await expect(linkMembers(prisma, alreadyFull.id, kakaoSide.id)).rejects.toThrow(
      "already linked"
    );
  });

  it("throws if the kakao-side member already has a discordUserId", async () => {
    const discordSide = await prisma.member.create({ data: { discordUserId: "d-3" } });
    const alreadyFull = await prisma.member.create({
      data: { discordUserId: "d-4", kakaoUserId: "k-4" },
    });

    await expect(linkMembers(prisma, discordSide.id, alreadyFull.id)).rejects.toThrow(
      "already linked"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST=postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test npx vitest run --root apps/dashboard lib/mutations/link-members.test.ts`
Expected: FAIL — `Cannot find module './link-members'`

- [ ] **Step 3: Create `apps/dashboard/lib/mutations/link-members.ts`**

```typescript
import type { Member, PrismaClient } from "@lolpamin/db";
import { mergeMembers } from "@lolpamin/core";

export async function linkMembers(
  prisma: PrismaClient,
  discordSideId: string,
  kakaoSideId: string
): Promise<Member> {
  return prisma.$transaction(async (tx) => {
    const discordSide = await tx.member.findUniqueOrThrow({ where: { id: discordSideId } });
    const kakaoSide = await tx.member.findUniqueOrThrow({ where: { id: kakaoSideId } });

    if (discordSide.kakaoUserId !== null) {
      throw new Error("Discord-side member is already linked to a KakaoTalk account");
    }
    if (kakaoSide.discordUserId !== null) {
      throw new Error("Kakao-side member is already linked to a Discord account");
    }

    const merged = mergeMembers(discordSide, kakaoSide);

    const updated = await tx.member.update({
      where: { id: discordSideId },
      data: merged,
    });

    await tx.mentionLog.updateMany({
      where: { memberId: kakaoSideId },
      data: { memberId: discordSideId },
    });
    await tx.gameParticipant.updateMany({
      where: { memberId: kakaoSideId },
      data: { memberId: discordSideId },
    });
    await tx.member.delete({ where: { id: kakaoSideId } });

    return updated;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST=postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test npx vitest run --root apps/dashboard lib/mutations/link-members.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/mutations/link-members.ts apps/dashboard/lib/mutations/link-members.test.ts
git commit -m "feat(dashboard): add link-members mutation merging two half-records"
```

---

### Task 11: Account mapping — UI panels

**Files:**
- Create: `apps/dashboard/lib/queries/pending-accounts.ts`
- Create: `apps/dashboard/app/members/actions.ts`
- Create: `apps/dashboard/components/AccountMappingPanel.tsx`
- Modify: `apps/dashboard/app/members/page.tsx`

**Interfaces:**
- Consumes: `linkMembers` (Task 10), `prisma` (Task 7).
- Produces: `linkMembersAction(formData: FormData): Promise<void>` server action, consumed only by `AccountMappingPanel`.

- [ ] **Step 1: Create `apps/dashboard/lib/queries/pending-accounts.ts`**

```typescript
import { prisma } from "@/lib/prisma";

export interface PendingDiscordAccount {
  id: string;
  handle: string;
}

export interface PendingKakaoAccount {
  id: string;
  nickname: string;
}

export async function getPendingDiscordAccounts(): Promise<PendingDiscordAccount[]> {
  const members = await prisma.member.findMany({
    where: { kakaoUserId: null, discordUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, handle: m.discordHandle ?? m.discordUserId! }));
}

export async function getPendingKakaoAccounts(): Promise<PendingKakaoAccount[]> {
  const members = await prisma.member.findMany({
    where: { discordUserId: null, kakaoUserId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, nickname: m.kakaoNickname ?? m.kakaoUserId! }));
}
```

- [ ] **Step 2: Create `apps/dashboard/app/members/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { linkMembers } from "@/lib/mutations/link-members";

export async function linkMembersAction(formData: FormData): Promise<void> {
  const discordSideId = String(formData.get("discordSideId") ?? "");
  const kakaoSideId = String(formData.get("kakaoSideId") ?? "");
  if (!discordSideId || !kakaoSideId) {
    throw new Error("Select one Discord account and one KakaoTalk account before linking");
  }
  await linkMembers(prisma, discordSideId, kakaoSideId);
  revalidatePath("/members");
}
```

- [ ] **Step 3: Create `apps/dashboard/components/AccountMappingPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { PendingDiscordAccount, PendingKakaoAccount } from "@/lib/queries/pending-accounts";
import { linkMembersAction } from "@/app/members/actions";

export function AccountMappingPanel({
  discordAccounts,
  kakaoAccounts,
}: {
  discordAccounts: PendingDiscordAccount[];
  kakaoAccounts: PendingKakaoAccount[];
}) {
  const [selectedDiscordId, setSelectedDiscordId] = useState<string | null>(null);
  const [selectedKakaoId, setSelectedKakaoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const linkReady = selectedDiscordId !== null && selectedKakaoId !== null;

  async function handleLink() {
    if (!linkReady) return;
    setIsPending(true);
    const formData = new FormData();
    formData.set("discordSideId", selectedDiscordId!);
    formData.set("kakaoSideId", selectedKakaoId!);
    try {
      await linkMembersAction(formData);
      const d = discordAccounts.find((a) => a.id === selectedDiscordId);
      const k = kakaoAccounts.find((a) => a.id === selectedKakaoId);
      setStatus(`연결 완료 · ${d?.handle} ↔ ${k?.nickname}`);
      setSelectedDiscordId(null);
      setSelectedKakaoId(null);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="m-0 text-[13.5px] font-bold">계정 매핑</h2>
        <span className="text-[11.5px] text-[#6E7889]">
          양쪽에서 한 개씩 골라 연결하세요. 연결하면 하나의 회원 데이터로 합쳐집니다.
        </span>
      </div>
      <div className="grid grid-cols-[1fr_210px_1fr] items-stretch gap-3.5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] bg-[#5865F2]/[.07] px-4 py-3">
            <span className="text-[12.5px] font-bold">미연결 Discord 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{discordAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {discordAccounts.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDiscordId(selectedDiscordId === d.id ? null : d.id)}
                className={`rounded-lg border px-2.5 py-2 text-left font-mono text-[12.5px] ${
                  selectedDiscordId === d.id ? "border-[#5865F2] bg-[#5865F2]/[.14]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                {d.handle}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] p-4">
          <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
            {linkReady ? "선택한 두 계정을 같은 사람으로 연결합니다" : "양쪽에서 각각 하나씩 선택하세요"}
          </div>
          <button
            onClick={handleLink}
            disabled={!linkReady || isPending}
            className={`w-full rounded-lg py-2.5 text-[12.5px] font-bold ${
              linkReady && !isPending ? "cursor-pointer bg-[#4472C4] text-white" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            ↔ 선택 계정 연결
          </button>
          {status && (
            <div className="w-full rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[10.5px] leading-relaxed text-[#9BD173]">
              {status}
            </div>
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] bg-[#FFC000]/[.07] px-4 py-3">
            <span className="text-[12.5px] font-bold">미연결 카카오톡 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{kakaoAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {kakaoAccounts.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelectedKakaoId(selectedKakaoId === k.id ? null : k.id)}
                className={`rounded-lg border px-2.5 py-2 text-left text-[12.5px] ${
                  selectedKakaoId === k.id ? "border-[#FFC000] bg-[#FFC000]/[.12]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                {k.nickname}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into `apps/dashboard/app/members/page.tsx`**

Add imports:

```tsx
import { getPendingDiscordAccounts, getPendingKakaoAccounts } from "@/lib/queries/pending-accounts";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
```

In the component body, fetch both alongside `data`:

```tsx
  const [data, discordAccounts, kakaoAccounts] = await Promise.all([
    getMemberListData(filter, query),
    getPendingDiscordAccounts(),
    getPendingKakaoAccounts(),
  ]);
```

Add after the member table `</section>`:

```tsx
        <AccountMappingPanel discordAccounts={discordAccounts} kakaoAccounts={kakaoAccounts} />
```

- [ ] **Step 5: Manually verify the link flow end-to-end**

Run: `npm run dev --workspace=dashboard`, visit `/members`.
- Confirm the mapping panel shows 2 pending Discord accounts (`nightowl_92`, `ttoro.exe`) and 2 pending Kakao accounts (`올빼미`, `또로`).
- Select one from each side, click "선택 계정 연결" — expect the success message, the pending lists shrinking to 1 each, and the member table gaining a new fully-linked row (page revalidates via `revalidatePath`).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/queries/pending-accounts.ts apps/dashboard/app/members/actions.ts apps/dashboard/components/AccountMappingPanel.tsx apps/dashboard/app/members/page.tsx
git commit -m "feat(dashboard): add account mapping panel wired to the link mutation"
```

---

### Task 12: Match builder — participant pool and team panels

**Files:**
- Create: `apps/dashboard/lib/queries/linked-members.ts`
- Create: `apps/dashboard/components/MatchBuilder.tsx`
- Create: `apps/dashboard/app/matches/page.tsx`

**Interfaces:**
- Consumes: `calculateTeamEloChange` from `@lolpamin/core` (Task 4).
- Produces: `MatchBuilder` client component holding pool/team/winner state internally; `saveGameResultAction` will be wired in Task 14.

- [ ] **Step 1: Create `apps/dashboard/lib/queries/linked-members.ts`**

```typescript
import { prisma } from "@/lib/prisma";

export interface LinkedMemberOption {
  id: string;
  name: string;
  elo: number;
}

export async function getLinkedMembers(): Promise<LinkedMemberOption[]> {
  const members = await prisma.member.findMany({
    where: { discordUserId: { not: null }, kakaoUserId: { not: null } },
    orderBy: { elo: "desc" },
  });
  return members.map((m) => ({ id: m.id, name: m.realName ?? m.discordHandle ?? "이름 미확인", elo: m.elo }));
}
```

- [ ] **Step 2: Create `apps/dashboard/components/MatchBuilder.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { calculateTeamEloChange, ELO_K, type TeamSide } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";

export function MatchBuilder({ pool }: { pool: LinkedMemberOption[] }) {
  const [poolQuery, setPoolQuery] = useState("");
  const [blueIds, setBlueIds] = useState<string[]>([]);
  const [redIds, setRedIds] = useState<string[]>([]);
  const [winner, setWinner] = useState<TeamSide | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const usedIds = new Set([...blueIds, ...redIds]);

  const visiblePool = pool.filter((p) => !poolQuery || p.name.toLowerCase().includes(poolQuery.toLowerCase()));

  const preview = useMemo(() => {
    if (blueIds.length === 0 || redIds.length === 0 || !winner) return null;
    const blueRatings = blueIds.map((id) => byId.get(id)!.elo);
    const redRatings = redIds.map((id) => byId.get(id)!.elo);
    const result = calculateTeamEloChange({ blueRatings, redRatings, winner });
    return {
      ...result,
      blueRows: blueIds.map((id) => ({ id, ...byId.get(id)!, delta: result.blueDelta, after: byId.get(id)!.elo + result.blueDelta })),
      redRows: redIds.map((id) => ({ id, ...byId.get(id)!, delta: result.redDelta, after: byId.get(id)!.elo + result.redDelta })),
    };
  }, [blueIds, redIds, winner, byId]);

  const canSave = blueIds.length > 0 && redIds.length > 0 && winner !== null;

  function addTo(team: "blue" | "red", id: string) {
    if (usedIds.has(id)) return;
    if (team === "blue" && blueIds.length < 5) setBlueIds([...blueIds, id]);
    if (team === "red" && redIds.length < 5) setRedIds([...redIds, id]);
    setSavedMessage(null);
  }

  function removeFrom(team: "blue" | "red", id: string) {
    if (team === "blue") setBlueIds(blueIds.filter((x) => x !== id));
    if (team === "red") setRedIds(redIds.filter((x) => x !== id));
    setSavedMessage(null);
  }

  return (
    <div className="grid grid-cols-[296px_1fr_300px] items-start gap-4">
      <section className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="flex flex-col gap-2 border-b border-white/[.06] p-4">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[13px] font-bold">참가자 선택</h2>
            <span className="text-[10.5px] text-[#6E7889]">매핑 완료 회원만</span>
          </div>
          <input
            value={poolQuery}
            onChange={(e) => setPoolQuery(e.target.value)}
            placeholder="회원 검색"
            className="w-full rounded-lg border border-white/[.09] bg-[#0F131B] px-2.5 py-1.5 text-xs text-[#E6EAF2] outline-none focus:border-[#4472C4]"
          />
        </div>
        <div className="flex max-h-[520px] flex-col overflow-y-auto">
          {visiblePool.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5 ${usedIds.has(p.id) ? "opacity-35" : ""}`}>
              <div className="flex flex-1 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{p.name}</span>
                <span className="font-mono text-[10.5px] text-[#6E7889]">ELO {p.elo}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => addTo("blue", p.id)} className="rounded-md border border-[#4472C4]/40 bg-[#4472C4]/[.12] px-1.5 py-1 text-[10.5px] font-bold text-[#8FB4F5]">
                  블루
                </button>
                <button onClick={() => addTo("red", p.id)} className="rounded-md border border-[#E05A5A]/40 bg-[#E05A5A]/[.12] px-1.5 py-1 text-[10.5px] font-bold text-[#EE8B8B]">
                  레드
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="rounded-xl border border-white/[.06] bg-[#151A24] px-4 py-3.5">
          <div className="text-[12.5px] font-bold">경기 정보</div>
          <div className="text-[11px] text-[#6E7889]">5v5 내전 · 승/패 방식 · K값 {ELO_K}</div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          {(["blue", "red"] as const).map((team) => {
            const ids = team === "blue" ? blueIds : redIds;
            const accent = team === "blue" ? "#8FB4F5" : "#EE8B8B";
            const isWinner = winner === team.toUpperCase();
            return (
              <div key={team} className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
                <div className="flex flex-col gap-2 border-b border-white/[.06] px-3.5 py-3" style={{ background: team === "blue" ? "rgba(68,114,196,.12)" : "rgba(224,90,90,.11)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold" style={{ color: accent }}>
                      {team === "blue" ? "BLUE TEAM" : "RED TEAM"}
                    </span>
                    <span className="font-mono text-[11px] text-[#7A8496]">{ids.length}/5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-[#7A8496]">
                      평균 ELO{" "}
                      <span className="font-mono font-bold text-[#E6EAF2]">
                        {ids.length ? Math.round(ids.reduce((s, id) => s + byId.get(id)!.elo, 0) / ids.length) : "—"}
                      </span>
                    </span>
                    <button
                      onClick={() => setWinner(isWinner ? null : (team.toUpperCase() as TeamSide))}
                      className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                        isWinner ? "border-transparent text-white" : "border-white/[.14] text-[#7A8496]"
                      }`}
                      style={isWinner ? { background: team === "blue" ? "#4472C4" : "#E05A5A" } : {}}
                    >
                      승리
                    </button>
                  </div>
                </div>
                <div className="flex min-h-[230px] flex-col gap-1.5 p-2">
                  {ids.map((id) => {
                    const m = byId.get(id)!;
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-lg border border-white/[.05] bg-[#1A2130] px-2.5 py-2">
                        <span className="flex-1 text-[12.5px] font-semibold">{m.name}</span>
                        <span className="font-mono text-[11px] text-[#8A94A6]">{m.elo}</span>
                        <button onClick={() => removeFrom(team, id)} className="text-[13px] text-[#5C6577]">
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {ids.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/[.09] text-[11.5px] text-[#5C6577]">
                      왼쪽 목록에서 {team === "blue" ? "블루" : "레드"} 추가
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="border-b border-white/[.06] px-4 py-3.5">
          <h2 className="m-0 text-[13px] font-bold">저장 전 미리보기</h2>
          <span className="text-[10.5px] text-[#6E7889]">
            {preview ? "Elo K=32 · 팀 평균 기준" : "승리 팀 선택 시 계산"}
          </span>
        </div>
        <div className="flex flex-col">
          {preview ? (
            [...preview.blueRows, ...preview.redRows].map((row) => (
              <div key={row.id} className="flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5">
                <span className="flex-1 truncate text-xs font-semibold">{row.name}</span>
                <span className="font-mono text-[11px] text-[#6E7889]">{row.elo}</span>
                <span className="text-[10px] text-[#4E576A]">→</span>
                <span className="w-9 text-right font-mono text-xs font-bold">{row.after}</span>
                <span className={`w-9 text-right font-mono text-[11px] font-bold ${row.delta > 0 ? "text-[#9BD173]" : "text-[#EE8B8B]"}`}>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-7 text-center text-[11.5px] leading-relaxed text-[#5C6577]">
              양 팀에 참가자를 넣고
              <br />
              승리 팀을 선택하면
              <br />
              예상 ELO 변동이 표시됩니다.
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-white/[.06] p-4">
          <button
            disabled={!canSave}
            className={`w-full rounded-lg py-2.5 text-[13px] font-extrabold ${
              canSave ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            결과 저장 · ELO 반영
          </button>
          {savedMessage && (
            <div className="rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[11px] leading-relaxed text-[#9BD173]">
              {savedMessage}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/app/matches/page.tsx`**

```tsx
import { AppShell } from "@/components/AppShell";
import { MatchBuilder } from "@/components/MatchBuilder";
import { getLinkedMembers } from "@/lib/queries/linked-members";

export default async function MatchesPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell activeNav="matches" pageTitle="게임 결과 입력" pageDesc="내전 결과 기록 및 ELO 재계산">
      <div className="px-7 pb-10 pt-6">
        <MatchBuilder pool={pool} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Manually verify the builder UI (save button intentionally still disabled-only, wired in Task 14)**

Run: `npm run dev --workspace=dashboard`, visit `/matches`.
- Confirm the pool lists only the 5 fully-linked seeded members (half members are excluded).
- Add 2 to blue, 2 to red, click "승리" on blue — expect the preview panel to populate with before/after ELO and colored deltas, and the save button to become enabled (though it doesn't persist yet).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/linked-members.ts apps/dashboard/components/MatchBuilder.tsx apps/dashboard/app/matches/page.tsx
git commit -m "feat(dashboard): add match builder UI with live ELO preview"
```

---

### Task 13: Match result save mutation

**Files:**
- Create: `apps/dashboard/lib/mutations/save-game-result.ts`
- Create: `apps/dashboard/lib/mutations/save-game-result.test.ts`

**Interfaces:**
- Consumes: `calculateTeamEloChange` from `@lolpamin/core` (Task 4).
- Produces: `saveGameResult(prisma: PrismaClient, input: SaveGameResultInput): Promise<SaveGameResultOutput>` where
  `SaveGameResultInput = { playedAt: Date; blueMemberIds: string[]; redMemberIds: string[]; winner: "BLUE" | "RED" }`
  `SaveGameResultOutput = { gameResultId: string; updates: Array<{ memberId: string; eloBefore: number; eloAfter: number }> }` — used by the server action in Task 14.

- [ ] **Step 1: Write the failing integration test — `apps/dashboard/lib/mutations/save-game-result.test.ts`**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLinkedMember(elo: number) {
  return prisma.member.create({
    data: { discordUserId: `d-${elo}-${Math.random()}`, kakaoUserId: `k-${elo}-${Math.random()}`, elo },
  });
}

describe("saveGameResult", () => {
  it("updates each participant's elo and records a GameResult with participants", async () => {
    const blue1 = await createLinkedMember(1500);
    const blue2 = await createLinkedMember(1500);
    const red1 = await createLinkedMember(1500);
    const red2 = await createLinkedMember(1500);

    const result = await saveGameResult(prisma, {
      playedAt: new Date("2026-08-23T12:00:00Z"),
      blueMemberIds: [blue1.id, blue2.id],
      redMemberIds: [red1.id, red2.id],
      winner: "BLUE",
    });

    expect(result.updates).toHaveLength(4);
    const blueUpdate = result.updates.find((u) => u.memberId === blue1.id)!;
    expect(blueUpdate.eloBefore).toBe(1500);
    expect(blueUpdate.eloAfter).toBe(1516);

    const refreshed = await prisma.member.findUniqueOrThrow({ where: { id: blue1.id } });
    expect(refreshed.elo).toBe(1516);

    const participants = await prisma.gameParticipant.findMany({ where: { gameResultId: result.gameResultId } });
    expect(participants).toHaveLength(4);
  });

  it("rejects a participant who is not fully linked", async () => {
    const halfMember = await prisma.member.create({ data: { discordUserId: "d-half" } });
    const red1 = await createLinkedMember(1500);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(),
        blueMemberIds: [halfMember.id],
        redMemberIds: [red1.id],
        winner: "RED",
      })
    ).rejects.toThrow("must be fully linked");
  });

  it("rejects a participant listed on both teams", async () => {
    const dup = await createLinkedMember(1500);
    const red1 = await createLinkedMember(1500);

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(),
        blueMemberIds: [dup.id],
        redMemberIds: [dup.id, red1.id],
        winner: "BLUE",
      })
    ).rejects.toThrow("cannot be on both teams");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST=postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test npx vitest run --root apps/dashboard lib/mutations/save-game-result.test.ts`
Expected: FAIL — `Cannot find module './save-game-result'`

- [ ] **Step 3: Create `apps/dashboard/lib/mutations/save-game-result.ts`**

```typescript
import type { PrismaClient, Team } from "@lolpamin/db";
import { calculateTeamEloChange } from "@lolpamin/core";

export interface SaveGameResultInput {
  playedAt: Date;
  blueMemberIds: string[];
  redMemberIds: string[];
  winner: "BLUE" | "RED";
}

export interface SaveGameResultOutput {
  gameResultId: string;
  updates: Array<{ memberId: string; eloBefore: number; eloAfter: number }>;
}

export async function saveGameResult(
  prisma: PrismaClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  const { playedAt, blueMemberIds, redMemberIds, winner } = input;

  const overlap = blueMemberIds.filter((id) => redMemberIds.includes(id));
  if (overlap.length > 0) {
    throw new Error("A participant cannot be on both teams");
  }

  return prisma.$transaction(async (tx) => {
    const allIds = [...blueMemberIds, ...redMemberIds];
    const members = await tx.member.findMany({ where: { id: { in: allIds } } });

    if (members.length !== allIds.length) {
      throw new Error("One or more participants do not exist");
    }
    for (const member of members) {
      if (!member.discordUserId || !member.kakaoUserId) {
        throw new Error(`Participant ${member.id} must be fully linked to play in a match`);
      }
    }

    const byId = new Map(members.map((m) => [m.id, m]));
    const { blueDelta, redDelta } = calculateTeamEloChange({
      blueRatings: blueMemberIds.map((id) => byId.get(id)!.elo),
      redRatings: redMemberIds.map((id) => byId.get(id)!.elo),
      winner,
    });

    const gameResult = await tx.gameResult.create({
      data: { playedAt, winner: winner as Team },
    });

    const updates: SaveGameResultOutput["updates"] = [];

    for (const [team, ids, delta] of [
      ["BLUE", blueMemberIds, blueDelta],
      ["RED", redMemberIds, redDelta],
    ] as const) {
      for (const memberId of ids) {
        const eloBefore = byId.get(memberId)!.elo;
        const eloAfter = eloBefore + delta;
        await tx.gameParticipant.create({
          data: { gameResultId: gameResult.id, memberId, team: team as Team, eloBefore, eloAfter },
        });
        await tx.member.update({ where: { id: memberId }, data: { elo: eloAfter } });
        updates.push({ memberId, eloBefore, eloAfter });
      }
    }

    return { gameResultId: gameResult.id, updates };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST=postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test npx vitest run --root apps/dashboard lib/mutations/save-game-result.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/mutations/save-game-result.ts apps/dashboard/lib/mutations/save-game-result.test.ts
git commit -m "feat(dashboard): add save-game-result mutation with elo recalculation"
```

---

### Task 14: Wire match builder save button to the mutation

**Files:**
- Create: `apps/dashboard/app/matches/actions.ts`
- Modify: `apps/dashboard/components/MatchBuilder.tsx`

**Interfaces:**
- Consumes: `saveGameResult` (Task 13).
- Produces: `saveGameResultAction(input): Promise<{ updates: Array<{ memberId: string; eloAfter: number }> }>` consumed only by `MatchBuilder`.

- [ ] **Step 1: Create `apps/dashboard/app/matches/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { saveGameResult, type SaveGameResultInput } from "@/lib/mutations/save-game-result";

export async function saveGameResultAction(input: SaveGameResultInput) {
  const result = await saveGameResult(prisma, input);
  revalidatePath("/matches");
  revalidatePath("/members");
  return result;
}
```

- [ ] **Step 2: Modify `apps/dashboard/components/MatchBuilder.tsx`**

Add the import at the top:

```tsx
import { saveGameResultAction } from "@/app/matches/actions";
```

Replace the `<button disabled={!canSave} ...>` block's `onClick`-less button with a handler, and add an `isSaving` state. Replace:

```tsx
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
```

with:

```tsx
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!canSave || !winner) return;
    setIsSaving(true);
    try {
      const result = await saveGameResultAction({
        playedAt: new Date(),
        blueMemberIds: blueIds,
        redMemberIds: redIds,
        winner,
      });
      setSavedMessage(`저장됨 · ${result.updates.length}명의 ELO가 재계산되었습니다.`);
      setBlueIds([]);
      setRedIds([]);
      setWinner(null);
    } finally {
      setIsSaving(false);
    }
  }
```

Then replace:

```tsx
          <button
            disabled={!canSave}
            className={`w-full rounded-lg py-2.5 text-[13px] font-extrabold ${
              canSave ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            결과 저장 · ELO 반영
          </button>
```

with:

```tsx
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className={`w-full rounded-lg py-2.5 text-[13px] font-extrabold ${
              canSave && !isSaving ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            결과 저장 · ELO 반영
          </button>
```

- [ ] **Step 3: Manually verify save persists**

Run: `npm run dev --workspace=dashboard`, visit `/matches`.
- Build two teams, pick a winner, click save — expect the success message with the correct participant count.
- Visit `/members` — expect the participants' ELO values to reflect the new totals.
- Revisit `/matches` — expect the builder to have reset (empty teams, no winner selected).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/matches/actions.ts apps/dashboard/components/MatchBuilder.tsx
git commit -m "feat(dashboard): wire match builder save button to the elo mutation"
```

---

### Task 15: Inactive report page

**Files:**
- Create: `apps/dashboard/lib/queries/inactive.ts`
- Create: `apps/dashboard/components/InactiveTable.tsx`
- Create: `apps/dashboard/app/inactive/page.tsx`

**Interfaces:**
- Consumes: `getInactiveMembers`, `LONG_INACTIVITY_THRESHOLD_DAYS` from `@lolpamin/core` (Task 6).
- Produces: nothing consumed elsewhere — this is a leaf page.

- [ ] **Step 1: Create `apps/dashboard/lib/queries/inactive.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import { getInactiveMembers, LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export interface InactiveRow {
  id: string;
  name: string;
  kakaoNickname: string;
  daysSinceActive: number;
  lastActiveDate: string;
  elo: number;
  gameCount: number;
}

export interface InactiveReportData {
  rows: InactiveRow[];
  totalInactive: number;
  longInactiveCount: number;
  ratioLabel: string;
}

export async function getInactiveReportData(): Promise<InactiveReportData> {
  const now = new Date();
  const members = await prisma.member.findMany({
    include: { _count: { select: { participants: true } } },
  });

  const inactive = getInactiveMembers(
    members.map((m) => ({
      id: m.id,
      kakaoUserId: m.kakaoUserId,
      lastActiveAt: m.lastActiveAt,
      createdAt: m.createdAt,
    })),
    now
  );

  const byId = new Map(members.map((m) => [m.id, m]));

  const rows: InactiveRow[] = inactive.map(({ id, daysSinceActive }) => {
    const m = byId.get(id)!;
    const lastActiveDate = new Date(now.getTime() - daysSinceActive * 86_400_000);
    return {
      id,
      name: m.realName ?? m.discordHandle ?? "이름 미확인",
      kakaoNickname: m.kakaoNickname ?? "카톡 미연결",
      daysSinceActive,
      lastActiveDate: lastActiveDate.toISOString().slice(0, 10),
      elo: m.elo,
      gameCount: m._count.participants,
    };
  });

  const totalMembers = members.length || 1;

  return {
    rows,
    totalInactive: rows.length,
    longInactiveCount: rows.filter((r) => r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS).length,
    ratioLabel: `${Math.round((rows.length / totalMembers) * 100)}%`,
  };
}
```

- [ ] **Step 2: Create `apps/dashboard/components/InactiveTable.tsx`**

```tsx
import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export function InactiveTable({ rows }: { rows: InactiveRow[] }) {
  const maxDays = Math.max(60, ...rows.map((r) => r.daysSinceActive));

  return (
    <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-4.5 py-3">
        <h2 className="m-0 text-[13.5px] font-bold">미활동 회원 · 경과일 순</h2>
        <span className="text-[11px] text-[#6E7889]">카카오톡 오픈채팅 @멘션 수집 기준</span>
      </div>
      <div className="grid grid-cols-[170px_150px_1fr_110px_130px] border-b border-white/[.06] bg-[#12161F] px-4.5 py-2.5 text-[10.5px] font-bold text-[#6E7889]">
        <div>실명</div>
        <div>카톡 닉네임</div>
        <div>경과일</div>
        <div className="text-right">마지막 활동</div>
        <div className="text-right">ELO / 최근 내전</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[170px_150px_1fr_110px_130px] items-center border-b border-white/[.04] px-4.5 py-3 hover:bg-[#181E29]">
          <div className="text-[12.5px] font-semibold">{r.name}</div>
          <div className="text-xs text-[#8A94A6]">{r.kakaoNickname}</div>
          <div className="flex items-center gap-2.5 pr-6">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1E2534]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((r.daysSinceActive / maxDays) * 100))}%`,
                  background: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C",
                }}
              />
            </div>
            <span
              className="w-14 text-right font-mono text-[13px] font-bold"
              style={{ color: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "#EE8B8B" : "#F2985C" }}
            >
              {r.daysSinceActive}일
            </span>
          </div>
          <div className="text-right font-mono text-[11.5px] text-[#7A8496]">{r.lastActiveDate}</div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-xs font-bold">{r.elo}</span>
            <span className="text-[10.5px] text-[#6E7889]">내전 {r.gameCount}회</span>
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Create `apps/dashboard/app/inactive/page.tsx`**

```tsx
import { AppShell } from "@/components/AppShell";
import { InactiveTable } from "@/components/InactiveTable";
import { getInactiveReportData } from "@/lib/queries/inactive";

export default async function InactivePage() {
  const data = await getInactiveReportData();

  return (
    <AppShell activeNav="inactive" pageTitle="미활동자 리포트" pageDesc="최근 2주간 카톡방 멘션 없는 회원">
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="flex items-stretch gap-3">
          <div className="flex flex-1 items-center gap-4.5 rounded-xl border border-[#ED7D31]/25 bg-[#151A24] px-4.5 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#7A8496]">2주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-[#F2985C]">
                {data.totalInactive}
                <span className="ml-1 text-sm font-medium text-[#7A8496]">명</span>
              </span>
            </div>
            <div className="w-px self-stretch bg-white/[.07]" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#7A8496]">30일 이상</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-[#EE8B8B]">
                {data.longInactiveCount}
                <span className="ml-1 text-sm font-medium text-[#7A8496]">명</span>
              </span>
            </div>
            <div className="w-px self-stretch bg-white/[.07]" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#7A8496]">전체 회원 중 비율</span>
              <span className="font-mono text-[30px] font-bold tracking-tight">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-[300px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] px-4 py-3.5">
            <div className="text-[11.5px] font-bold text-[#B7C0D0]">확인용 화면입니다</div>
            <div className="text-[10.5px] leading-relaxed text-[#6E7889]">
              자동 발송이나 강제 탈퇴 기능은 없습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Manually verify against seeded data**

Run: `npm run dev --workspace=dashboard`, visit `/inactive`.
Expected: 배성민 (33일) and 신유진 (17일) appear, sorted longest-first; 배성민's bar is red (>=30일), 신유진's is orange.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/inactive.ts apps/dashboard/components/InactiveTable.tsx apps/dashboard/app/inactive/page.tsx
git commit -m "feat(dashboard): add inactivity report page"
```

---

### Task 16: Sidebar badge wiring and final manual QA

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `getInactiveMembers` from `@lolpamin/core` (Task 6) — replaces the placeholder count from Task 7's `AppShell` with the real threshold-based count so it matches `/inactive`'s number exactly.

- [ ] **Step 1: Replace the placeholder badge count in `AppShell.tsx`**

Replace:

```tsx
  const [totalCount, inactiveNavCount] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { kakaoUserId: { not: null } } }),
  ]);
```

with:

```tsx
  const [totalCount, allMembersForInactivity] = await Promise.all([
    prisma.member.count(),
    prisma.member.findMany({ select: { id: true, kakaoUserId: true, lastActiveAt: true, createdAt: true } }),
  ]);
  const inactiveNavCount = getInactiveMembers(allMembersForInactivity, new Date()).length;
```

Add the import at the top:

```tsx
import { getInactiveMembers } from "@lolpamin/core";
```

- [ ] **Step 2: Verify the badge matches the report page**

Run: `npm run dev --workspace=dashboard`, visit any page.
Expected: the "미활동 리포트" nav badge reads `2` (배성민 + 신유진 from the seed), matching `/inactive`'s "2주 이상 카톡방 멘션 없음" count exactly.

- [ ] **Step 3: Run the full automated suite**

Run: `npm run test --workspace=@lolpamin/core`
Expected: PASS (12 tests)

Run: `DATABASE_URL_TEST=postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test npx vitest run --root apps/dashboard`
Expected: PASS (6 tests)

- [ ] **Step 4: Manual QA checklist (per spec, this replaces automated UI/E2E tests)**

Walk through and confirm each:
- [ ] `/members`: stats match seeded data; "미연결만" and "미활동만" filters work; search works; account linking merges two rows into one and updates the "미배정 계정"/"미연결(반쪽) 회원" stats.
- [ ] `/matches`: only fully-linked members appear in the pool; adding the same member to both teams is impossible (button disabled via `usedIds`); ELO preview matches `packages/core`'s tested formula; saving persists and reflects on `/members`.
- [ ] `/inactive`: matches the sidebar badge count; 30+ day members are visually distinct (red vs orange bar).
- [ ] No console errors in the browser dev tools on any of the three pages.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/AppShell.tsx
git commit -m "fix(dashboard): use the shared inactivity threshold for the sidebar badge"
```
