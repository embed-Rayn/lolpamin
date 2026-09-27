# Member Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every member edit onto a new operator page `/member-admin`, make `/member-info` a read-only viewer, split tier into 최고티어/산정티어, and show each member's top-3 mastery champions summed across all their Riot accounts.

**Architecture:** One new column (`Member.peakTier`). Mastery storage, the Riot lookup, the daily refresh mutation and the `topMasteries` sum already exist (captain-draft work, commits 7d46c80 / 2c32d09 / e90f2be) — this plan only reads them and adds the button. `/member-admin` reuses the existing editable cells; `/member-info` renders the same cells with `isAdmin={false}` or plain text.

**Tech Stack:** Next.js 14 App Router (server components + server actions), Prisma/Postgres, vitest, Tailwind semantic colour tokens.

**Spec:** `docs/superpowers/specs/2026-09-23-member-admin-design.md`

## Global Constraints

- Another Claude session is committing captain-draft work to `main` in the same checkout. Execute this plan in a git worktree (superpowers:using-git-worktrees) and rebase onto `main` before merging.
- UI copy Korean; code, identifiers, comments, commit messages English.
- Colours are never hex — use the semantic Tailwind roles (`text-muted`, `bg-inset`, `border-ink/[.09]`, `text-danger-soft`, …).
- DB-touching logic lives in `apps/dashboard/lib/{queries,mutations}/` and takes `prisma` as its first argument. Pure logic lives in `packages/core` with a unit test.
- Every DB test file starts with the `DATABASE_URL_TEST` guard (copy it verbatim from an existing test). Tests call `resetDatabase(prisma)` in `beforeEach`.
- Pages that read the DB declare `export const dynamic = "force-dynamic"`.
- Operator pages redirect a signed-out visitor to `/login`; every server action starts with `await requireAdmin()`.
- The new migration must sort after `20260923180000_champion_mastery`: name it `20260923190000_member_peak_tier`. If the other session has added a later migration by then, pick a timestamp after it.
- Run tests from the workspace dir: `cd apps/dashboard && npx vitest run <file>`; core: `cd packages/core && npx vitest run <file>`. Type-check: `cd apps/dashboard && npx tsc --noEmit`.

## Review Focus

1. **Member with no Riot account, or accounts never refreshed** — 모스트 shows `-`, row still renders. Pinned in Task 4.
2. **Age input `1994`, `01`, `abc`, `123`, empty** — 4-digit and 2-digit accepted and stored as two digits, empty clears to null, anything else rejected with a Korean message. Pinned in Task 1.
3. **Absorbed tombstone rows** — must not appear on `/member-admin`; their Riot accounts (moved to the survivor by `absorbMember`) count toward the survivor's masteries. Pinned in Task 4.
4. **Stored `age` disagrees with the nickname** — the stored value wins on both pages; null falls back to the nickname. Pinned in Task 3 and Task 4.
5. **A mastery `championId` Data Dragon does not know (champion newer than the committed patch)** — renders an empty square, page does not throw. `championIdByKey` already returns null; Task 5's component must branch on it (reviewed by reading, no component test harness exists).

---

### Task 1: Birth-year helpers in core

**Files:**
- Create: `packages/core/src/birth-year.ts`
- Create: `packages/core/src/birth-year.test.ts`
- Modify: `packages/core/src/kakao-match-key.ts:84-91` (`kakaoBirthYear` delegates to `fullBirthYear`)
- Modify: `packages/core/src/index.ts` (export)
- Modify: `apps/dashboard/lib/queries/member-info.ts` (`birthYearLabel` moves to core, re-exported)

**Interfaces:**
- Produces:
  - `fullBirthYear(year: number): number | null`
  - `parseBirthYearInput(raw: string): { ok: true; age: number | null } | { ok: false; error: string }`
  - `birthYearLabel(birthYear: number | null): string` (moved from `member-info.ts`, same behaviour)

- [ ] **Step 1: Write the failing test**

`packages/core/src/birth-year.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { birthYearLabel, fullBirthYear, parseBirthYearInput } from "./birth-year";

describe("fullBirthYear", () => {
  it("reads two digits below 30 as the 2000s", () => {
    expect(fullBirthYear(1)).toBe(2001);
    expect(fullBirthYear(29)).toBe(2029);
  });

  it("reads two digits from 30 as the 1900s", () => {
    expect(fullBirthYear(30)).toBe(1930);
    expect(fullBirthYear(94)).toBe(1994);
  });

  it("keeps a four-digit year", () => {
    expect(fullBirthYear(1994)).toBe(1994);
  });

  it("rejects three digits", () => {
    expect(fullBirthYear(123)).toBeNull();
  });
});

describe("parseBirthYearInput", () => {
  it("stores two digits as typed", () => {
    expect(parseBirthYearInput("94")).toEqual({ ok: true, age: 94 });
    expect(parseBirthYearInput("01")).toEqual({ ok: true, age: 1 });
  });

  it("shortens a four-digit year to two digits", () => {
    expect(parseBirthYearInput("1994")).toEqual({ ok: true, age: 94 });
    expect(parseBirthYearInput(" 2001 ")).toEqual({ ok: true, age: 1 });
  });

  it("clears on empty input", () => {
    expect(parseBirthYearInput("")).toEqual({ ok: true, age: null });
    expect(parseBirthYearInput("   ")).toEqual({ ok: true, age: null });
  });

  it("rejects anything else", () => {
    for (const raw of ["abc", "123", "9", "19x4", "1850"]) {
      expect(parseBirthYearInput(raw)).toEqual({
        ok: false,
        error: "출생연도를 두 자리(예: 94) 또는 네 자리로 입력해 주세요.",
      });
    }
  });
});

describe("birthYearLabel", () => {
  it("shows two digits the way the nickname writes them", () => {
    expect(birthYearLabel(1994)).toBe("94");
    expect(birthYearLabel(2001)).toBe("01");
    expect(birthYearLabel(null)).toBe("-");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/birth-year.test.ts`
Expected: FAIL — cannot resolve `./birth-year`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/birth-year.ts`:

```ts
// The group writes a birth year as two digits ("94", "01"). Below 30 reads as the 2000s —
// nobody in the group was born in the 1920s, and a 2030s birth year is not a member.
export function fullBirthYear(year: number): number | null {
  if (!Number.isInteger(year) || year < 0) return null;
  if (year >= 1900) return year;
  if (year >= 100) return null;
  return year < 30 ? 2000 + year : 1900 + year;
}

const BIRTH_YEAR_INPUT_ERROR = "출생연도를 두 자리(예: 94) 또는 네 자리로 입력해 주세요.";

/**
 * An admin's typed birth year. Stored as two digits, the way imports fill Member.age from the
 * nickname, so a hand-entered value and an imported one look the same. Empty clears the column
 * and the screens fall back to the nickname.
 */
export function parseBirthYearInput(raw: string): { ok: true; age: number | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === "") return { ok: true, age: null };
  if (!/^(\d{2}|\d{4})$/.test(text)) return { ok: false, error: BIRTH_YEAR_INPUT_ERROR };
  const full = fullBirthYear(Number(text));
  if (full === null) return { ok: false, error: BIRTH_YEAR_INPUT_ERROR };
  return { ok: true, age: full % 100 };
}

