# Kakao Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/kakao-bot`, a read-only KakaoTalk open-chatroom bot that watches one specific open chatroom, parses `@멘션`s out of incoming messages, and records member activity (`MentionLog` + `Member.lastActiveAt`) in the shared `@lolpamin/db` database — no message sending, no ELO logic.

**Architecture:** A single always-on Node process using `node-kakao` (an unofficial, reverse-engineered client for KakaoTalk's internal Loco protocol — there is no official API for reading open-chatroom messages). It authenticates once with email/password + a registered device UUID, then listens for the client's `'chat'` event and filters to the one configured open chatroom. Mention-parsing and DB-writing logic lives in small, framework-free `lib/*.ts` functions that take plain data and return plain data or write via `PrismaClient`; `index.ts` is a thin adapter that wires the `node-kakao` event to those functions and handles reconnect-with-backoff. Two one-off interactive scripts (`register-device.ts`, `list-channels.ts`) handle the manual, human-in-the-loop setup steps KakaoTalk's protocol requires (new-device passcode verification, discovering the target room's numeric ID) — these mirror `apps/discord-bot/src/deploy-commands.ts`'s role as an operational script outside the main process.

**Tech Stack:** `node-kakao` v4.5.0, TypeScript, `@lolpamin/db` (existing Prisma client), `tsx` (dev/run), Vitest (unit tests for pure `lib/*.ts` logic, integration tests for the one DB-writing `lib/*.ts` function).

**Spec:** `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md`

## Global Constraints

