# Riot Account Lookup Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins register a member's Riot account (PUUID) without a replay — by typing `이름#태그` on `/member-info` or by batch-resolving the Riot ID hints already in Discord/Kakao nicknames — through the Riot Account-V1 API.

**Architecture:** No schema change. `RiotAccount` (Member 1:N, `puuid @unique`) is the store; its creation rule widens from "replay only" to "any verified PUUID source" (replay metadata or Riot API response). A pure `parseRiotId` lives in `packages/core`; the HTTP client `lookupRiotAccount` lives in `apps/dashboard/lib/riot-api/` with injectable `fetch`; two mutations (`registerRiotAccount`/`removeRiotAccount`, `registerRiotAccountsFromHints`) take `prisma` first like every other mutation; UI is a new column cell on `/member-info` and one button on `/link-accounts`.

**Tech Stack:** TypeScript, Next.js 14 App Router server actions, Prisma/Postgres, vitest (core unit + dashboard integration against `DATABASE_URL_TEST`), Riot Account-V1 (`asia` routing).

**Spec:** `docs/superpowers/specs/2026-09-22-riot-account-lookup-design.md`

## Global Constraints

- UI copy is Korean; code, identifiers, comments and commit messages are English (CLAUDE.md convention). Comments in this repo are Korean prose explaining *why* — follow that where you add comments.
- DB-touching logic goes in `apps/dashboard/lib/{queries,mutations}/` and takes `prisma` as its first argument. Pure domain logic goes in `packages/core` with a unit test.
- Every DB test file starts with the `DATABASE_URL_TEST` guard (copy it verbatim from any existing mutation test). Never remove it.
- Run dashboard tests from `apps/dashboard` (`npx vitest run <file>`); core tests from `packages/core`.
- `RiotAccount` rows are created only from a verified PUUID source: replay metadata or a Riot Account-V1 response. Hand-typed strings (`Member.riotId`, nickname hints) are lookup *inputs*, never row sources.
- `removeRiotAccount` **deletes** the row. Never set `memberId = null` for "unlink" — null means "confirmed outsider, don't ask again".
- Batch lookup runs sequentially, stops on the first `unauthorized`, retries `rate_limited` once after 2 s, and is never triggered automatically.
- Do not commit `.env`. The real `RIOT_API_KEY` goes only in the gitignored `.env` (local) and the server's `.env`.
- Commit messages end with the `Co-Authored-By` line the session reminder specifies.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/parse-riot-id.ts` (+ `.test.ts`) | `parseRiotId(text)` → `{ gameName, tagLine } \| null`. Pure. |
| `packages/core/src/index.ts` | add `export * from "./parse-riot-id";` |
| `apps/dashboard/lib/riot-api/account.ts` (+ `.test.ts`) | `lookupRiotAccount(gameName, tagLine, deps?)` — the only file that knows the Riot HTTP API. |
| `apps/dashboard/lib/mutations/register-riot-account.ts` (+ `.test.ts`) | `registerRiotAccount`, `removeRiotAccount`, `REGISTER_RIOT_ACCOUNT_ERRORS`. |
| `apps/dashboard/lib/mutations/register-riot-accounts-from-hints.ts` (+ `.test.ts`) | Batch: hint → lookup → register, with tallies. |
| `apps/dashboard/lib/queries/member-info.ts` (+ `.test.ts`) | `MemberInfoRow.riotAccounts` added. |
| `apps/dashboard/app/member-info/actions.ts` | `registerRiotAccountByLookupAction`, `removeRiotAccountAction`. |
| `apps/dashboard/components/MemberRiotAccountsCell.tsx` | Chips + admin add/remove. Client component. |
| `apps/dashboard/components/MemberInfoTable.tsx`, `MemberInfoCard.tsx` | Wire the new column / chip line. |
| `apps/dashboard/app/link-accounts/actions.ts` | `registerRiotAccountsFromHintsAction`. |
| `apps/dashboard/components/AccountMappingPanel.tsx` | "닉네임에서 라이엇 계정 찾기" button. |
| `.env.example`, `.env.prod.example`, `CLAUDE.md`, `packages/db/prisma/schema.prisma` (comment only) | Docs / placeholders. |

---

### Task 1: `parseRiotId` in core

**Files:**
- Create: `packages/core/src/parse-riot-id.ts`
- Create: `packages/core/src/parse-riot-id.test.ts`
- Modify: `packages/core/src/index.ts` (append one export line)

**Interfaces:**
- Produces: `export interface ParsedRiotId { gameName: string; tagLine: string }` and `export function parseRiotId(text: string): ParsedRiotId | null` — used by Tasks 4 and 6.

- [ ] **Step 1: Write the failing test**

`packages/core/src/parse-riot-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRiotId } from "./parse-riot-id";