/** Two digits ("94", "01"), the way the group writes it in nicknames. */
export function birthYearLabel(birthYear: number | null): string {
  return birthYear === null ? "-" : String(birthYear % 100).padStart(2, "0");
}
```

`"1850"` passes the regex, but `fullBirthYear(1850)` is `null` (below 1900, not two digits), so it is rejected.

In `packages/core/src/kakao-match-key.ts`, replace the body tail of `kakaoBirthYear`:

```ts
export function kakaoBirthYear(rawNickname: string): number | null {
  const convention = readKakaoConvention(normalizeKakaoNickname(rawNickname));
  if (!convention) return null;
  return fullBirthYear(convention.year);
}
```

and add `import { fullBirthYear } from "./birth-year";` at the top.

In `packages/core/src/index.ts` add `export * from "./birth-year";`.

In `apps/dashboard/lib/queries/member-info.ts` delete the local `birthYearLabel` function and add a re-export so existing importers keep working:

```ts
export { birthYearLabel } from "@lolpamin/core";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run`
Expected: PASS, including the existing `kakaoBirthYear` tests in `kakao-match-key.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/birth-year.ts packages/core/src/birth-year.test.ts packages/core/src/kakao-match-key.ts packages/core/src/index.ts apps/dashboard/lib/queries/member-info.ts
git commit -m "feat(core): birth-year parsing shared by nickname and admin input"
```

---

### Task 2: `peakTier` column and the two new mutations

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (Member)
- Create: `packages/db/prisma/migrations/20260923190000_member_peak_tier/migration.sql`
- Create: `apps/dashboard/lib/mutations/update-member-peak-tier.ts`
- Create: `apps/dashboard/lib/mutations/update-member-peak-tier.test.ts`
- Create: `apps/dashboard/lib/mutations/update-member-age.ts`
- Create: `apps/dashboard/lib/mutations/update-member-age.test.ts`

**Interfaces:**
- Produces:
  - Prisma field `Member.peakTier: MemberTier` (default `UNRANKED`)
  - `updateMemberPeakTier(prisma: PrismaClient, memberId: string, peakTier: MemberTier): Promise<void>`
  - `updateMemberAge(prisma: PrismaClient, memberId: string, age: number | null): Promise<void>`

- [ ] **Step 1: Schema and migration**

In `schema.prisma`, directly under `tier MemberTier @default(UNRANKED)` in `model Member`, change the comment above `tier` to mention its screen name and add `peakTier`:

```prisma
  // 「티어를 모른다」와 「언랭이다」는 점수가 0으로 같고 화면 문구도 같다. nullable로
  // 두면 아무것도 얻지 못하면서 null 분기만 늘어난다. 화면 이름은 「산정티어」 — 팀빌더
  // 점수의 근거가 되는 티어다.
  tier               MemberTier @default(UNRANKED)
  // 「최고티어」. 관리자가 손으로 적는 참고값이고 점수에 쓰지 않는다 — Riot API는 역대 최고
  // 티어를 주지 않는다.
  peakTier           MemberTier @default(UNRANKED)
```

`packages/db/prisma/migrations/20260923190000_member_peak_tier/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Member" ADD COLUMN "peakTier" "MemberTier" NOT NULL DEFAULT 'UNRANKED';
```

Run (from repo root):

```bash
npm run migrate --workspace=@lolpamin/db
npm run generate --workspace=@lolpamin/db
```

Expected: the migration applies to the dev DB; `prisma migrate dev` reports no drift. Also apply to the test DB — use the same method the repo already uses for the test DB (check `packages/db/package.json` for a `migrate:test` script; if none, run `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy` from `packages/db`).

- [ ] **Step 2: Write the failing tests**

`apps/dashboard/lib/mutations/update-member-peak-tier.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberPeakTier } from "./update-member-peak-tier";

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

describe("updateMemberPeakTier", () => {
  it("starts every member at unranked", async () => {
    const member = await prisma.member.create({ data: { realName: "가" } });
    expect(member.peakTier).toBe("UNRANKED");
  });

  it("stores the peak tier without touching the rated tier", async () => {
    const member = await prisma.member.create({ data: { realName: "가", tier: "GOLD_2" } });

    await updateMemberPeakTier(prisma, member.id, "DIAMOND_1");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.peakTier).toBe("DIAMOND_1");
    expect(after.tier).toBe("GOLD_2");
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberPeakTier(prisma, "00000000-0000-0000-0000-000000000000", "GOLD_3"),
    ).rejects.toThrow();
  });
});
```

`apps/dashboard/lib/mutations/update-member-age.test.ts` (same guard/setup block as above, then):

```ts
import { updateMemberAge } from "./update-member-age";