- kakao-bot is **read-only towards KakaoTalk**: it only subscribes to message events and never calls `channel.sendChat(...)` or any other write/send API — per the spec's "메시지 전송 없이 읽기 전용으로만 사용" constraint. This also minimizes the unofficial protocol's account-restriction risk.
- kakao-bot only monitors **one specific open chatroom**, identified by `KAKAO_OPEN_CHATROOM_ID` (the room's numeric `channelId`, discovered via Task 6's `list-channels` script). `'chat'` events from any other channel the bot's account happens to be in are ignored.
- kakao-bot **never touches `Member.elo`** and has no ELO calculation logic — ELO is computed and stored by the dashboard (`packages/core` + `apps/dashboard`), per the spec's component-responsibility section.
- A first-seen mentioned `kakaoUserId` auto-creates a half-record `Member` (only `kakaoUserId` and `lastActiveAt` set) — per the spec's "신규 회원 유입" data flow. The admin links it to a Discord account later via the dashboard.
- On disconnect, the client must attempt to reconnect with exponential backoff (base 1s, capped at 5 minutes) — per the spec's error-handling section ("잦은 재연결 시도에는 백오프를 적용한다"). This is in addition to (not instead of) process-level supervision (pm2) for hard crashes.
- No automated tests for `node-kakao`-specific code (login flow, event wiring, reconnect scheduling itself) — only `lib/*.ts` functions get tests. Pure functions (`extract-mentions.ts`, `compute-reconnect-delay.ts`) get plain unit tests; the one DB-writing function (`record-member-activity.ts`) gets an integration test against a real Postgres test database, matching the established pattern in `apps/discord-bot/src/lib/*.test.ts` — including that pattern's safety fix of refusing to run if `DATABASE_URL_TEST` is unset (never silently falling back to `DATABASE_URL` and wiping real data).
- Required env vars (add to the repo-root `.env` and `.env.example`, not committed): `KAKAO_EMAIL`, `KAKAO_PASSWORD`, `KAKAO_DEVICE_NAME`, `KAKAO_DEVICE_UUID`, `KAKAO_OPEN_CHATROOM_ID`, plus the existing `DATABASE_URL`/`DATABASE_URL_TEST`.
- `KAKAO_DEVICE_UUID` must be generated **once** and then reused for every future login (Task 5's `register-device` script prints the value to save). Logging in with a different or unregistered device UUID re-triggers KakaoTalk's new-device passcode verification.
- `node-kakao` ships as CommonJS (`"main": "./dist/index.js"`, no `"type": "module"`); with `esModuleInterop` already enabled in `tsconfig.base.json`, plain named imports (`import { TalkClient } from "node-kakao"`) work the same way they already do for `discord.js` in `apps/discord-bot`.

---

## File Structure

```
apps/kakao-bot/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                          # client bootstrap: login, chat-event dispatch, reconnect-with-backoff
    register-device.ts                # one-off interactive script: registers this machine's device via KakaoTalk passcode verification
    list-channels.ts                  # one-off script: lists joined channels' ids + names, to find KAKAO_OPEN_CHATROOM_ID
    lib/
      extract-mentions.ts
      extract-mentions.test.ts
      compute-reconnect-delay.ts
      compute-reconnect-delay.test.ts
      record-member-activity.ts
      record-member-activity.test.ts
```

---

### Task 1: `apps/kakao-bot` scaffold

**Files:**
- Create: `apps/kakao-bot/package.json`
- Create: `apps/kakao-bot/tsconfig.json`
- Create: `apps/kakao-bot/vitest.config.ts`
- Create: `apps/kakao-bot/src/index.ts` (placeholder that verifies env vars, expanded in Task 7)
- Modify: `.env.example` (repo root)

**Interfaces:**
- Consumes: `prisma` from `@lolpamin/db` (already exists), `node-kakao` package.
- Produces: a package that later tasks add lib functions and scripts into; a working `npm run dev --workspace=kakao-bot` command.

- [ ] **Step 1: Create `apps/kakao-bot/package.json`**

```json
{
  "name": "kakao-bot",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx --env-file=../../.env --watch src/index.ts",
    "start": "tsx --env-file=../../.env src/index.ts",
    "register-device": "tsx --env-file=../../.env src/register-device.ts",
    "list-channels": "tsx --env-file=../../.env src/list-channels.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lolpamin/db": "*",
    "node-kakao": "^4.5.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/kakao-bot/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/kakao-bot/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // record-member-activity.test.ts shares one real Postgres test database
    // (DATABASE_URL_TEST) and resets it in beforeEach — running test files
    // in parallel would race that reset against other files' inserts (see
    // apps/discord-bot/vitest.config.ts for the same issue).
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Create a placeholder `apps/kakao-bot/src/index.ts`**

```typescript
const REQUIRED_ENV_VARS = [
  "KAKAO_EMAIL",
  "KAKAO_PASSWORD",
  "KAKAO_DEVICE_NAME",
  "KAKAO_DEVICE_UUID",
  "KAKAO_OPEN_CHATROOM_ID",
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

console.log("Env vars loaded OK. Client bootstrap comes in a later task.");
```

- [ ] **Step 5: Add the new env vars to `.env.example`**

Append to the repo-root `.env.example`:

```
# Kakao bot (apps/kakao-bot) — read-only open-chatroom watcher.
# KAKAO_DEVICE_UUID: generate once via `npm run register-device --workspace=kakao-bot`, then reuse forever.
# KAKAO_OPEN_CHATROOM_ID: find via `npm run list-channels --workspace=kakao-bot` after registering the device.
KAKAO_EMAIL=""
KAKAO_PASSWORD=""
KAKAO_DEVICE_NAME=""
KAKAO_DEVICE_UUID=""
KAKAO_OPEN_CHATROOM_ID=""
```

- [ ] **Step 6: Install dependencies and verify env vars load**

Run: `npm install`
Run: `npm run dev --workspace=kakao-bot`
Expected: prints `Env vars loaded OK. Client bootstrap comes in a later task.` and exits (nothing is watching yet since there's no long-running client). If it throws `Missing required env var`, double check `.env` at the repo root has all five `KAKAO_*` values set (dummy values are fine for now — real credentials aren't needed until Task 8).

- [ ] **Step 7: Commit**

```bash
git add apps/kakao-bot/package.json apps/kakao-bot/tsconfig.json apps/kakao-bot/vitest.config.ts apps/kakao-bot/src/index.ts .env.example package.json package-lock.json
git commit -m "chore(kakao-bot): scaffold app and verify env vars load"
```

---

### Task 2: `lib/extract-mentions.ts`

**Files:**
- Create: `apps/kakao-bot/src/lib/extract-mentions.ts`
- Create: `apps/kakao-bot/src/lib/extract-mentions.test.ts`

**Interfaces:**
- Consumes: nothing external. `RawMention.user_id` is typed loosely (`string | number | { toString(): string }`) so it accepts both plain test fixtures and `node-kakao`'s real `MentionStruct.user_id` (a `bson.Long`).
- Produces: `RawMention` type and `extractMentionedKakaoUserIds(mentions: RawMention[]): string[]` (deduplicated, first-occurrence order) — used by `index.ts` (Task 7).

- [ ] **Step 1: Write the failing unit test**

```typescript
import { describe, expect, it } from "vitest";
import { extractMentionedKakaoUserIds } from "./extract-mentions";

describe("extractMentionedKakaoUserIds", () => {
  it("returns an empty array when there are no mentions", () => {
    expect(extractMentionedKakaoUserIds([])).toEqual([]);
  });

  it("returns the stringified user id for a single mention", () => {
    const result = extractMentionedKakaoUserIds([{ user_id: "12345" }]);
    expect(result).toEqual(["12345"]);
  });

  it("stringifies non-string user ids (e.g. bson.Long-like objects)", () => {
    const longLike = { toString: () => "98765" };
    const result = extractMentionedKakaoUserIds([{ user_id: longLike }]);
    expect(result).toEqual(["98765"]);
  });

  it("preserves first-occurrence order across distinct mentions", () => {
    const result = extractMentionedKakaoUserIds([{ user_id: "a" }, { user_id: "b" }]);
    expect(result).toEqual(["a", "b"]);
  });

  it("deduplicates repeated mentions of the same user in one message", () => {
    const result = extractMentionedKakaoUserIds([
      { user_id: "a" },
      { user_id: "a" },
      { user_id: "b" },
    ]);
    expect(result).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --root apps/kakao-bot src/lib/extract-mentions.test.ts`
Expected: FAIL — `Cannot find module './extract-mentions'`

- [ ] **Step 3: Write the implementation**

```typescript
export interface RawMention {
  user_id: string | number | { toString(): string };
}

export function extractMentionedKakaoUserIds(mentions: RawMention[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const mention of mentions) {
    const kakaoUserId = String(mention.user_id);
    if (seen.has(kakaoUserId)) continue;
    seen.add(kakaoUserId);
    result.push(kakaoUserId);
  }

  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root apps/kakao-bot src/lib/extract-mentions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/kakao-bot/src/lib/extract-mentions.ts apps/kakao-bot/src/lib/extract-mentions.test.ts
git commit -m "feat(kakao-bot): add extractMentionedKakaoUserIds parser"
```

---

### Task 3: `lib/compute-reconnect-delay.ts`

**Files:**
- Create: `apps/kakao-bot/src/lib/compute-reconnect-delay.ts`
- Create: `apps/kakao-bot/src/lib/compute-reconnect-delay.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `computeReconnectDelayMs(attempt: number): number` (0-indexed attempt count) — used by `index.ts` (Task 7) to schedule reconnects after a `'disconnected'` event.

- [ ] **Step 1: Write the failing unit test**

```typescript
import { describe, expect, it } from "vitest";
import { computeReconnectDelayMs } from "./compute-reconnect-delay";

describe("computeReconnectDelayMs", () => {
  it("returns the base delay (1s) for the first attempt", () => {
    expect(computeReconnectDelayMs(0)).toBe(1000);
  });

  it("doubles the delay for each subsequent attempt", () => {
    expect(computeReconnectDelayMs(1)).toBe(2000);
    expect(computeReconnectDelayMs(2)).toBe(4000);
    expect(computeReconnectDelayMs(3)).toBe(8000);
  });

  it("caps the delay at 5 minutes", () => {
    expect(computeReconnectDelayMs(10)).toBe(300_000);
    expect(computeReconnectDelayMs(100)).toBe(300_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --root apps/kakao-bot src/lib/compute-reconnect-delay.test.ts`
Expected: FAIL — `Cannot find module './compute-reconnect-delay'`

- [ ] **Step 3: Write the implementation**

```typescript
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;

export function computeReconnectDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root apps/kakao-bot src/lib/compute-reconnect-delay.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/kakao-bot/src/lib/compute-reconnect-delay.ts apps/kakao-bot/src/lib/compute-reconnect-delay.test.ts
git commit -m "feat(kakao-bot): add computeReconnectDelayMs backoff helper"
```

---

### Task 4: `lib/record-member-activity.ts`

**Files:**
- Create: `apps/kakao-bot/src/lib/record-member-activity.ts`
- Create: `apps/kakao-bot/src/lib/record-member-activity.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` from `@lolpamin/db`.
- Produces: `recordMemberActivity(prisma: PrismaClient, params: { kakaoUserId: string; mentionedAt: Date; rawMessage: string | null }): Promise<void>` — used by `index.ts` (Task 7).

- [ ] **Step 1: Write the failing integration test**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { recordMemberActivity } from "./record-member-activity";

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

describe("recordMemberActivity", () => {
  it("creates a half-record Member when the kakaoUserId is new", async () => {
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-999", mentionedAt, rawMessage: "@새회원 안녕" });

    const member = await prisma.member.findUnique({ where: { kakaoUserId: "k-999" } });
    expect(member).not.toBeNull();
    expect(member?.discordUserId).toBeNull();
    expect(member?.elo).toBe(1000);
    expect(member?.lastActiveAt).toEqual(mentionedAt);
  });

  it("updates lastActiveAt on an existing member without touching other fields", async () => {
    const existing = await prisma.member.create({
      data: { kakaoUserId: "k-1", realName: "김도현", elo: 1482, lastActiveAt: new Date("2026-08-01T00:00:00Z") },
    });
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-1", mentionedAt, rawMessage: null });

    const updated = await prisma.member.findUnique({ where: { id: existing.id } });
    expect(updated?.lastActiveAt).toEqual(mentionedAt);
    expect(updated?.realName).toBe("김도현");
    expect(updated?.elo).toBe(1482);
  });

  it("inserts a MentionLog row linked to the member", async () => {
    const mentionedAt = new Date("2026-08-24T12:00:00Z");

    await recordMemberActivity(prisma, { kakaoUserId: "k-2", mentionedAt, rawMessage: "@멘션됨 테스트 메시지" });

    const member = await prisma.member.findUnique({ where: { kakaoUserId: "k-2" } });
    const logs = await prisma.mentionLog.findMany({ where: { memberId: member?.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].mentionedAt).toEqual(mentionedAt);
    expect(logs[0].rawMessage).toBe("@멘션됨 테스트 메시지");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/kakao-bot src/lib/record-member-activity.test.ts`
Expected: FAIL — `Cannot find module './record-member-activity'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@lolpamin/db";

export interface RecordMemberActivityParams {
  kakaoUserId: string;
  mentionedAt: Date;
  rawMessage: string | null;
}

export async function recordMemberActivity(
  prisma: PrismaClient,
  params: RecordMemberActivityParams
): Promise<void> {
  const member = await prisma.member.upsert({
    where: { kakaoUserId: params.kakaoUserId },
    create: { kakaoUserId: params.kakaoUserId, lastActiveAt: params.mentionedAt },
    update: { lastActiveAt: params.mentionedAt },
  });

  await prisma.mentionLog.create({
    data: {
      memberId: member.id,
      mentionedAt: params.mentionedAt,
      rawMessage: params.rawMessage,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/kakao-bot src/lib/record-member-activity.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/kakao-bot/src/lib/record-member-activity.ts apps/kakao-bot/src/lib/record-member-activity.test.ts
git commit -m "feat(kakao-bot): add recordMemberActivity upsert-and-log"
```

---

### Task 5: `register-device.ts` — one-off device registration script

**Files:**
- Create: `apps/kakao-bot/src/register-device.ts`

**Interfaces:**
- Consumes: `AuthApiClient`, `KnownAuthStatusCode`, `util` from `node-kakao`; `KAKAO_EMAIL`, `KAKAO_PASSWORD`, `KAKAO_DEVICE_NAME` env vars (`KAKAO_DEVICE_UUID` is optional input — generated if absent).
- Produces: nothing consumed by other tasks — this is a one-off operational script the admin runs once per machine, before Task 7's bot can log in from that machine. Prints the `KAKAO_DEVICE_UUID` value to save into `.env`.

No automated test here per the Global Constraints — this script requires a human to read a passcode KakaoTalk sends to the account and type it in interactively; it cannot run unattended or in CI.

- [ ] **Step 1: Create `apps/kakao-bot/src/register-device.ts`**

```typescript
import * as readline from "node:readline";
import { AuthApiClient, KnownAuthStatusCode, util } from "node-kakao";

const REQUIRED_ENV_VARS = ["KAKAO_EMAIL", "KAKAO_PASSWORD", "KAKAO_DEVICE_NAME"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

async function main() {
  const deviceUUID = process.env.KAKAO_DEVICE_UUID || util.randomWin32DeviceUUID();
  const form = {
    email: process.env.KAKAO_EMAIL!,
    password: process.env.KAKAO_PASSWORD!,
  };

  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, deviceUUID);

  const loginRes = await api.login(form, true);
  if (loginRes.success) {
    console.log("This device is already registered. Save this KAKAO_DEVICE_UUID to .env:");
    console.log(deviceUUID);
    return;
  }
  if (loginRes.status !== KnownAuthStatusCode.DEVICE_NOT_REGISTERED) {
    throw new Error(`Login failed with status: ${loginRes.status}`);
  }

  const passcodeRes = await api.requestPasscode(form);
  if (!passcodeRes.success) {
    throw new Error(`Passcode request failed with status: ${passcodeRes.status}`);
  }

  const inputInterface = readline.createInterface({ input: process.stdin, output: process.stdout });
  const passcode = await new Promise<string>((resolve) =>
    inputInterface.question("Enter the passcode KakaoTalk sent you: ", resolve)
  );
  inputInterface.close();

  const registerRes = await api.registerDevice(form, passcode, true);
  if (!registerRes.success) {
    throw new Error(`Device registration failed with status: ${registerRes.status}`);
  }

  console.log("Device registered successfully. Save this KAKAO_DEVICE_UUID to .env:");
  console.log(deviceUUID);
}

main().catch((error) => {
  console.error("Device registration failed:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project apps/kakao-bot/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kakao-bot/src/register-device.ts
git commit -m "feat(kakao-bot): add one-off device registration script"
```

---

### Task 6: `list-channels.ts` — one-off channel discovery script

**Files:**
- Create: `apps/kakao-bot/src/list-channels.ts`

**Interfaces:**
- Consumes: `AuthApiClient`, `TalkClient` from `node-kakao`; `KAKAO_EMAIL`, `KAKAO_PASSWORD`, `KAKAO_DEVICE_NAME`, `KAKAO_DEVICE_UUID` env vars (the device must already be registered via Task 5).
- Produces: nothing consumed by other tasks — prints each joined channel's `channelId` and display name so the admin can find the target open chatroom's ID for `KAKAO_OPEN_CHATROOM_ID`.

No automated test here — same reasoning as Task 5 (requires a real, already-registered KakaoTalk account and an active session).

- [ ] **Step 1: Create `apps/kakao-bot/src/list-channels.ts`**

```typescript
import { AuthApiClient, TalkClient } from "node-kakao";

const REQUIRED_ENV_VARS = ["KAKAO_EMAIL", "KAKAO_PASSWORD", "KAKAO_DEVICE_NAME", "KAKAO_DEVICE_UUID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

async function main() {
  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, process.env.KAKAO_DEVICE_UUID!);
  const loginRes = await api.login({
    email: process.env.KAKAO_EMAIL!,
    password: process.env.KAKAO_PASSWORD!,
    forced: true,
  });
  if (!loginRes.success) throw new Error(`Login failed with status: ${loginRes.status}`);

  const client = new TalkClient();
  const res = await client.login(loginRes.result);
  if (!res.success) throw new Error(`TalkClient login failed with status: ${res.status}`);

  console.log("Joined channels (channelId  displayName):");
  for (const channel of client.channelList.all()) {
    console.log(`${channel.channelId.toString()}  ${channel.getDisplayName()}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to list channels:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project apps/kakao-bot/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kakao-bot/src/list-channels.ts
git commit -m "feat(kakao-bot): add one-off channel discovery script"
```

---

### Task 7: Client bootstrap, chat dispatch, and reconnect-with-backoff

**Files:**
- Modify: `apps/kakao-bot/src/index.ts` (replace the Task 1 placeholder)

**Interfaces:**
- Consumes: `extractMentionedKakaoUserIds` (Task 2), `computeReconnectDelayMs` (Task 3), `recordMemberActivity` (Task 4), `prisma` from `@lolpamin/db`, `AuthApiClient`/`TalkClient` from `node-kakao`.
- Produces: a running `node-kakao` client that records activity from the configured open chatroom and reconnects on disconnect.

- [ ] **Step 1: Replace `apps/kakao-bot/src/index.ts`**

```typescript
import { AuthApiClient, TalkClient } from "node-kakao";
import { prisma } from "@lolpamin/db";
import { extractMentionedKakaoUserIds } from "./lib/extract-mentions";
import { computeReconnectDelayMs } from "./lib/compute-reconnect-delay";
import { recordMemberActivity } from "./lib/record-member-activity";

const REQUIRED_ENV_VARS = [
  "KAKAO_EMAIL",
  "KAKAO_PASSWORD",
  "KAKAO_DEVICE_NAME",
  "KAKAO_DEVICE_UUID",
  "KAKAO_OPEN_CHATROOM_ID",
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

let reconnectAttempt = 0;

async function connect(): Promise<void> {
  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, process.env.KAKAO_DEVICE_UUID!);
  const loginRes = await api.login({
    email: process.env.KAKAO_EMAIL!,
    password: process.env.KAKAO_PASSWORD!,
    forced: true,
  });
  if (!loginRes.success) {
    throw new Error(`Kakao login failed with status: ${loginRes.status}`);
  }

  const client = new TalkClient();
  const res = await client.login(loginRes.result);
  if (!res.success) {
    throw new Error(`TalkClient login failed with status: ${res.status}`);
  }

  await prisma.$connect();
  reconnectAttempt = 0;
  console.log("Kakao bot logged in and watching for mentions.");

  client.on("chat", async (data, channel) => {
    if (channel.channelId.toString() !== process.env.KAKAO_OPEN_CHATROOM_ID) return;

    const kakaoUserIds = extractMentionedKakaoUserIds(data.mentions);
    for (const kakaoUserId of kakaoUserIds) {
      try {
        await recordMemberActivity(prisma, {
          kakaoUserId,
          mentionedAt: data.sendAt,
          rawMessage: data.text || null,
        });
      } catch (error) {
        console.error(`Failed to record activity for ${kakaoUserId}:`, error);
      }
    }
  });

  client.on("disconnected", (reason) => {
    console.error(`Disconnected (reason: ${reason}). Scheduling reconnect.`);
    scheduleReconnect();
  });

  client.on("error", (error) => {
    console.error("Client error:", error);
  });
}

function scheduleReconnect(): void {
  const delayMs = computeReconnectDelayMs(reconnectAttempt);
  reconnectAttempt++;
  console.log(`Reconnecting in ${delayMs}ms (attempt ${reconnectAttempt}).`);
  setTimeout(() => {
    connect().catch((error) => {
      console.error("Reconnect attempt failed:", error);
      scheduleReconnect();
    });
  }, delayMs);
}

connect().catch((error) => {
  console.error("Initial connection failed:", error);
  scheduleReconnect();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project apps/kakao-bot/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kakao-bot/src/index.ts
git commit -m "feat(kakao-bot): add client bootstrap, chat dispatch, and reconnect backoff"
```

---

### Task 8: Manual smoke test against a real Kakao account and open chatroom

**Files:** none — verification only.

**Interfaces:** none — this task consumes everything built in Tasks 1–7 and produces nothing further.

- [ ] **Step 1: Register the bot's KakaoTalk account device**

Set `KAKAO_EMAIL`, `KAKAO_PASSWORD`, `KAKAO_DEVICE_NAME` (any label, e.g. `lolpamin-bot`) in `.env` with a real KakaoTalk account's credentials (a dedicated bot account is strongly recommended over a personal one — see the spec's account-restriction risk note).

Run: `npm run register-device --workspace=kakao-bot`
Expected: prompts for a passcode sent to the account, then prints `Device registered successfully. Save this KAKAO_DEVICE_UUID to .env:` followed by a UUID.

Copy that UUID into `.env` as `KAKAO_DEVICE_UUID`.

- [ ] **Step 2: Join the target open chatroom with the bot account**

Using the bot's KakaoTalk account (on a phone or PC client), join the open chatroom that should be monitored.

- [ ] **Step 3: Find the room's channel ID**

Run: `npm run list-channels --workspace=kakao-bot`
Expected: prints a list of `channelId  displayName` lines; find the line matching the target open chatroom's name.

Copy that `channelId` into `.env` as `KAKAO_OPEN_CHATROOM_ID`.

- [ ] **Step 4: Start the bot**

Run: `npm run dev --workspace=kakao-bot`
Expected: `Kakao bot logged in and watching for mentions.` printed within a few seconds, process keeps running (this is a long-running command — leave it running in this terminal for the rest of this task).

- [ ] **Step 5: Test a mention from an unseen kakaoUserId**

From a different account in the target open chatroom, send a message mentioning some member, e.g. `@홍길동 안녕하세요`.

Run (in another terminal): `docker compose exec postgres psql -U lolpamin -c "SELECT \"kakaoUserId\", \"lastActiveAt\" FROM \"Member\" ORDER BY \"createdAt\" DESC LIMIT 1;"`
Expected: a new row with a non-null `kakaoUserId` and a `lastActiveAt` matching roughly when the message was sent.

- [ ] **Step 6: Test a mention of an already-linked member**

Run: `npm run seed --workspace=@lolpamin/db` (if the dev database is empty) to get seeded members with `kakaoNickname` values, then note one member's `kakaoUserId` isn't set by the seed — the seed only sets `kakaoNickname`. Manually link one seeded member's `kakaoUserId` to a real account you control:

Run: `docker compose exec postgres psql -U lolpamin -c "UPDATE \"Member\" SET \"kakaoUserId\"='<your-real-kakao-user-id>' WHERE \"discordHandle\"='dohyun_kr';"`

(The real `kakaoUserId` for an account can be read from the `Member` row Step 5 just created, if you mention yourself, or from any `MentionLog`/`Member` row created by mentioning that account.)

Then mention that account again in the open chatroom and confirm (same query as Step 5, filtered `WHERE "discordHandle" = 'dohyun_kr'`) that `lastActiveAt` updated and `elo`/`realName` were left untouched.

- [ ] **Step 7: Check MentionLog rows accumulated**

Run: `docker compose exec postgres psql -U lolpamin -c "SELECT count(*) FROM \"MentionLog\";"`
Expected: a count matching the number of distinct mentioned users across Steps 5–6's test messages.

- [ ] **Step 8: Confirm messages from other channels are ignored**

If the bot account is in any other chatroom, send a message mentioning someone there.
Expected: no new `Member`/`MentionLog` rows are created from it (re-run Step 7's count query before and after to confirm it doesn't change).

- [ ] **Step 9: Stop the bot and confirm no errors were logged**

Press Ctrl+C in the terminal running `npm run dev --workspace=kakao-bot`.
Check the terminal output from Steps 4–8 for any `Failed to record activity` or `Client error` lines — there should be none.

- [ ] **Step 10 (optional): Test reconnect-with-backoff**

Temporarily disable the machine's network connection for ~10 seconds while the bot is running, then re-enable it.
Expected: `Disconnected (reason: ...)` followed by `Reconnecting in 1000ms (attempt 1).`, then either a successful `Kakao bot logged in and watching for mentions.` or, if the connection is still down, an increasing delay on each subsequent attempt (`2000ms`, `4000ms`, ...).