describe("parseRiotId", () => {
  it("splits game name and tag line on #", () => {
    expect(parseRiotId("늑 구#kr1")).toEqual({ gameName: "늑 구", tagLine: "kr1" });
  });

  it("trims whitespace around both parts", () => {
    expect(parseRiotId("  깔끔좌 # KR1 ")).toEqual({ gameName: "깔끔좌", tagLine: "KR1" });
  });

  it("splits on the last # so a # inside the name survives", () => {
    expect(parseRiotId("a#b#c")).toEqual({ gameName: "a#b", tagLine: "c" });
  });

  it("returns null without a #", () => {
    expect(parseRiotId("깔끔좌")).toBeNull();
  });

  it("returns null when either side is empty", () => {
    expect(parseRiotId("#kr1")).toBeNull();
    expect(parseRiotId("깔끔좌#")).toBeNull();
    expect(parseRiotId("#")).toBeNull();
    expect(parseRiotId("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `packages/core`): `npx vitest run src/parse-riot-id.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-riot-id"`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/parse-riot-id.ts`:

```ts
export interface ParsedRiotId {
  gameName: string;
  tagLine: string;
}

/**
 * "게임닉#태그"를 두 조각으로 나눈다. 마지막 `#` 기준이다 — 게임 닉에 `#`은 못 들어가지만
 * 사람이 적은 문자열은 무엇이든 올 수 있어 방어적으로 둔다.
 *
 * 형식 검증은 이것뿐이다. 길이·문자 규칙은 라이엇이 안다 — 조회가 404를 내면 그것이 답이다.
 */
export function parseRiotId(text: string): ParsedRiotId | null {
  const at = text.lastIndexOf("#");
  if (at < 0) return null;
  const gameName = text.slice(0, at).trim();
  const tagLine = text.slice(at + 1).trim();
  if (gameName.length === 0 || tagLine.length === 0) return null;
  return { gameName, tagLine };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./parse-riot-id";
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `packages/core`): `npx vitest run src/parse-riot-id.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parse-riot-id.ts packages/core/src/parse-riot-id.test.ts packages/core/src/index.ts
git commit -m "feat(core): add parseRiotId"
```

---

### Task 2: Riot Account-V1 client

**Files:**
- Create: `apps/dashboard/lib/riot-api/account.ts`
- Create: `apps/dashboard/lib/riot-api/account.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RiotAccountLookup { puuid: string; gameName: string; tagLine: string }
  export type LookupFailure = "not_found" | "unauthorized" | "rate_limited" | "unavailable";
  export type LookupResult = { ok: true; account: RiotAccountLookup } | { ok: false; reason: LookupFailure };
  export type LookupRiotAccount = (gameName: string, tagLine: string) => Promise<LookupResult>;
  export function lookupRiotAccount(gameName: string, tagLine: string, deps?: { fetch?: typeof fetch; apiKey?: string }): Promise<LookupResult>;
  ```
  Tasks 4 and 6 consume `lookupRiotAccount`; Task 4 types its injected parameter as `LookupRiotAccount`.

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/riot-api/account.test.ts` (no DB — no guard needed):

```ts
import { describe, expect, it, vi } from "vitest";
import { lookupRiotAccount } from "./account";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("lookupRiotAccount", () => {
  it("returns the account on 200", async () => {
    const fetch = fakeFetch(200, { puuid: "p-1", gameName: "늑 구", tagLine: "KR1" });

    const result = await lookupRiotAccount("늑 구", "kr1", { fetch, apiKey: "RGAPI-test" });

    expect(result).toEqual({ ok: true, account: { puuid: "p-1", gameName: "늑 구", tagLine: "KR1" } });
  });

  it("calls the asia routing host with encoded path segments and the token header", async () => {
    const fetch = fakeFetch(200, { puuid: "p", gameName: "늑 구", tagLine: "KR1" });

    await lookupRiotAccount("늑 구", "kr1", { fetch, apiKey: "RGAPI-test" });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent("늑 구")}/kr1`,
    );
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("RGAPI-test");
  });

  it("maps 404 to not_found", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(404), apiKey: "k" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("maps 401 and 403 to unauthorized", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(401), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(403), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("maps 429 to rate_limited", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(429), apiKey: "k" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("maps other statuses and thrown errors to unavailable", async () => {
    expect(await lookupRiotAccount("x", "y", { fetch: fakeFetch(503), apiKey: "k" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const throwing = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await lookupRiotAccount("x", "y", { fetch: throwing, apiKey: "k" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns unauthorized without calling fetch when the key is empty", async () => {
    const fetch = fakeFetch(200, {});

    const result = await lookupRiotAccount("x", "y", { fetch, apiKey: "" });

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/riot-api/account.test.ts`
Expected: FAIL — cannot resolve `./account`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/lib/riot-api/account.ts`:

```ts
export interface RiotAccountLookup {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export type LookupFailure = "not_found" | "unauthorized" | "rate_limited" | "unavailable";

export type LookupResult = { ok: true; account: RiotAccountLookup } | { ok: false; reason: LookupFailure };

export type LookupRiotAccount = (gameName: string, tagLine: string) => Promise<LookupResult>;

// 한국 계정은 asia 라우팅이다. Account-V1은 지역이 아니라 라우팅 값(americas/asia/europe)을 쓴다.
const ACCOUNT_V1_BASE = "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id";

/**
 * Riot ID → PUUID. 네트워크와 라이엇 응답 형식을 아는 유일한 파일이다.
 *
 * 실패를 던지지 않고 결과로 돌려준다 — 배치(registerRiotAccountsFromHints)가 한 건의
 * 404 때문에 멈추면 안 되고, 키 만료(401/403)는 호출자가 즉시 중단할 수 있어야 한다.
 */
export async function lookupRiotAccount(
  gameName: string,
  tagLine: string,
  deps: { fetch?: typeof fetch; apiKey?: string } = {},
): Promise<LookupResult> {
  const apiKey = deps.apiKey ?? process.env.RIOT_API_KEY ?? "";
  // 키가 없으면 어차피 401이다. 호출을 아껴 곧바로 같은 답을 낸다.
  if (apiKey.length === 0) return { ok: false, reason: "unauthorized" };

  const doFetch = deps.fetch ?? fetch;
  const url = `${ACCOUNT_V1_BASE}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  let response: Response;
  try {
    response = await doFetch(url, { headers: { "X-Riot-Token": apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  const body = (await response.json()) as { puuid: string; gameName: string; tagLine: string };
  // 응답의 표기를 그대로 쓴다 — 대소문자·공백이 라이엇 쪽 정본으로 정리돼 온다.
  return { ok: true, account: { puuid: body.puuid, gameName: body.gameName, tagLine: body.tagLine } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/riot-api/account.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/riot-api/account.ts apps/dashboard/lib/riot-api/account.test.ts
git commit -m "feat(dashboard): add Riot Account-V1 lookup client"
```

---

### Task 3: `registerRiotAccount` / `removeRiotAccount`

**Files:**
- Create: `apps/dashboard/lib/mutations/register-riot-account.ts`
- Create: `apps/dashboard/lib/mutations/register-riot-account.test.ts`

**Interfaces:**
- Consumes: `RiotAccountLookup` from Task 2.
- Produces:
  ```ts
  export const REGISTER_RIOT_ACCOUNT_ERRORS = { memberMissing: "회원이 존재하지 않습니다.", ownedByOther: (name: string) => `이미 ${name} 회원의 계정입니다.` };
  export function registerRiotAccount(prisma: PrismaClient, memberId: string, account: RiotAccountLookup): Promise<void>;
  export function removeRiotAccount(prisma: PrismaClient, riotAccountId: string): Promise<void>;
  export function isOwnedByOtherError(error: unknown): boolean;
  ```
  Tasks 4 and 6 consume all of these.

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/mutations/register-riot-account.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { registerRiotAccount, removeRiotAccount, REGISTER_RIOT_ACCOUNT_ERRORS } from "./register-riot-account";

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

const ACCOUNT = { puuid: "puuid-1", gameName: "늑 구", tagLine: "KR1" };

async function member(realName: string) {
  return prisma.member.create({ data: { realName, kakaoNickname: `${realName}/95/x#1` } });
}

describe("registerRiotAccount", () => {
  it("creates the row for a new puuid", async () => {
    const m = await member("가");

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(m.id);
    expect(row.gameName).toBe("늑 구");
    expect(row.tagLine).toBe("KR1");
  });

  it("refreshes the name on the same member's existing row", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({
      data: { ...ACCOUNT, gameName: "옛닉", memberId: m.id, lastSeenAt: new Date("2026-01-01") },
    });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.gameName).toBe("늑 구");
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(new Date("2026-01-01").getTime());
    expect(await prisma.riotAccount.count()).toBe(1);
  });

  it("attaches a confirmed-outsider row (memberId null) to the member", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: null, lastSeenAt: new Date() } });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(m.id);
  });

  it("refuses when another member owns the puuid, naming that member", async () => {
    const owner = await member("가");
    const other = await member("나");
    await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: owner.id, lastSeenAt: new Date() } });

    await expect(registerRiotAccount(prisma, other.id, ACCOUNT)).rejects.toThrow(
      REGISTER_RIOT_ACCOUNT_ERRORS.ownedByOther("가"),
    );

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.memberId).toBe(owner.id);
  });

  it("refuses a member that does not exist", async () => {
    await expect(
      registerRiotAccount(prisma, "00000000-0000-0000-0000-000000000000", ACCOUNT),
    ).rejects.toThrow(REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing);
    expect(await prisma.riotAccount.count()).toBe(0);
  });

  it("clears absorbedFromId when the owner changes from null to a member", async () => {
    const m = await member("가");
    await prisma.riotAccount.create({
      data: { ...ACCOUNT, memberId: null, absorbedFromId: "stale-tombstone", lastSeenAt: new Date() },
    });

    await registerRiotAccount(prisma, m.id, ACCOUNT);

    const row = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "puuid-1" } });
    expect(row.absorbedFromId).toBeNull();
  });
});