describe("updateMemberAge", () => {
  it("stores the two-digit birth year", async () => {
    const member = await prisma.member.create({ data: { realName: "가" } });

    await updateMemberAge(prisma, member.id, 94);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.age).toBe(94);
  });

  it("clears to null", async () => {
    const member = await prisma.member.create({ data: { realName: "가", age: 94 } });

    await updateMemberAge(prisma, member.id, null);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.age).toBeNull();
  });

  it("throws when the member does not exist", async () => {
    await expect(updateMemberAge(prisma, "00000000-0000-0000-0000-000000000000", 94)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/mutations/update-member-peak-tier.test.ts lib/mutations/update-member-age.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the implementations**

`apps/dashboard/lib/mutations/update-member-peak-tier.ts`:

```ts
import type { MemberTier, PrismaClient } from "@lolpamin/db";

/** 회원의 최고티어를 저장한다. 참고값이라 팀빌더 점수(산정티어)와 무관하다. */
export async function updateMemberPeakTier(
  prisma: PrismaClient,
  memberId: string,
  peakTier: MemberTier,
): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { peakTier } });
}
```

`apps/dashboard/lib/mutations/update-member-age.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";

/**
 * 출생연도 두 자리(모임 표기)를 저장한다. 입력 검증은 parseBirthYearInput이 먼저 한다.
 * null이면 화면은 카톡 닉네임에서 읽은 출생연도로 돌아간다.
 */
export async function updateMemberAge(prisma: PrismaClient, memberId: string, age: number | null): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { age } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/mutations/update-member-peak-tier.test.ts lib/mutations/update-member-age.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma apps/dashboard/lib/mutations/update-member-peak-tier.* apps/dashboard/lib/mutations/update-member-age.*
git commit -m "feat(db): peak tier column and member age/peak-tier mutations"
```

---

### Task 3: `/member-info` query — peak tier, masteries, stored age first

**Files:**
- Modify: `apps/dashboard/lib/queries/member-info.ts`
- Modify: `apps/dashboard/lib/queries/member-info.test.ts`

**Interfaces:**
- Consumes: `fullBirthYear` (Task 1), `Member.peakTier` (Task 2), `topMasteries`, `MasteryEntry` from `@lolpamin/core`.
- Produces: `MemberInfoRow` gains `peakTier: MemberTier` and `masteries: MasteryEntry[]`, loses `note`. `MemberInfoSort` gains `"peakTier"`.

- [ ] **Step 1: Write the failing tests**

Append inside the relevant `describe` blocks of `member-info.test.ts` (reuse the file's existing setup; `getMemberInfoListData` is already imported):

```ts
describe("getMemberInfoListData — admin fields", () => {
  it("carries the peak tier beside the rated tier", async () => {
    await prisma.member.create({ data: { realName: "가", tier: "GOLD_1", peakTier: "DIAMOND_2" } });

    const [row] = await getMemberInfoListData("");

    expect(row.tier).toBe("GOLD_1");
    expect(row.peakTier).toBe("DIAMOND_2");
  });

  it("sums masteries across every riot account and keeps the top three", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const main = await prisma.riotAccount.create({
      data: { puuid: "p-1", memberId: m.id, gameName: "본캐", tagLine: "KR1", lastSeenAt: new Date() },
    });
    const smurf = await prisma.riotAccount.create({
      data: { puuid: "p-2", memberId: m.id, gameName: "부캐", tagLine: "KR1", lastSeenAt: new Date() },
    });
    await prisma.championMastery.createMany({
      data: [
        { riotAccountId: main.id, championId: 1, level: 7, points: 100 },
        { riotAccountId: main.id, championId: 2, level: 7, points: 90 },
        { riotAccountId: main.id, championId: 3, level: 5, points: 80 },
        { riotAccountId: smurf.id, championId: 4, level: 5, points: 70 },
        { riotAccountId: smurf.id, championId: 3, level: 5, points: 60 },
      ],
    });

    const [row] = await getMemberInfoListData("");

    expect(row.masteries.map((e) => [e.championId, e.points])).toEqual([
      [3, 140],
      [1, 100],
      [2, 90],
    ]);
  });

  it("gives an empty mastery list to a member without accounts", async () => {
    await prisma.member.create({ data: { realName: "가" } });
    const [row] = await getMemberInfoListData("");
    expect(row.masteries).toEqual([]);
  });

  it("prefers the stored age over the nickname's birth year", async () => {
    await prisma.member.create({ data: { realName: "가", kakaoNickname: "가/94/닉#KR1", age: 96 } });
    await prisma.member.create({ data: { realName: "나", kakaoNickname: "나/01/닉#KR1" } });

    const rows = await getMemberInfoListData("", "realName", "asc");

    expect(rows.map((r) => r.birthYear)).toEqual([1996, 2001]);
  });

  it("sorts by peak tier score", async () => {
    await prisma.member.create({ data: { realName: "가", peakTier: "SILVER_1" } });
    await prisma.member.create({ data: { realName: "나", peakTier: "MASTER_0_200" } });
    await prisma.member.create({ data: { realName: "다", peakTier: "GOLD_4" } });

    const rows = await getMemberInfoListData("", "peakTier", "desc");

    expect(rows.map((r) => r.realName)).toEqual(["나", "다", "가"]);
  });
});
```

Also add `"peakTier"` to the list the existing `parseMemberInfoSort` "accepts the supported values" test iterates, if that test enumerates values.

Delete any assertion in the file that reads `row.note` (the field goes away).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/queries/member-info.test.ts`
Expected: FAIL on the new tests (`peakTier`/`masteries` undefined, birth year 1994 not 1996).

- [ ] **Step 3: Implement**

In `member-info.ts`:

1. Imports: `import { displayedRating, fullBirthYear, kakaoBirthYear, tierScore, topMasteries, type MasteryEntry } from "@lolpamin/core";`
2. `MemberInfoSort` union and `MEMBER_INFO_SORTS` array: add `"peakTier"` after `"tier"`.
3. `MemberInfoRow`: add `peakTier: MemberTier;` after `tier`, add `masteries: MasteryEntry[];` after `riotAccounts`, delete `note`. Update the `birthYear` doc comment:

```ts
  // Member.age(관리자가 고칠 수 있는 출생연도 두 자리)가 있으면 그것, 없으면 카톡 닉네임
  // `이름/출생연도/RiotID`의 두 번째 조각. 출생연도는 매칭 키의 일부라 닉네임을 바꿔도
  // 변하지 않으므로 저장값이 낡을 일이 없다. 화면은 두 자리로 줄여 보여준다.
  birthYear: number | null;
```

4. `MemberWithAbsorbed.riotAccounts` element type becomes `MemberInfoRiotAccount & { masteries?: MasteryEntry[] }`.
5. In `getMemberInfoListData`'s `findMany`, change the `riotAccounts` include to:

```ts
      riotAccounts: {
        select: {
          id: true,
          gameName: true,
          tagLine: true,
          masteries: { select: { championId: true, level: true, points: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      },
```

6. Row construction:

```ts
      const accounts = m.riotAccounts ?? [];
      ...
          birthYear:
            m.age !== null ? fullBirthYear(m.age) : kakaoNickname === "-" ? null : kakaoBirthYear(kakaoNickname),
          tier: m.tier,
          peakTier: m.peakTier,
          ...
          riotAccounts: accounts.map(({ id, gameName, tagLine }) => ({ id, gameName, tagLine })),
          masteries: topMasteries(accounts.flatMap((a) => a.masteries ?? [])),
```

(remove `note: m.note`).

7. `compareRows`: add

```ts
    case "peakTier": {
      const byScore = (tierScore(a.peakTier) - tierScore(b.peakTier)) * sign;
      return byScore !== 0 ? byScore : a.id.localeCompare(b.id);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/queries/member-info.test.ts`
Expected: PASS. (`MemberInfoTable`/`MemberInfoCard` still reference `note` and fail type-check — fixed in Task 7. Do not run `tsc` yet.)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/member-info.ts apps/dashboard/lib/queries/member-info.test.ts
git commit -m "feat(member-info): peak tier, summed masteries, stored age first"
```

---

### Task 4: `/member-admin` query

**Files:**
- Create: `apps/dashboard/lib/local-date.ts`
- Modify: `apps/dashboard/lib/queries/inactive.ts:34-39` (use `toLocalDate` from `lib/local-date.ts`)
- Create: `apps/dashboard/lib/queries/member-admin.ts`
- Create: `apps/dashboard/lib/queries/member-admin.test.ts`

**Interfaces:**
- Consumes: `fullBirthYear`, `kakaoBirthYear`, `tierScore`, `topMasteries`, `MasteryEntry` (core); `MemberInfoRiotAccount` type (`queries/member-info.ts`, type-only import).
- Produces:

```ts
export type MemberAdminSort = "realName" | "age" | "peakTier" | "tier" | "lastActive";
export type MemberAdminSortDirection = "asc" | "desc";
export function parseMemberAdminSort(value: string | undefined): MemberAdminSort; // default "realName"
export function parseMemberAdminDirection(value: string | undefined): MemberAdminSortDirection; // default "asc"
export interface MemberAdminRow {
  id: string;
  realName: string;              // "-" when unknown — MemberRealNameCell's convention
  age: number | null;            // stored Member.age (two digits)
  birthYear: number | null;      // shown value: age first, else nickname
  peakTier: MemberTier;
  tier: MemberTier;
  mainLane: Lane | null;
  subLane: Lane | null;
  riotAccounts: MemberInfoRiotAccount[];
  masteries: MasteryEntry[];
  lastActiveDate: string;        // YYYY-MM-DD, local
  daysSinceActive: number;
  note: string | null;
}
export async function getMemberAdminRows(
  prisma: PrismaClient,
  sort?: MemberAdminSort,
  dir?: MemberAdminSortDirection,
  now?: Date,
): Promise<MemberAdminRow[]>;
export function toLocalDate(date: Date): string; // lib/local-date.ts
```

- [ ] **Step 1: Extract `toLocalDate`**

`apps/dashboard/lib/local-date.ts`:

```ts
// YYYY-MM-DD in the server's local time — the value an <input type="date"> shows and
// what parseLastActiveInput reads back.
export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

In `lib/queries/inactive.ts` delete the private `toLocalDate` and `import { toLocalDate } from "@/lib/local-date";`.

- [ ] **Step 2: Write the failing test**

`apps/dashboard/lib/queries/member-admin.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberAdminRows, parseMemberAdminDirection, parseMemberAdminSort } from "./member-admin";

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

const NOW = new Date(2026, 8, 23, 12, 0, 0);

describe("parse helpers", () => {
  it("defaults to name ascending", () => {
    expect(parseMemberAdminSort(undefined)).toBe("realName");
    expect(parseMemberAdminSort("bogus")).toBe("realName");
    expect(parseMemberAdminSort("lastActive")).toBe("lastActive");
    expect(parseMemberAdminDirection(undefined)).toBe("asc");
    expect(parseMemberAdminDirection("desc")).toBe("desc");
  });
});

describe("getMemberAdminRows", () => {
  it("returns every editable field for an active member", async () => {
    await prisma.member.create({
      data: {
        realName: "가",
        kakaoNickname: "가/94/닉#KR1",
        age: 95,
        peakTier: "DIAMOND_1",
        tier: "EMERALD_2",
        mainLane: "MID",
        subLane: "SUP",
        note: "메모",
        lastActiveAt: new Date(2026, 8, 13, 20, 0, 0),
      },
    });

    const [row] = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(row).toMatchObject({
      realName: "가",
      age: 95,
      birthYear: 1995,
      peakTier: "DIAMOND_1",
      tier: "EMERALD_2",
      mainLane: "MID",
      subLane: "SUP",
      note: "메모",
      lastActiveDate: "2026-09-13",
      daysSinceActive: 9,
      riotAccounts: [],
      masteries: [],
    });
  });

  it("falls back to the nickname's birth year and to createdAt", async () => {
    await prisma.member.create({
      data: { realName: "가", kakaoNickname: "가/01/닉#KR1", createdAt: new Date(2026, 8, 20, 9, 0, 0) },
    });

    const [row] = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(row.age).toBeNull();
    expect(row.birthYear).toBe(2001);
    expect(row.lastActiveDate).toBe("2026-09-20");
    expect(row.daysSinceActive).toBe(3);
  });

  it("leaves tombstones out and sums the survivor's moved accounts", async () => {
    const survivor = await prisma.member.create({ data: { realName: "생존", discordUserId: "d-1" } });
    await prisma.member.create({ data: { kakaoNickname: "생존/94/닉#KR1", mergedIntoId: survivor.id } });
    const a1 = await prisma.riotAccount.create({
      data: { puuid: "p-1", memberId: survivor.id, gameName: "본", tagLine: "KR1", lastSeenAt: new Date() },
    });
    const a2 = await prisma.riotAccount.create({
      data: { puuid: "p-2", memberId: survivor.id, gameName: "부", tagLine: "KR1", lastSeenAt: new Date() },
    });
    await prisma.championMastery.createMany({
      data: [
        { riotAccountId: a1.id, championId: 10, level: 7, points: 50 },
        { riotAccountId: a2.id, championId: 10, level: 7, points: 60 },
        { riotAccountId: a2.id, championId: 20, level: 7, points: 100 },
      ],
    });

    const rows = await getMemberAdminRows(prisma, "realName", "asc", NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].riotAccounts).toHaveLength(2);
    expect(rows[0].masteries.map((e) => [e.championId, e.points])).toEqual([
      [10, 110],
      [20, 100],
    ]);
  });

  it("sorts by peak tier score, ties by id", async () => {
    await prisma.member.create({ data: { realName: "가", peakTier: "SILVER_1" } });
    await prisma.member.create({ data: { realName: "나", peakTier: "MASTER_0_200" } });
    await prisma.member.create({ data: { realName: "다", peakTier: "GOLD_4" } });

    const rows = await getMemberAdminRows(prisma, "peakTier", "desc", NOW);

    expect(rows.map((r) => r.realName)).toEqual(["나", "다", "가"]);
  });

  it("sorts by last active date, oldest first ascending", async () => {
    await prisma.member.create({ data: { realName: "가", lastActiveAt: new Date(2026, 8, 20) } });
    await prisma.member.create({ data: { realName: "나", lastActiveAt: new Date(2026, 7, 1) } });

    const rows = await getMemberAdminRows(prisma, "lastActive", "asc", NOW);

    expect(rows.map((r) => r.realName)).toEqual(["나", "가"]);
  });

  it("keeps members without a birth year last in both directions", async () => {
    await prisma.member.create({ data: { realName: "가", age: 94 } });
    await prisma.member.create({ data: { realName: "나" } });
    await prisma.member.create({ data: { realName: "다", age: 1 } });

    const asc = await getMemberAdminRows(prisma, "age", "asc", NOW);
    const desc = await getMemberAdminRows(prisma, "age", "desc", NOW);

    expect(asc.map((r) => r.realName)).toEqual(["가", "다", "나"]);
    expect(desc.map((r) => r.realName)).toEqual(["다", "가", "나"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/queries/member-admin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`apps/dashboard/lib/queries/member-admin.ts`:

```ts
import type { Lane, MemberTier, PrismaClient } from "@lolpamin/db";
import { fullBirthYear, kakaoBirthYear, tierScore, topMasteries, type MasteryEntry } from "@lolpamin/core";
import { toLocalDate } from "@/lib/local-date";
import type { MemberInfoRiotAccount } from "./member-info";

export type MemberAdminSort = "realName" | "age" | "peakTier" | "tier" | "lastActive";
export type MemberAdminSortDirection = "asc" | "desc";

const MEMBER_ADMIN_SORTS: MemberAdminSort[] = ["realName", "age", "peakTier", "tier", "lastActive"];

export function parseMemberAdminSort(value: string | undefined): MemberAdminSort {
  return MEMBER_ADMIN_SORTS.includes(value as MemberAdminSort) ? (value as MemberAdminSort) : "realName";
}

export function parseMemberAdminDirection(value: string | undefined): MemberAdminSortDirection {
  return value === "desc" ? "desc" : "asc";
}

export interface MemberAdminRow {
  id: string;
  realName: string;
  age: number | null;
  birthYear: number | null;
  peakTier: MemberTier;
  tier: MemberTier;
  mainLane: Lane | null;
  subLane: Lane | null;
  riotAccounts: MemberInfoRiotAccount[];
  masteries: MasteryEntry[];
  lastActiveDate: string;
  daysSinceActive: number;
  note: string | null;
}

const DAY_MS = 86_400_000;

// Unknown values go last whichever way the column is sorted — the same rule /member-info uses.
function compareNullable(a: number | string | null, b: number | string | null, sign: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b)) * sign;
}

function compareRows(
  a: MemberAdminRow & { activeAt: number },
  b: MemberAdminRow & { activeAt: number },
  sort: MemberAdminSort,
  sign: number,
): number {
  let byKey = 0;
  switch (sort) {
    case "realName":
      byKey = compareNullable(a.realName === "-" ? null : a.realName, b.realName === "-" ? null : b.realName, sign);
      break;
    case "age":
      byKey = compareNullable(a.birthYear, b.birthYear, sign);
      break;
    case "peakTier":
      byKey = (tierScore(a.peakTier) - tierScore(b.peakTier)) * sign;
      break;
    case "tier":
      byKey = (tierScore(a.tier) - tierScore(b.tier)) * sign;
      break;
    case "lastActive":
      byKey = (a.activeAt - b.activeAt) * sign;
      break;
  }
  return byKey !== 0 ? byKey : a.id.localeCompare(b.id);
}

/**
 * /member-admin의 행. 활성 회원(묘비 제외)만. 모스트는 회원에게 붙은 모든 라이엇 계정의
 * 숙련도를 합산한 상위 3개다 — 흡수는 RiotAccount.memberId를 생존자로 옮기므로 묘비를 따로
 * 볼 필요가 없다. 활동일은 getInactiveMembers와 같은 계산(lastActiveAt ?? createdAt에서
 * 지금까지 내림한 일수)이다.
 */
export async function getMemberAdminRows(
  prisma: PrismaClient,
  sort: MemberAdminSort = "realName",
  dir: MemberAdminSortDirection = "asc",
  now: Date = new Date(),
): Promise<MemberAdminRow[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: {
      absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      riotAccounts: {
        select: {
          id: true,
          gameName: true,
          tagLine: true,
          masteries: { select: { championId: true, level: true, points: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  const rows = members.map((m) => {
    const nickname = m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
    const activeAt = m.lastActiveAt ?? m.createdAt;
    return {
      id: m.id,
      realName: m.realName ?? "-",
      age: m.age,
      birthYear: m.age !== null ? fullBirthYear(m.age) : nickname ? kakaoBirthYear(nickname) : null,
      peakTier: m.peakTier,
      tier: m.tier,
      mainLane: m.mainLane,
      subLane: m.subLane,
      riotAccounts: m.riotAccounts.map(({ id, gameName, tagLine }) => ({ id, gameName, tagLine })),
      masteries: topMasteries(m.riotAccounts.flatMap((a) => a.masteries)),
      lastActiveDate: toLocalDate(activeAt),
      daysSinceActive: Math.floor((now.getTime() - activeAt.getTime()) / DAY_MS),
      note: m.note,
      activeAt: activeAt.getTime(),
    };
  });

  const sign = dir === "desc" ? -1 : 1;
  return rows.sort((a, b) => compareRows(a, b, sort, sign)).map(({ activeAt: _activeAt, ...row }) => row);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/queries/member-admin.test.ts lib/queries/inactive.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/local-date.ts apps/dashboard/lib/queries/inactive.ts apps/dashboard/lib/queries/member-admin.*
git commit -m "feat(member-admin): row query with summed masteries and activity days"
```

---

### Task 5: Server actions and shared cells

**Files:**
- Create: `apps/dashboard/app/member-admin/actions.ts`
- Delete: `apps/dashboard/app/member-info/actions.ts`
- Modify: `apps/dashboard/components/MemberLaneCell.tsx:7`, `MemberNoteCell.tsx:5`, `MemberRiotAccountsCell.tsx:6` (import path)
- Modify: `apps/dashboard/app/rift/actions.ts` (`updateMemberRealNameAction`, `updateMemberTierAction` revalidate)
- Modify: `apps/dashboard/app/inactive/actions.ts` (revalidate)
- Modify: `apps/dashboard/app/link-accounts/actions.ts` (`refreshRiotIdsAction` revalidate)
- Modify: `apps/dashboard/components/MemberTierCell.tsx` (`field` prop)
- Create: `apps/dashboard/components/MemberAgeCell.tsx`
- Create: `apps/dashboard/components/MasteryChampions.tsx`
- Create: `apps/dashboard/components/DailyRefreshButton.tsx`
- Modify: `apps/dashboard/components/AccountMappingPanel.tsx` (use `DailyRefreshButton`)

**Interfaces:**
- Consumes: `updateMemberPeakTier`, `updateMemberAge` (Task 2); `parseBirthYearInput`, `birthYearLabel` (Task 1); `refreshChampionMasteries`, `getMasteryRefreshAvailability`, `REFRESH_MASTERIES_ERRORS`, `MasteryRefreshResult` (`lib/mutations/refresh-champion-masteries.ts`); `lookupChampionMasteries` (`lib/riot-api/mastery.ts`); `riotIdRefreshStatusAction`, `refreshRiotIdsAction`, `RiotIdRefreshStatus` (`app/link-accounts/actions.ts`); `championIdByKey`, `championIcon`, `championName` (`lib/ddragon/assets.ts`).
- Produces (all in `app/member-admin/actions.ts`, each returns `{ error: string | null }` unless noted):
  - `updateMemberNoteAction(memberId, note)`, `updateMemberLaneAction(memberId, slot, lane)`, `registerRiotAccountByLookupAction(memberId, text)`, `removeRiotAccountAction(riotAccountId)` — moved unchanged except revalidation
  - `updateMemberPeakTierAction(memberId: string, peakTier: MemberTier)`
  - `updateMemberAgeAction(memberId: string, raw: string)`
  - `masteryRefreshStatusAction(): Promise<{ allowed: boolean; lastRefreshedAt: string | null; accountCount: number }>`
  - `refreshMasteriesAction(): Promise<{ result: MasteryRefreshResult | null; error: string | null }>`
- Components: `<MemberTierCell memberId tier isAdmin field?="tier"|"peakTier" />`, `<MemberAgeCell memberId age birthYear />`, `<MasteryChampions masteries />`, `<DailyRefreshButton kind="riotIds"|"masteries" />`

- [ ] **Step 1: Before writing `MasteryChampions`, check for an existing one**

Run: `grep -rln "championIdByKey" apps/dashboard/components`
If the captain-draft session already added a mastery icon component, reuse it (adapt props) instead of creating `MasteryChampions.tsx`, and use its name everywhere this plan says `MasteryChampions`.

- [ ] **Step 2: Move and extend the actions**

Create `app/member-admin/actions.ts` by moving the whole contents of `app/member-info/actions.ts` into it, then:

- In every moved action, replace `revalidatePath("/member-info");` with

```ts
  revalidatePath("/member-admin");
  revalidatePath("/member-info");
```

- Add imports and the four new actions:

```ts
import type { Lane, MemberTier } from "@lolpamin/db";
import { isLane, parseBirthYearInput, parseRiotId, TIER_SCORES } from "@lolpamin/core";
import { updateMemberPeakTier } from "@/lib/mutations/update-member-peak-tier";
import { updateMemberAge } from "@/lib/mutations/update-member-age";
import {
  getMasteryRefreshAvailability,
  refreshChampionMasteries,
  REFRESH_MASTERIES_ERRORS,
  type MasteryRefreshResult,
} from "@/lib/mutations/refresh-champion-masteries";
import { lookupChampionMasteries } from "@/lib/riot-api/mastery";

export async function updateMemberPeakTierAction(
  memberId: string,
  peakTier: MemberTier,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // updateMemberTierAction과 같은 이유로 enum 값인지 여기서 확인한다.
  if (!Object.hasOwn(TIER_SCORES, peakTier)) {
    return { error: "알 수 없는 티어입니다." };
  }

  try {
    await updateMemberPeakTier(prisma, memberId, peakTier);
  } catch {
    return { error: "최고티어를 저장하지 못했습니다." };
  }

  revalidatePath("/member-admin");
  revalidatePath("/member-info");
  return { error: null };
}

export async function updateMemberAgeAction(memberId: string, raw: string): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = parseBirthYearInput(raw);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await updateMemberAge(prisma, memberId, parsed.age);
  } catch {
    return { error: "나이를 저장하지 못했습니다." };
  }

  revalidatePath("/member-admin");
  revalidatePath("/member-info");
  return { error: null };
}

export interface MasteryRefreshStatus {
  allowed: boolean;
  lastRefreshedAt: string | null;
  accountCount: number;
}

export async function masteryRefreshStatusAction(): Promise<MasteryRefreshStatus> {
  await requireAdmin();
  const { allowed, lastRefreshedAt, accountCount } = await getMasteryRefreshAvailability(prisma);
  return { allowed, lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null, accountCount };
}

export async function refreshMasteriesAction(): Promise<{ result: MasteryRefreshResult | null; error: string | null }> {
  await requireAdmin();

  try {
    const result = await refreshChampionMasteries(prisma, lookupChampionMasteries);
    revalidatePath("/member-admin");
    revalidatePath("/member-info");
    return { result, error: null };
  } catch (error) {
    // 하루 제한은 일부러 던진 안내다 — 그대로 보여 준다.
    if (error instanceof Error && error.message === REFRESH_MASTERIES_ERRORS.tooSoon) {
      return { result: null, error: error.message };
    }
    console.error(error);
    return { result: null, error: "숙련도 갱신 중 오류가 났습니다." };
  }
}
```

(Merge the `@lolpamin/db` / `@lolpamin/core` imports with the moved ones rather than duplicating lines. `lookupChampionMasteries(puuid, deps = {})` is assignable to `LookupChampionMasteries` the same way `lookupRiotAccountByPuuid` is passed in `link-accounts/actions.ts`.)

Delete `app/member-info/actions.ts`. Change the import path to `@/app/member-admin/actions` in `MemberLaneCell.tsx`, `MemberNoteCell.tsx`, `MemberRiotAccountsCell.tsx`.

Add `revalidatePath("/member-admin");` and `revalidatePath("/member-info");` to `updateMemberRealNameAction` and `updateMemberTierAction` in `app/rift/actions.ts`, to `updateMemberLastActiveAction` in `app/inactive/actions.ts` (only `/member-admin`), and `revalidatePath("/member-admin");` to `refreshRiotIdsAction` in `app/link-accounts/actions.ts`.

- [ ] **Step 3: `MemberTierCell` gets a `field` prop**

In `components/MemberTierCell.tsx`:

```tsx
import { updateMemberTierAction } from "@/app/rift/actions";
import { updateMemberPeakTierAction } from "@/app/member-admin/actions";

export function MemberTierCell({
  memberId,
  tier,
  isAdmin,
  field = "tier",
}: {
  memberId: string;
  tier: MemberTier;
  isAdmin: boolean;
  // 같은 셀이 산정티어(Member.tier)와 최고티어(Member.peakTier) 둘 다 편집한다.
  field?: "tier" | "peakTier";
}) {
```

and in `save`:

```tsx
      const action = field === "peakTier" ? updateMemberPeakTierAction : updateMemberTierAction;
      const { error: actionError } = await action(memberId, next);
```

and `title={field === "peakTier" ? "최고티어 수정" : "산정티어 수정"}`.

- [ ] **Step 4: `MemberAgeCell`**

`components/MemberAgeCell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { birthYearLabel } from "@lolpamin/core";
import { updateMemberAgeAction } from "@/app/member-admin/actions";

// 저장값(Member.age)이 없으면 닉네임에서 읽은 출생연도를 흐리게 보여 준다 — 비워 둬도
// 화면에는 그 값이 나간다는 걸 관리자가 알 수 있게.
export function MemberAgeCell({
  memberId,
  age,
  birthYear,
}: {
  memberId: string;
  age: number | null;
  birthYear: number | null;
}) {
  const router = useRouter();
  const stored = age === null ? "" : String(age).padStart(2, "0");
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setIsEditing(false);
    if (value.trim() === stored) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberAgeAction(memberId, value);
      setError(actionError);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        inputMode="numeric"
        placeholder={birthYearLabel(birthYear)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(stored);
            setIsEditing(false);
          }
        }}
        className="w-full rounded-md border border-accent/50 bg-inset px-1.5 py-1 text-center text-[13.5px] text-fg outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      title="클릭해서 출생연도 수정 (비우면 카톡 닉네임 값)"
      onClick={() => {
        // MemberRealNameCell과 같은 이유로 편집을 열 때마다 현재 prop에서 다시 잡는다.
        setValue(stored);
        setIsEditing(true);
      }}
      className={`w-full text-center text-[13.5px] hover:underline ${age !== null ? "text-fg-2" : "text-ghost"}`}
    >
      {isPending ? "…" : birthYearLabel(birthYear)}
      {error && <span className="ml-1 block text-[11.5px] text-danger-soft">{error}</span>}
    </button>
  );
}
```

- [ ] **Step 5: `MasteryChampions`**

`components/MasteryChampions.tsx` (no `"use client"` — plain markup, usable from server components):

```tsx
import type { MasteryEntry } from "@lolpamin/core";
import { championIcon, championIdByKey, championName } from "@/lib/ddragon/assets";

// 합산 숙련도 상위 챔피언 아이콘. Data Dragon이 모르는 id(커밋된 패치보다 새 챔피언)는
// 빈 칸으로 — 페이지가 깨지면 안 된다.
export function MasteryChampions({ masteries }: { masteries: MasteryEntry[] }) {
  if (masteries.length === 0) return <div className="text-center text-ghost">-</div>;
  return (
    <div className="flex justify-center gap-1">
      {masteries.map((m) => {
        const id = championIdByKey(m.championId);
        const src = id ? championIcon(id) : null;
        const title = `${id ? championName(id) : "알 수 없는 챔피언"} · ${m.points.toLocaleString("ko-KR")}점`;
        return src ? (
          <img key={m.championId} src={src} alt={title} title={title} loading="lazy" className="h-6 w-6 rounded" />
        ) : (
          <span key={m.championId} title={title} className="h-6 w-6 rounded bg-inset" />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `DailyRefreshButton` and swap it into `AccountMappingPanel`**

`components/DailyRefreshButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { refreshRiotIdsAction, riotIdRefreshStatusAction } from "@/app/link-accounts/actions";
import { masteryRefreshStatusAction, refreshMasteriesAction } from "@/app/member-admin/actions";

type Kind = "riotIds" | "masteries";

const COPY: Record<Kind, { label: string; title: string; confirm: (n: number) => string; empty: string }> = {
  riotIds: {
    label: "PUUID로 라이엇 ID 갱신",
    title: "저장된 PUUID로 현재 라이엇 ID를 다시 읽어옵니다 (하루 한 번)",
    confirm: (n) => `계정 ${n}개의 PUUID로 현재 라이엇 ID를 다시 읽어옵니다. 하루 한 번만 할 수 있습니다. 계속할까요?`,
    empty: "갱신할 라이엇 계정이 없습니다.",
  },
  masteries: {
    label: "모스트 챔피언 갱신",
    title: "회원 계정의 챔피언 숙련도를 다시 받아옵니다 (하루 한 번)",
    confirm: (n) => `계정 ${n}개의 챔피언 숙련도를 다시 받아옵니다. 하루 한 번만 할 수 있습니다. 계속할까요?`,
    empty: "숙련도를 받을 라이엇 계정이 없습니다.",
  },
};

const KEY_EXPIRED = "Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY).";

// 하루 한 번짜리 Riot 배치 버튼. 상태를 먼저 물어 제한·대상 수를 확인하고, 확인창을 거쳐
// 실행한 뒤 결과를 옆에 적는다. 제한의 근거는 SiteSetting이라 관리자가 여럿이어도 같다.
export function DailyRefreshButton({ kind }: { kind: Kind }) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = COPY[kind];

  async function run(): Promise<string> {
    const status = kind === "riotIds" ? await riotIdRefreshStatusAction() : await masteryRefreshStatusAction();
    if (status.accountCount === 0) return copy.empty;
    if (!status.allowed) {
      const last = status.lastRefreshedAt ? new Date(status.lastRefreshedAt).toLocaleString("ko-KR") : "";
      return `오늘은 이미 갱신했습니다 (${last}). 24시간 뒤에 다시 시도해 주세요.`;
    }
    if (!window.confirm(copy.confirm(status.accountCount))) return "";

    if (kind === "riotIds") {
      const { result, error } = await refreshRiotIdsAction();
      if (error || !result) return error ?? "갱신하지 못했습니다.";
      const summary = `변경 ${result.updated} · 그대로 ${result.unchanged} · 못 찾음 ${result.notFound}`;
      return result.unauthorized ? `${KEY_EXPIRED} 중단 전까지 ${summary}` : summary;
    }
    const { result, error } = await refreshMasteriesAction();
    if (error || !result) return error ?? "갱신하지 못했습니다.";
    const summary = `갱신 ${result.refreshed} · 못 찾음 ${result.notFound}`;
    return result.unauthorized ? `${KEY_EXPIRED} 중단 전까지 ${summary}` : summary;
  }

  async function handleClick() {
    setIsRunning(true);
    setMessage(null);
    try {
      const text = await run();
      setMessage(text || null);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        title={copy.title}
        className={`rounded-lg border px-3.5 py-2 text-[13px] font-extrabold ${
          isRunning
            ? "cursor-not-allowed border-ink/[.06] bg-hover text-ghost"
            : "cursor-pointer border-orange/45 bg-orange/[.16] text-orange"
        }`}
      >
        {isRunning ? "갱신 중..." : copy.label}
      </button>
      {message && <span className="text-[12.5px] text-muted">{message}</span>}
    </div>
  );
}
```

In `AccountMappingPanel.tsx`: delete the `refreshStatus`/`isRefreshing` state (lines ~37-38), the `handleRefreshRiotIds` function, the "PUUID로 라이엇 ID 갱신" `<button>` and its `{refreshStatus && …}` span; put `<DailyRefreshButton kind="riotIds" />` where the button was; drop `riotIdRefreshStatusAction`, `refreshRiotIdsAction` from its import list; add `import { DailyRefreshButton } from "./DailyRefreshButton";`.

- [ ] **Step 7: Type-check what exists so far**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: errors only in `components/MemberInfoTable.tsx` / `MemberInfoCard.tsx` (the removed `note` field, fixed in Task 7). Anything else must be fixed now.

- [ ] **Step 8: Run the full dashboard test suite**

Run: `cd apps/dashboard && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/app apps/dashboard/components
git commit -m "feat(member-admin): actions, age/peak-tier cells, mastery icons, daily refresh button"
```

---

### Task 6: `/member-admin` page, table and nav

**Files:**
- Create: `apps/dashboard/app/member-admin/page.tsx`
- Create: `apps/dashboard/components/MemberAdminTable.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx` (activeNav union, ops group item)

**Interfaces:**
- Consumes: `getMemberAdminRows`, `parseMemberAdminSort`, `parseMemberAdminDirection`, `MemberAdminRow`, `MemberAdminSort`, `MemberAdminSortDirection` (Task 4); cells from Task 5; existing `MemberRealNameCell`, `MemberLaneCell`, `MemberRiotAccountsCell`, `InactiveLastActiveCell`, `MemberNoteCell`; `INACTIVITY_THRESHOLD_DAYS`, `LONG_INACTIVITY_THRESHOLD_DAYS` (core).

- [ ] **Step 1: Nav**

In `AppShell.tsx` add `| "member-admin"` to the `activeNav` union, and make it the first item of the `ops` group:

```ts
        { key: "member-admin", href: "/member-admin", label: "회원 관리", icon: "file-text" },
```

Update the `desktopOnly` comment's list of screens to include 회원 관리.

- [ ] **Step 2: Table**

`components/MemberAdminTable.tsx`:

```tsx
import Link from "next/link";
import { INACTIVITY_THRESHOLD_DAYS, LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";
import type { MemberAdminRow, MemberAdminSort, MemberAdminSortDirection } from "@/lib/queries/member-admin";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberAgeCell } from "@/components/MemberAgeCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberLaneCell } from "@/components/MemberLaneCell";
import { MemberRiotAccountsCell } from "@/components/MemberRiotAccountsCell";
import { MasteryChampions } from "@/components/MasteryChampions";
import { InactiveLastActiveCell } from "@/components/InactiveLastActiveCell";
import { MemberNoteCell } from "@/components/MemberNoteCell";

// 순번·나이·활동일은 몇 글자라 고정폭, 티어 두 칸은 select라 조금 넓게. 라이엇 계정(칩 +
// 입력창)과 비고가 남는 폭을 나눠 가진다.
const GRID = "grid-cols-[40px_88px_56px_104px_104px_72px_72px_1.4fr_96px_136px_64px_1fr]";

// 이름·나이는 오름차순, 티어는 높은 쪽부터, 최근 활동은 오래된 쪽부터 시작한다 — 이 화면에서
// 찾는 것은 "누가 오래 안 나왔나"다.
const START_DIR: Record<MemberAdminSort, MemberAdminSortDirection> = {
  realName: "asc",
  age: "asc",
  peakTier: "desc",
  tier: "desc",
  lastActive: "asc",
};

function daysClassName(days: number): string {
  if (days >= LONG_INACTIVITY_THRESHOLD_DAYS) return "text-danger-soft";
  if (days >= INACTIVITY_THRESHOLD_DAYS) return "text-orange";
  return "text-muted";
}

export function MemberAdminTable({
  rows,
  sort,
  dir,
}: {
  rows: MemberAdminRow[];
  sort: MemberAdminSort;
  dir: MemberAdminSortDirection;
}) {
  function SortLink({ sortKey, label }: { sortKey: MemberAdminSort; label: string }) {
    const nextDir = sort === sortKey ? (dir === "asc" ? "desc" : "asc") : START_DIR[sortKey];
    const mark = sort === sortKey ? (dir === "desc" ? " ↓" : " ↑") : "";
    return (
      <Link href={`/member-admin?sort=${sortKey}&dir=${nextDir}`} className="text-center hover:text-fg-2">
        {label}
        {mark}
      </Link>
    );
  }

  return (
    <div>
      <div
        className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
      >
        <div className="text-center">순번</div>
        <SortLink sortKey="realName" label="이름" />
        <SortLink sortKey="age" label="나이" />
        <SortLink sortKey="peakTier" label="최고티어" />
        <SortLink sortKey="tier" label="산정티어" />
        <div className="text-center">주라인</div>
        <div className="text-center">부라인</div>
        <div className="text-center">라이엇 계정</div>
        <div className="text-center">모스트</div>
        <SortLink sortKey="lastActive" label="최근 활동 날짜" />
        <div className="text-center">활동일</div>
        <div className="text-center">비고</div>
      </div>
      {rows.length === 0 && <div className="px-5 py-8 text-center text-[13.5px] text-ghost">회원이 없습니다.</div>}
      {rows.map((m, index) => (
        <div
          key={m.id}
          className={`grid ${GRID} items-center gap-3 border-b border-ink/[.04] px-5 py-3 text-[14px] hover:bg-hover ${
            index % 2 === 1 ? "bg-surface-2" : ""
          }`}
        >
          <div className="text-center font-mono text-[12.5px] text-faint">{index + 1}</div>
          <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin />
          <MemberAgeCell memberId={m.id} age={m.age} birthYear={m.birthYear} />
          <MemberTierCell memberId={m.id} tier={m.peakTier} field="peakTier" isAdmin />
          <MemberTierCell memberId={m.id} tier={m.tier} field="tier" isAdmin />
          <MemberLaneCell memberId={m.id} slot="main" lane={m.mainLane} isAdmin />
          <MemberLaneCell memberId={m.id} slot="sub" lane={m.subLane} isAdmin />
          <MemberRiotAccountsCell memberId={m.id} accounts={m.riotAccounts} isAdmin />
          <MasteryChampions masteries={m.masteries} />
          <InactiveLastActiveCell memberId={m.id} lastActiveDate={m.lastActiveDate} isAdmin />
          <div className={`text-center font-mono text-[12.5px] ${daysClassName(m.daysSinceActive)}`}>
            D+{m.daysSinceActive}
          </div>
          <MemberNoteCell memberId={m.id} note={m.note} isAdmin />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Page**

`app/member-admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DailyRefreshButton } from "@/components/DailyRefreshButton";
import { MemberAdminTable } from "@/components/MemberAdminTable";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getMemberAdminRows, parseMemberAdminDirection, parseMemberAdminSort } from "@/lib/queries/member-admin";

// AppShell과 회원 조회 모두 살아 있는 DB 행을 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function MemberAdminPage({
  searchParams,
}: {
  searchParams: { sort?: string; dir?: string };
}) {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const sort = parseMemberAdminSort(searchParams.sort);
  const dir = parseMemberAdminDirection(searchParams.dir);
  const rows = await getMemberAdminRows(prisma, sort, dir);

  return (
    <AppShell activeNav="member-admin" pageTitle="회원 관리" pageDesc="회원 명부 편집 · 티어 · 라인 · 활동" desktopOnly>
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <DailyRefreshButton kind="riotIds" />
          <DailyRefreshButton kind="masteries" />
        </div>
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberAdminTable rows={rows} sort={sort} dir={dir} />
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: only the Task 7 `MemberInfoTable`/`MemberInfoCard` errors remain.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/member-admin/page.tsx apps/dashboard/components/MemberAdminTable.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(member-admin): operator page with editable member roster"
```

---

### Task 7: `/member-info` becomes read-only

**Files:**
- Modify: `apps/dashboard/app/member-info/page.tsx`
- Modify: `apps/dashboard/components/MemberInfoTable.tsx`
- Modify: `apps/dashboard/components/MemberInfoCard.tsx`

**Interfaces:**
- Consumes: `MemberInfoRow.peakTier`, `.masteries` (Task 3); `MasteryChampions` (Task 5); `tierLabel`, `tierScore`, `laneLabel` (core).

- [ ] **Step 1: Page**

In `app/member-info/page.tsx` remove the `getCurrentAdmin` import and call (drop it from `Promise.all`), and render `<MemberInfoTable rows={rows} sort={sort} dir={dir} query={query} />` without `isAdmin`.

- [ ] **Step 2: Table**

In `components/MemberInfoTable.tsx`:

- Remove the `isAdmin` prop, `GRID_ADMIN`/`GRID_PUBLIC`, and the `MemberTierCell`, `MemberLaneCell`, `MemberNoteCell`, `MemberRiotAccountsCell` imports. Import `tierLabel`, `tierScore`, `laneLabel` from `@lolpamin/core` and `MasteryChampions`.
- New grid (name, age, metrics, 최고티어, 산정티어, 주, 부, 계정, 모스트):

```ts
// 이름은 실명이라 석 자 안팎, 나이는 두 자리다 — 둘 다 고정폭으로 두고 남는 폭은 라이엇
// 계정이 가져간다. 협곡·칼바람 10칸은 한 덩어리(600px)로 묶고 안에서 균등하게 나눈다 —
// METRICS_GRID 참고. 이 화면은 보기 전용이라 편집 칸이 없다 — 편집은 /member-admin.
const GRID = "grid-cols-[80px_56px_600px_80px_80px_56px_56px_1.2fr_96px]";
```

- Top header row: after the 협곡/칼바람 box, six empty `<div />` (최고, 산정, 주, 부, 계정, 모스트) — remove the `{isAdmin && <div />}`.
- Second header row: replace `<SortLink sortKey="tier" label="현재티어" … />` with

```tsx
          <SortLink sortKey="peakTier" label="최고티어" align="center" />
          <SortLink sortKey="tier" label="산정티어" align="center" />
```

  keep 주라인/부라인/라이엇 계정, add `<div className="text-center">모스트</div>`, remove the 비고 header.
- Row cells after the metrics block become plain read-only markup:

```tsx
            <TierText tier={m.peakTier} />
            <TierText tier={m.tier} />
            <div className={`text-center ${m.mainLane ? "text-fg-2" : "text-ghost"}`}>{laneLabel(m.mainLane)}</div>
            <div className={`text-center ${m.subLane ? "text-fg-2" : "text-ghost"}`}>{laneLabel(m.subLane)}</div>
            <div className="flex flex-wrap justify-center gap-1">
              {m.riotAccounts.length === 0 ? (
                <span className="text-ghost">-</span>
              ) : (
                m.riotAccounts.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[12px] text-success-soft"
                  >
                    {a.gameName}#{a.tagLine}
                  </span>
                ))
              )}
            </div>
            <MasteryChampions masteries={m.masteries} />
```

  with a local helper above the component:

```tsx
// 점수 0(아이언·언랭)은 "점수를 매기지 않는 구간"이라 흐리게 둔다 — MemberTierCell의 보기 모드와 같다.
function TierText({ tier }: { tier: MemberInfoRow["tier"] }) {
  return (
    <div className={`truncate text-center ${tierScore(tier) === 0 ? "text-ghost" : "text-fg-2"}`}>{tierLabel(tier)}</div>
  );
}
```

- Mobile list: `<MemberInfoCard key={m.id} row={m} />`.

- [ ] **Step 3: Card**

In `components/MemberInfoCard.tsx`: drop the `isAdmin` prop and the 비고 line; replace the single tier span in the header with

```tsx
        <span className="ml-auto flex-none text-[12.5px] text-fg-2">
          <span className={tierScore(row.peakTier) === 0 ? "text-ghost" : ""}>최고 {tierLabel(row.peakTier)}</span>
          {" · "}
          <span className={tierScore(row.tier) === 0 ? "text-ghost" : ""}>산정 {tierLabel(row.tier)}</span>
        </span>
```

and after the riot-account chips add

```tsx
      {row.masteries.length > 0 && (
        <div className="mt-1 flex">
          <MasteryChampions masteries={row.masteries} />
        </div>
      )}
```

(import `MasteryChampions`). Remove the "폰에서는 보기만 한다" comment's reference to editing — the whole page is read-only now.

- [ ] **Step 4: Type-check and test**

Run: `cd apps/dashboard && npx tsc --noEmit && npx vitest run`
Expected: tsc clean, all tests PASS.

- [ ] **Step 5: Manual check in the browser**

Run `npm run dev --workspace=dashboard`, then:
- `/member-info` signed out and signed in: no input/select anywhere, no 비고 column, 최고티어·산정티어·모스트 columns present; at 375px width the cards show 최고/산정 and icons.
- `/member-admin` signed out → redirected to `/login`. Signed in: edit each column once (이름, 나이 `1994` → shows `94`, 나이 `abc` → Korean error, 최고티어, 산정티어, 주/부라인, 라이엇 계정 add/remove, 최근 활동 날짜, 비고) and confirm `/member-info` reflects it.
- 모스트 챔피언 갱신 button: with no `RIOT_API_KEY` → key-expired message; a second click after a real run → "오늘은 이미 갱신했습니다".
- `/link-accounts` still shows the PUUID 갱신 button and it behaves the same.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/member-info apps/dashboard/components/MemberInfoTable.tsx apps/dashboard/components/MemberInfoCard.tsx
git commit -m "feat(member-info): read-only viewer with peak/rated tier and top masteries"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

- In "What this is": `apps/dashboard` bullet — mention the read-only `/member-info` and the operator `/member-admin` roster.
- In the tier paragraph ("Separately from MMR, each member carries a solo-queue `tier`…"): say the screen name is 산정티어, and add one sentence: `Member.peakTier` (최고티어) is a hand-entered reference that feeds no score.
- Add a paragraph after the `/member-info` MMR sentence:

```markdown
`/member-info` is read-only for everyone, admins included. Every member edit lives on
`/member-admin` (operator, desktop-only): 이름, 나이, 최고/산정티어, 주/부라인, 라이엇 계정,
최근 활동 날짜, 비고, plus the two once-a-day Riot batches (PUUID → Riot ID, champion
masteries) as `DailyRefreshButton`. 나이 is `Member.age` (the two-digit birth year imports
read from the nickname) when set, else the nickname's — both pages use that rule. 모스트 is
`topMasteries` over every `ChampionMastery` row of the member's accounts, summed at read time.
```

- In "Mobile": operator screens become nine — add `member-admin` to the list.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: member-admin page and read-only member-info"
```