describe("removeRiotAccount", () => {
  it("deletes the row", async () => {
    const m = await member("가");
    const row = await prisma.riotAccount.create({ data: { ...ACCOUNT, memberId: m.id, lastSeenAt: new Date() } });

    await removeRiotAccount(prisma, row.id);

    expect(await prisma.riotAccount.count()).toBe(0);
  });

  it("ignores an id that no longer exists", async () => {
    await expect(removeRiotAccount(prisma, "00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/register-riot-account.test.ts`
Expected: FAIL — cannot resolve `./register-riot-account`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/lib/mutations/register-riot-account.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import type { RiotAccountLookup } from "@/lib/riot-api/account";

const OWNED_BY_OTHER_PREFIX = "이미 ";

export const REGISTER_RIOT_ACCOUNT_ERRORS = {
  memberMissing: "회원이 존재하지 않습니다.",
  ownedByOther: (name: string) => `${OWNED_BY_OTHER_PREFIX}${name} 회원의 계정입니다.`,
} as const;

/** ownedByOther 메시지는 이름이 들어가 상수 비교가 안 된다. 서버 액션이 안내 문구를 고를 때 쓴다. */
export function isOwnedByOtherError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(OWNED_BY_OTHER_PREFIX) && error.message.endsWith(" 회원의 계정입니다.");
}

function displayName(m: { realName: string | null; kakaoNickname: string | null; discordDisplayName: string | null }): string {
  return m.realName ?? m.kakaoNickname ?? m.discordDisplayName ?? "다른";
}

/**
 * 검증된 PUUID(리플레이 또는 Riot API 응답)를 회원에게 붙인다. 손으로 적은 문자열로는
 * 부르지 않는다 — 그 문자열은 lookupRiotAccount의 입력이지 이 함수의 입력이 아니다.
 *
 * 다른 회원이 이미 가진 PUUID는 거부한다. 덮어쓰면 한 사람의 계정이 조용히 옮겨간다 —
 * 옮기려면 그쪽에서 먼저 removeRiotAccount로 뗀다. memberId가 null(외부인 확정)이면
 * 관리자의 명시적 등록이 그 확정을 이긴다.
 */
export async function registerRiotAccount(
  prisma: PrismaClient,
  memberId: string,
  account: RiotAccountLookup,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // FK 위반보다 먼저 잡는다 — saveReplayImport와 같은 이유로, Prisma의 긴 에러 대신
    // 한글 안내가 나가야 한다.
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) throw new Error(REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing);

    const now = new Date();
    const existing = await tx.riotAccount.findUnique({
      where: { puuid: account.puuid },
      include: { member: { select: { realName: true, kakaoNickname: true, discordDisplayName: true } } },
    });

    if (!existing) {
      await tx.riotAccount.create({
        data: {
          puuid: account.puuid,
          memberId,
          gameName: account.gameName,
          tagLine: account.tagLine,
          lastSeenAt: now,
        },
      });
      return;
    }

    if (existing.memberId !== null && existing.memberId !== memberId) {
      throw new Error(REGISTER_RIOT_ACCOUNT_ERRORS.ownedByOther(displayName(existing.member!)));
    }

    await tx.riotAccount.update({
      where: { puuid: account.puuid },
      data: {
        memberId,
        gameName: account.gameName,
        tagLine: account.tagLine,
        lastSeenAt: now,
        // 주인이 바뀌면 흡수 표식은 의미를 잃는다 — saveReplayImport와 같은 규칙.
        absorbedFromId: existing.memberId === memberId ? existing.absorbedFromId : null,
      },
    });
  });
}

/**
 * 행을 지운다. memberId = null로 두면 "외부인으로 확정, 다시 묻지 말 것"이 되어 잘못 붙인
 * 계정을 뗀 것과 구별되지 않는다. 지우면 다음 리플레이에서 다시 후보로 뜬다.
 */
export async function removeRiotAccount(prisma: PrismaClient, riotAccountId: string): Promise<void> {
  await prisma.riotAccount.deleteMany({ where: { id: riotAccountId } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/register-riot-account.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/mutations/register-riot-account.ts apps/dashboard/lib/mutations/register-riot-account.test.ts
git commit -m "feat(dashboard): register and remove Riot accounts by verified PUUID"
```

---

### Task 4: `registerRiotAccountsFromHints` batch

**Files:**
- Create: `apps/dashboard/lib/mutations/register-riot-accounts-from-hints.ts`
- Create: `apps/dashboard/lib/mutations/register-riot-accounts-from-hints.test.ts`

**Interfaces:**
- Consumes: `parseRiotId`, `discordRiotHint`, `kakaoRiotHint` from `@lolpamin/core`; `LookupRiotAccount` type from Task 2; `registerRiotAccount`, `isOwnedByOtherError` from Task 3.
- Produces:
  ```ts
  export interface HintRegistrationResult { registered: number; notFound: number; conflicts: number; skipped: number; unauthorized: boolean }
  export function countMembersWithoutRiotAccount(prisma: PrismaClient): Promise<number>;
  export function registerRiotAccountsFromHints(prisma: PrismaClient, lookup: LookupRiotAccount, deps?: { sleep?: (ms: number) => Promise<void> }): Promise<HintRegistrationResult>;
  ```
  Task 7 consumes both functions.

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/mutations/register-riot-accounts-from-hints.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { LookupResult } from "@/lib/riot-api/account";
import { countMembersWithoutRiotAccount, registerRiotAccountsFromHints } from "./register-riot-accounts-from-hints";

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

const noSleep = { sleep: async () => {} };

// gameName#tagLine → 결과. 목록에 없으면 404.
function lookupFrom(table: Record<string, LookupResult>) {
  return vi.fn(async (gameName: string, tagLine: string) => {
    return table[`${gameName}#${tagLine}`] ?? { ok: false, reason: "not_found" as const };
  });
}

const found = (puuid: string, gameName: string, tagLine: string): LookupResult => ({
  ok: true,
  account: { puuid, gameName, tagLine },
});

describe("registerRiotAccountsFromHints", () => {
  it("prefers the discord hint, then kakao, then Member.riotId", async () => {
    const byDiscord = await prisma.member.create({
      data: { realName: "가", discordUserId: "d-1", discordDisplayName: "가/디코닉#D1/탑", kakaoNickname: "가/95/카톡닉#K1", riotId: "손닉#R1" },
    });
    const byKakao = await prisma.member.create({
      data: { realName: "나", discordUserId: "d-2", discordDisplayName: "나", kakaoNickname: "나/95/카톡닉2#K2", riotId: "손닉2#R2" },
    });
    const byRiotId = await prisma.member.create({
      data: { realName: "다", discordUserId: "d-3", riotId: "손닉3#R3" },
    });
    const lookup = lookupFrom({
      "디코닉#D1": found("p-1", "디코닉", "D1"),
      "카톡닉2#K2": found("p-2", "카톡닉2", "K2"),
      "손닉3#R3": found("p-3", "손닉3", "R3"),
    });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 3, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false });
    expect(lookup).toHaveBeenCalledTimes(3);
    const rows = await prisma.riotAccount.findMany({ orderBy: { puuid: "asc" } });
    expect(rows.map((r) => [r.puuid, r.memberId])).toEqual([
      ["p-1", byDiscord.id],
      ["p-2", byKakao.id],
      ["p-3", byRiotId.id],
    ]);
  });

  it("reads the kakao hint through a survivor's tombstone", async () => {
    const survivor = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "가/95/묘비닉#T1", mergedIntoId: survivor.id } });
    const lookup = lookupFrom({ "묘비닉#T1": found("p-1", "묘비닉", "T1") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.registered).toBe(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).memberId).toBe(survivor.id);
  });

  it("skips members that already have a riot account and members without any hint", async () => {
    const has = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "닉#1" } });
    await prisma.riotAccount.create({ data: { puuid: "p-existing", memberId: has.id, gameName: "닉", tagLine: "1", lastSeenAt: new Date() } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", discordDisplayName: "나" } });
    const lookup = lookupFrom({ "닉#1": found("p-existing", "닉", "1") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 0, notFound: 0, conflicts: 0, skipped: 1, unauthorized: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores tombstones as members", async () => {
    const survivor = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "가/95/닉#1", mergedIntoId: survivor.id, riotId: "닉#1" } });
    const lookup = lookupFrom({ "닉#1": found("p-1", "닉", "1") });

    await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    // 묘비는 대상이 아니지만 그 카톡 닉네임은 생존자의 힌트로 쓰였다.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await prisma.riotAccount.findUniqueOrThrow({ where: { puuid: "p-1" } })).memberId).toBe(survivor.id);
  });

  it("counts not-found and conflicts without stopping", async () => {
    const owner = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.riotAccount.create({ data: { puuid: "p-taken", memberId: owner.id, gameName: "가닉", tagLine: "1", lastSeenAt: new Date() } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "다", discordUserId: "d-3", riotId: "없는닉#9" } });
    await prisma.member.create({ data: { realName: "라", discordUserId: "d-4", riotId: "라닉#4" } });
    const lookup = lookupFrom({ "가닉#1": found("p-taken", "가닉", "1"), "라닉#4": found("p-4", "라닉", "4") });

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result).toEqual({ registered: 1, notFound: 1, conflicts: 1, skipped: 0, unauthorized: false });
  });

  it("stops at the first unauthorized response", async () => {
    await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "나닉#2" } });
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "unauthorized" }));

    const result = await registerRiotAccountsFromHints(prisma, lookup, noSleep);

    expect(result.unauthorized).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("retries rate_limited once after sleeping, then stops if it repeats", async () => {
    await prisma.member.create({ data: { realName: "가", discordUserId: "d-1", riotId: "가닉#1" } });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2", riotId: "나닉#2" } });
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ ok: false, reason: "rate_limited" }));
    const sleep = vi.fn(async () => {});

    const result = await registerRiotAccountsFromHints(prisma, lookup, { sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(result.registered).toBe(0);
  });
});

describe("countMembersWithoutRiotAccount", () => {
  it("counts active members with no riot account", async () => {
    const has = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.riotAccount.create({ data: { puuid: "p", memberId: has.id, gameName: "x", tagLine: "1", lastSeenAt: new Date() } });
    const survivor = await prisma.member.create({ data: { realName: "나", discordUserId: "d-2" } });
    await prisma.member.create({ data: { kakaoNickname: "나/95/x#1", mergedIntoId: survivor.id } });

    expect(await countMembersWithoutRiotAccount(prisma)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/register-riot-accounts-from-hints.test.ts`
Expected: FAIL — cannot resolve `./register-riot-accounts-from-hints`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/lib/mutations/register-riot-accounts-from-hints.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import { discordRiotHint, kakaoRiotHint, parseRiotId, type ParsedRiotId } from "@lolpamin/core";
import type { LookupResult, LookupRiotAccount } from "@/lib/riot-api/account";
import { isOwnedByOtherError, registerRiotAccount } from "./register-riot-account";

export interface HintRegistrationResult {
  registered: number;
  notFound: number;
  conflicts: number;
  // 세 힌트 어디에도 파싱 가능한 Riot ID가 없던 회원.
  skipped: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

const RATE_LIMIT_BACKOFF_MS = 2000;

const targetWhere = { mergedIntoId: null, riotAccounts: { none: {} } } as const;

/** 확인창의 "N명" — 배치가 실제로 조회할 회원 수와 같은 조건이다. */
export async function countMembersWithoutRiotAccount(prisma: PrismaClient): Promise<number> {
  return prisma.member.count({ where: targetWhere });
}

// 디코 별명 → 카톡 닉네임(묘비 최신 것 포함) → 손으로 적은 riotId. 첫 번째로 파싱되는 것 하나.
// 디코 별명이 가장 앞인 이유: 세 힌트 중 유일하게 "게임닉#태그"가 관례의 고정 자리에 있다.
function firstHint(m: {
  discordDisplayName: string | null;
  kakaoNickname: string | null;
  riotId: string | null;
  absorbed: Array<{ kakaoNickname: string | null }>;
}): ParsedRiotId | null {
  const kakao = m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
  const candidates = [
    m.discordDisplayName ? discordRiotHint(m.discordDisplayName).riotId : null,
    kakao ? kakaoRiotHint(kakao) : null,
    m.riotId,
  ];
  for (const text of candidates) {
    const parsed = text ? parseRiotId(text) : null;
    if (parsed) return parsed;
  }
  return null;
}

/**
 * 라이엇 계정이 하나도 없는 활성 회원의 닉네임 힌트로 Riot API를 조회해 계정을 붙인다.
 * 부계정까지 찾는 기능이 아니다 — 이미 계정이 있는 회원은 건드리지 않는다.
 *
 * 순차 호출이다. 개발 키 한도(20/s, 100/2분)에 40명은 여유지만 병렬로 쏘면 그 한도를
 * 순간에 넘긴다. unauthorized는 즉시 중단 — 키가 죽었는데 나머지를 부를 이유가 없다.
 * 자동으로 돌리지 않는다. 디코 임포트에 끼우면 임포트가 외부 API 상태에 묶인다.
 */
export async function registerRiotAccountsFromHints(
  prisma: PrismaClient,
  lookup: LookupRiotAccount,
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<HintRegistrationResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: HintRegistrationResult = { registered: 0, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false };

  const members = await prisma.member.findMany({
    where: targetWhere,
    select: {
      id: true,
      discordDisplayName: true,
      kakaoNickname: true,
      riotId: true,
      absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const m of members) {
    const hint = firstHint(m);
    if (!hint) {
      result.skipped += 1;
      continue;
    }

    let outcome: LookupResult = await lookup(hint.gameName, hint.tagLine);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await lookup(hint.gameName, hint.tagLine);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        break;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      // unavailable: 이 한 명은 건너뛰고 계속 간다 — 일시적 오류일 가능성이 크다.
      continue;
    }

    try {
      await registerRiotAccount(prisma, m.id, outcome.account);
      result.registered += 1;
    } catch (error) {
      if (!isOwnedByOtherError(error)) throw error;
      result.conflicts += 1;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/register-riot-accounts-from-hints.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/mutations/register-riot-accounts-from-hints.ts apps/dashboard/lib/mutations/register-riot-accounts-from-hints.test.ts
git commit -m "feat(dashboard): batch-register Riot accounts from nickname hints"
```

---

### Task 5: `riotAccounts` on `MemberInfoRow`

**Files:**
- Modify: `apps/dashboard/lib/queries/member-info.ts` — `MemberInfoRow` interface (around line 53), `getMemberInfoListData` include + row mapping (around lines 210–250)
- Modify: `apps/dashboard/lib/queries/member-info.test.ts` — add one test at the end of the `getMemberInfoListData` describe block

**Interfaces:**
- Produces: `MemberInfoRow.riotAccounts: Array<{ id: string; gameName: string; tagLine: string }>` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("getMemberInfoListData records", () => { … })` block of `apps/dashboard/lib/queries/member-info.test.ts` (it starts at line ≈76), as its last `it`:

```ts
  it("lists each member's riot accounts, newest-seen first", async () => {
    const m = await prisma.member.create({ data: { realName: "가", discordUserId: "d-1" } });
    await prisma.riotAccount.create({
      data: { puuid: "p-old", memberId: m.id, gameName: "옛계정", tagLine: "KR1", lastSeenAt: new Date("2026-01-01") },
    });
    await prisma.riotAccount.create({
      data: { puuid: "p-new", memberId: m.id, gameName: "새계정", tagLine: "KR2", lastSeenAt: new Date("2026-09-01") },
    });
    await prisma.member.create({ data: { realName: "나", discordUserId: "d-2" } });

    const rows = await getMemberInfoListData("", "realName", "asc");

    expect(rows.map((r) => r.riotAccounts.map((a) => `${a.gameName}#${a.tagLine}`))).toEqual([
      ["새계정#KR2", "옛계정#KR1"],
      [],
    ]);
    expect(rows[0].riotAccounts[0].id).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/member-info.test.ts -t "riot accounts"`
Expected: FAIL — `r.riotAccounts` is undefined (TypeError on `.map`).

- [ ] **Step 3: Write minimal implementation**

In `apps/dashboard/lib/queries/member-info.ts`:

1. Extend the row type:

```ts
export interface MemberInfoRiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
}

export interface MemberInfoRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  tier: MemberTier;
  rift: ModeRecord;
  aram: ModeRecord;
  note: string | null;
  // 검증된 PUUID로 등록된 라이엇 계정. 묘비의 계정은 absorbMember가 생존자로 옮기므로
  // 자기 것만 보면 된다. 최근 관측순.
  riotAccounts: MemberInfoRiotAccount[];
}
```

2. Extend `MemberWithAbsorbed`:

```ts
type MemberWithAbsorbed = Member & {
  absorbed: Array<{ id: string; kakaoNickname: string | null }>;
  riotAccounts?: MemberInfoRiotAccount[];
};
```

3. In `getMemberInfoListData`, change the `include` to:

```ts
    include: {
      absorbed: { select: { id: true, kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      riotAccounts: { select: { id: true, gameName: true, tagLine: true }, orderBy: { lastSeenAt: "desc" } },
    },
```

4. In the row object literal inside `getMemberInfoListData`, add after `note: m.note,`:

```ts
          riotAccounts: m.riotAccounts ?? [],
```

(`getMemberInfoSummary` does not include `riotAccounts`; the optional type keeps it compiling.)

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/member-info.test.ts`
Expected: all pass (existing + 1 new).

Run typecheck: `npx tsc --noEmit -p .` — expect no *new* errors (two pre-existing errors in `lib/draw/candidates.test.ts` are known and unrelated).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/member-info.ts apps/dashboard/lib/queries/member-info.test.ts
git commit -m "feat(member-info): carry each member's riot accounts in the roster rows"
```

---

### Task 6: `/member-info` — Riot account column with add/remove

**Files:**
- Modify: `apps/dashboard/app/member-info/actions.ts` (append two actions)
- Create: `apps/dashboard/components/MemberRiotAccountsCell.tsx`
- Modify: `apps/dashboard/components/MemberInfoTable.tsx` (`GRID`, header row, data row)
- Modify: `apps/dashboard/components/MemberInfoCard.tsx` (chip line)

**Interfaces:**
- Consumes: `parseRiotId` (Task 1), `lookupRiotAccount` (Task 2), `registerRiotAccount`, `removeRiotAccount`, `REGISTER_RIOT_ACCOUNT_ERRORS`, `isOwnedByOtherError` (Task 3), `MemberInfoRow.riotAccounts` (Task 5).
- Produces: server actions
  ```ts
  registerRiotAccountByLookupAction(memberId: string, text: string): Promise<{ error: string | null }>
  removeRiotAccountAction(riotAccountId: string): Promise<{ error: string | null }>
  ```

No automated test for the UI (this repo does not test React components); the actions are thin wrappers over tested code. Verify by hand in Step 4.

- [ ] **Step 1: Add the server actions**

Append to `apps/dashboard/app/member-info/actions.ts` (add the imports at the top of the file next to the existing ones):

```ts
import { parseRiotId } from "@lolpamin/core";
import { lookupRiotAccount } from "@/lib/riot-api/account";
import {
  isOwnedByOtherError,
  registerRiotAccount,
  removeRiotAccount,
  REGISTER_RIOT_ACCOUNT_ERRORS,
} from "@/lib/mutations/register-riot-account";
```

```ts
// "use server" 모듈은 async 함수만 export할 수 있다 — 이 표는 내보내지 않는다.
const RIOT_LOOKUP_MESSAGES = {
  format: "이름#태그 형식으로 입력해 주세요.",
  not_found: "라이엇에 없는 계정입니다.",
  unauthorized: "Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY).",
  rate_limited: "잠시 후 다시 시도해 주세요.",
  unavailable: "잠시 후 다시 시도해 주세요.",
} as const;

export async function registerRiotAccountByLookupAction(
  memberId: string,
  text: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = parseRiotId(text);
  if (!parsed) return { error: RIOT_LOOKUP_MESSAGES.format };

  const lookup = await lookupRiotAccount(parsed.gameName, parsed.tagLine);
  if (!lookup.ok) return { error: RIOT_LOOKUP_MESSAGES[lookup.reason] };

  try {
    await registerRiotAccount(prisma, memberId, lookup.account);
  } catch (error) {
    console.error(error);
    // 이름이 든 ownedByOther와 memberMissing만 그대로 보여준다. Prisma 예외는 영어 스택이라
    // 관리자 화면에 띄우지 않는다 — link-accounts/actions.ts의 messageFor와 같은 방침.
    if (error instanceof Error && (isOwnedByOtherError(error) || error.message === REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing)) {
      return { error: error.message };
    }
    return { error: "라이엇 계정을 등록하지 못했습니다." };
  }

  // 계정이 붙으면 saveGameResult의 완화 조건이 바뀌므로 매치 입력 풀도 달라진다.
  revalidatePath("/member-info");
  revalidatePath("/matches");
  return { error: null };
}

export async function removeRiotAccountAction(riotAccountId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await removeRiotAccount(prisma, riotAccountId);
  } catch (error) {
    console.error(error);
    return { error: "라이엇 계정을 떼지 못했습니다." };
  }

  revalidatePath("/member-info");
  revalidatePath("/matches");
  return { error: null };
}
```

- [ ] **Step 2: Create the cell component**

`apps/dashboard/components/MemberRiotAccountsCell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberInfoRiotAccount } from "@/lib/queries/member-info";
import { registerRiotAccountByLookupAction, removeRiotAccountAction } from "@/app/member-info/actions";

export function MemberRiotAccountsCell({
  memberId,
  accounts,
  isAdmin,
}: {
  memberId: string;
  accounts: MemberInfoRiotAccount[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chips = accounts.map((a) => (
    <span
      key={a.id}
      className="inline-flex items-center gap-1 rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[12px] text-success-soft"
    >
      {a.gameName}#{a.tagLine}
      {isAdmin && (
        <button
          type="button"
          title="이 계정 떼기"
          disabled={isPending}
          onClick={() => {
            // 삭제다 — 외부인 확정(null)이 아니라 행을 지운다. 다음 리플레이에서 다시 후보로 뜬다.
            if (!window.confirm(`${a.gameName}#${a.tagLine} 계정을 뗍니다. 계속할까요?`)) return;
            setError(null);
            startTransition(async () => {
              const { error: actionError } = await removeRiotAccountAction(a.id);
              setError(actionError);
              router.refresh();
            });
          }}
          className="text-ghost hover:text-danger-soft"
        >
          ×
        </button>
      )}
    </span>
  ));

  if (!isAdmin) {
    return <div className="flex flex-wrap gap-1">{chips.length > 0 ? chips : <span className="text-ghost">-</span>}</div>;
  }

  function submit() {
    const text = value.trim();
    if (text.length === 0) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await registerRiotAccountByLookupAction(memberId, text);
      setError(actionError);
      if (!actionError) setValue("");
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap gap-1">{chips}</div>
      <input
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setValue("");
        }}
        placeholder={isPending ? "조회 중..." : "이름#태그 추가"}
        title="Riot ID를 입력하고 Enter — Riot API로 PUUID를 조회해 등록합니다"
        className="w-full rounded-md border border-ink/[.09] bg-inset px-1.5 py-1 font-mono text-[12.5px] text-fg outline-none focus:border-accent disabled:opacity-40"
      />
      {error && <span className="text-[11.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Wire the column into the table and the card**

In `apps/dashboard/components/MemberInfoTable.tsx`:

1. Import: `import { MemberRiotAccountsCell } from "@/components/MemberRiotAccountsCell";`
2. Change `GRID` to add a track between 현재티어 and 비고 (keep the comment above it, add one sentence):

```ts
// 라이엇 계정 칸(1fr)은 비고 앞이다 — 칩 여러 개와 입력창이 들어가 닉네임 칸만큼 넓다.
const GRID = "grid-cols-[40px_72px_1.3fr_544px_112px_1.2fr_1.3fr]";
```

3. The first header row (the one with the 협곡/칼바람 group labels) renders three empty `<div />` **before** the metrics block and two **after** it. The grid now has seven tracks, so the trailing pair becomes three. Replace

```tsx
          </div>
          <div />
          <div />
        </div>
```

   (the closing of the `style={METRICS_BG}` div followed by the two trailing placeholders) with

```tsx
          </div>
          <div />
          <div />
          <div />
        </div>
```

4. In the second header row, after `<SortLink sortKey="tier" label="현재티어" />` insert:

```tsx
          <div>라이엇 계정</div>
```

5. In the data row, after `<MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />` insert:

```tsx
            <MemberRiotAccountsCell memberId={m.id} accounts={m.riotAccounts} isAdmin={isAdmin} />
```

In `apps/dashboard/components/MemberInfoCard.tsx`, after the `<div className="mt-1.5 flex flex-col gap-0.5 pl-8">…</div>` mode block and before the `row.note` line, insert (read-only on phones — editing is desktop-only like the other cells):

```tsx
      {row.riotAccounts.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-8">
          {row.riotAccounts.map((a) => (
            <span key={a.id} className="rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-success-soft">
              {a.gameName}#{a.tagLine}
            </span>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Verify by hand**

1. Put the real key in the repo-root `.env` (gitignored): add a line `RIOT_API_KEY="RGAPI-…"` with the key the user supplied in chat (do not write it into any tracked file).
2. `npx tsc --noEmit -p .` (cwd `apps/dashboard`) — no new errors.
3. `npm run dev --workspace=dashboard`, log in as admin, open `http://localhost:3000/member-info`.
4. In a row's 라이엇 계정 input type a real Riot ID you know exists (e.g. your own), Enter → chip appears in green.
5. Type `없는닉#zzzz` → "라이엇에 없는 계정입니다."
6. Type `태그없음` → "이름#태그 형식으로 입력해 주세요."
7. Click × on the chip → confirm → chip gone.
8. Log out → column shows chips only, no input.
9. Narrow the window below `md` → card shows chips under the mode lines.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/member-info/actions.ts apps/dashboard/components/MemberRiotAccountsCell.tsx apps/dashboard/components/MemberInfoTable.tsx apps/dashboard/components/MemberInfoCard.tsx
git commit -m "feat(member-info): show riot accounts and register one by Riot ID lookup"
```

---

### Task 7: `/link-accounts` — batch button

**Files:**
- Modify: `apps/dashboard/app/link-accounts/actions.ts` (append one action)
- Modify: `apps/dashboard/components/AccountMappingPanel.tsx` (button next to 디스코드 회원 가져오기)

**Interfaces:**
- Consumes: `countMembersWithoutRiotAccount`, `registerRiotAccountsFromHints`, `HintRegistrationResult` (Task 4); `lookupRiotAccount` (Task 2).
- Produces: `registerRiotAccountsFromHintsAction(): Promise<{ result: HintRegistrationResult | null; targetCount: number; error: string | null }>` and `countRiotLookupTargetsAction(): Promise<number>`.

- [ ] **Step 1: Add the actions**

Append to `apps/dashboard/app/link-accounts/actions.ts` (imports at the top):

```ts
import { lookupRiotAccount } from "@/lib/riot-api/account";
import {
  countMembersWithoutRiotAccount,
  registerRiotAccountsFromHints,
  type HintRegistrationResult,
} from "@/lib/mutations/register-riot-accounts-from-hints";
```

```ts
/** 확인창의 "N명"용. 배치가 조회할 회원 수와 같은 조건이다. */
export async function countRiotLookupTargetsAction(): Promise<number> {
  await requireAdmin();
  return countMembersWithoutRiotAccount(prisma);
}

export interface RegisterRiotAccountsFromHintsActionResult {
  result: HintRegistrationResult | null;
  error: string | null;
}

export async function registerRiotAccountsFromHintsAction(): Promise<RegisterRiotAccountsFromHintsActionResult> {
  await requireAdmin();

  try {
    const result = await registerRiotAccountsFromHints(prisma, lookupRiotAccount);
    revalidatePath("/link-accounts");
    revalidatePath("/member-info");
    revalidatePath("/matches");
    return { result, error: null };
  } catch (error) {
    console.error(error);
    return { result: null, error: "라이엇 계정 조회 중 오류가 났습니다." };
  }
}
```

- [ ] **Step 2: Add the button**

In `apps/dashboard/components/AccountMappingPanel.tsx`:

1. Extend the import from `@/app/link-accounts/actions`:

```ts
import {
  absorbMemberAction,
  releaseMemberAction,
  importDiscordMembersAction,
  countRiotLookupTargetsAction,
  registerRiotAccountsFromHintsAction,
} from "@/app/link-accounts/actions";
```

2. Add state next to `importStatus`/`isImporting`:

```ts
  const [riotStatus, setRiotStatus] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
```

3. Add the handler after `handleImportDiscord`:

```ts
  async function handleRiotLookup() {
    setIsLookingUp(true);
    setRiotStatus(null);
    try {
      const targetCount = await countRiotLookupTargetsAction();
      if (targetCount === 0) {
        setRiotStatus("라이엇 계정이 없는 회원이 없습니다.");
        return;
      }
      if (!window.confirm(`라이엇 계정이 없는 회원 ${targetCount}명의 닉네임으로 Riot API를 조회합니다. 계속할까요?`)) return;

      const { result, error } = await registerRiotAccountsFromHintsAction();
      if (error || !result) {
        setRiotStatus(error ?? "조회하지 못했습니다.");
        return;
      }
      const summary = `등록 ${result.registered} · 못 찾음 ${result.notFound} · 충돌 ${result.conflicts} · 힌트 없음 ${result.skipped}`;
      setRiotStatus(
        result.unauthorized
          ? `Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY). 중단 전까지 ${summary}`
          : summary,
      );
    } finally {
      setIsLookingUp(false);
    }
  }
```

4. In the `{isAdmin && (<div className="flex items-center gap-3">…)}` block, after `{importStatus && …}` add:

```tsx
          <button
            type="button"
            onClick={handleRiotLookup}
            disabled={isLookingUp}
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-extrabold ${
              isLookingUp
                ? "cursor-not-allowed border-ink/[.06] bg-hover text-ghost"
                : "cursor-pointer border-accent/45 bg-accent/[.18] text-accent-soft"
            }`}
          >
            {isLookingUp ? "조회 중..." : "닉네임에서 라이엇 계정 찾기"}
          </button>
          {riotStatus && <span className="text-[12.5px] text-muted">{riotStatus}</span>}
```

Change that wrapper `div` to `className="flex flex-wrap items-center gap-3"` so two buttons plus two status strings can wrap.

- [ ] **Step 3: Verify by hand**

1. `npx tsc --noEmit -p .` (cwd `apps/dashboard`) — no new errors.
2. Dev server, admin login, `/link-accounts`. Click the button → confirm dialog shows a member count → result string like `등록 3 · 못 찾음 2 · 충돌 0 · 힌트 없음 5`.
3. `/member-info` now shows the newly registered chips.
4. Temporarily set `RIOT_API_KEY=""` in `.env`, restart dev, click again → status starts with "Riot API 키가 만료됐거나 없습니다". Restore the key.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/link-accounts/actions.ts apps/dashboard/components/AccountMappingPanel.tsx
git commit -m "feat(link-accounts): resolve riot accounts from nickname hints in one click"
```

---

### Task 8: Env placeholders, docs, schema comment, full test run

**Files:**
- Modify: `.env.example`, `.env.prod.example`
- Modify: `packages/db/prisma/schema.prisma` lines 200–204 (comment only — no migration)
- Modify: `CLAUDE.md` paragraph starting `` `RiotAccount`는 **리플레이에서 관측된 계정으로만** 만든다. `` (line ≈146)
- Modify: `docs/superpowers/specs/2026-09-22-riot-account-lookup-design.md` status line

- [ ] **Step 1: Env placeholders**

Append to `.env.example` after the Discord block:

```
# Riot API — https://developer.riotgames.com. 개발 키는 24시간마다 만료된다(매일 갱신).
# 매일 갱신이 귀찮으면 Personal API Key를 신청한다(영구, 같은 한도).
RIOT_API_KEY=""
```

Append to `.env.prod.example` after the Discord block:

```
# Riot API 키 — 로컬 .env의 값과 동일. 비어 있으면 계정 조회만 "키 만료" 안내가 나고 나머지는 동작한다.
RIOT_API_KEY=""
```

- [ ] **Step 2: Schema comment**

Replace lines 200–204 of `packages/db/prisma/schema.prisma` with:

```prisma
// 검증된 PUUID로만 만드는 라이엇 계정. 한 회원이 부계정을 여러 개 가질 수 있으므로 Member 1:N이다.
//
// 소스는 둘뿐이다 — 리플레이 메타데이터, Riot Account-V1 응답. 둘 다 라이엇이 준 PUUID다.
// 카톡·디코 닉네임과 Member.riotId에 적힌 "게임닉#태그"로는 절대 만들지 않는다 — 그 값들은
// 사람이 손으로 적은 것이라 오타·태그 누락이 흔하고, 그대로 저장하면 박병준#0216(리플레이)과
// 박병준#kr1(카톡 오기)이 별개 계정이 되어 중복이 늘어난다. 그 문자열은 조회의 입력일 뿐이고,
// 행은 조회가 PUUID를 돌려줬을 때만 생긴다.
```

Run `npm run generate --workspace=@lolpamin/db` — comment-only change, so no migration. Confirm with `git diff packages/db/prisma/schema.prisma`: only `//` lines changed. If any non-comment line changed, revert it — this task must not alter the schema.

- [ ] **Step 3: CLAUDE.md**

Replace the first sentence of the paragraph (`` `RiotAccount`는 **리플레이에서 관측된 계정으로만** 만든다. ``) with:

```
`RiotAccount`는 **검증된 PUUID 소스로만** 만든다 — 리플레이 메타데이터, 그리고 Riot
Account-V1 조회 응답(`lib/riot-api/account.ts`). 등록 경로는 셋: 리플레이 업로드,
`/member-info`에서 "이름#태그" 입력(`registerRiotAccount`), `/link-accounts`의 배치
(`registerRiotAccountsFromHints` — 디코 별명 → 카톡 닉네임 → `Member.riotId` 순으로 첫
힌트 하나만 조회, 계정이 없는 회원만, 첫 `unauthorized`에서 중단). `RIOT_API_KEY`는
`.env`; 개발 키는 24시간 만료라 "키 만료" 안내가 나면 갱신한다.
```

Keep the rest of the paragraph (the sentence starting `카톡·디코 닉네임에 적힌 Riot ID와 …`) as is, and append one sentence at its end:

```
`removeRiotAccount`는 행을 **삭제**한다 — `memberId = null`은 "외부인 확정"이라 잘못 붙인
계정을 뗀 것과 구별되지 않는다.
```

- [ ] **Step 4: Spec status + full test run**

In the spec, change `**상태:** 설계 승인 대기` to `**상태:** 구현 완료 (2026-09-22)`.

Run everything:

```bash
npm test
```

Expected: all workspaces green (core, dashboard, discord-bot). Also `npx tsc --noEmit -p .` in `apps/dashboard` shows only the two pre-existing `lib/draw/candidates.test.ts` errors.

- [ ] **Step 5: Commit**

```bash
git add .env.example .env.prod.example packages/db/prisma/schema.prisma CLAUDE.md docs/superpowers/specs/2026-09-22-riot-account-lookup-design.md
git commit -m "docs: record verified-PUUID sources for RiotAccount and the RIOT_API_KEY env"
```

Deployment afterwards (not part of the plan's tests): add `RIOT_API_KEY` to the server's `~/lolpamin/.env`, then the usual three-command deploy from CLAUDE.md. `docker-compose.prod.yml` already passes `.env` via `env_file`, so no compose change.
