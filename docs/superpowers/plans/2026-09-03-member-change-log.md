# 회원 변경 로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원을 연결·해제·개명·삭제·정규화한 사실을 `MemberChangeLog`에 남기고, 누가 언제 했는지를 `/link-accounts` 아래 「변경 기록」에서 읽을 수 있게 한다.

**Architecture:** 새 테이블 `MemberChangeLog` 하나와, 트랜잭션 클라이언트를 받아 한 행을 쓰는 순수 헬퍼 `recordMemberChange` 하나를 둔다. 회원을 바꾸는 다섯 개의 뮤테이션이 `adminId`를 인자로 받고 **자기 트랜잭션 안에서** 그 헬퍼를 부른다 — 뮤테이션이 롤백되면 로그도 함께 사라진다. 서버 액션이 `requireAdmin()`의 결과에서 `adminId`를 채우므로 클라이언트가 보낸 값은 쓰지 않는다. 화면은 읽기 전용 서버 컴포넌트 하나다.

**Tech Stack:** Prisma 5 / PostgreSQL 16, Next.js 14 App Router (서버 액션), vitest + 실제 Postgres 테스트 DB, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-01-game-history-and-audit-log-design.md`
(이 스펙의 「경기 기록」·「되돌리기」 부분은 이미 구현되어 있다. 이 계획은 그 문서가
「미구현」으로 표시해 둔 `MemberChangeLog` 범위만 다룬다.)

## Global Constraints

- **UI 문구·라벨은 한글, 코드·식별자·주석·커밋 메시지는 영어.** (프로젝트 규약)
- **DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다.** 가드가 없으면 Prisma가 조용히 `DATABASE_URL`로 떨어져 `resetDatabase()`가 개발 데이터를 지운다.
- **여러 행을 쓰는 변경은 `prisma.$transaction` 안에서 한다.**
- **뮤테이션은 `prisma`(또는 `Prisma.TransactionClient`)를 첫 인자로 받는다.** 테스트가 테스트 클라이언트를 주입할 수 있어야 한다.
- **모든 뮤테이션 서버 액션은 데이터에 손대기 전에 `await requireAdmin()`을 호출한다.** `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 강제한다.
- **`memberId`와 `adminId`에 외래키를 걸지 않는다.** 대상이 삭제돼도 「누가 무엇을 했는지」는 남아야 한다. 조회 실패는 화면에서 「삭제된 관리자」로 표시하고, 회원은 `memberLabel` 스냅샷으로 읽는다.
- **DB를 읽는 페이지는 `export const dynamic = "force-dynamic"`을 선언한다.** (`/link-accounts`에는 이미 있다.)
- `before`/`after`에 담는 값은 스펙의 표를 그대로 따른다:

  | action | before | after |
  |---|---|---|
  | `ABSORB` | 흡수된 회원의 카톡 닉네임 | 생존자의 표시 이름 |
  | `RELEASE` | 생존자의 표시 이름 | 풀려난 회원의 카톡 닉네임 |
  | `RENAME` | 이전 실명 | 새 실명 |
  | `DELETE` | 삭제된 회원의 표시 이름 | `null` |
  | `NORMALIZE` | 정규화 전 닉네임 | 정규화 후 닉네임 |

## 스펙과 달라지는 점 (의도된 것)

구현하며 스펙보다 넓히거나 좁힌 곳. 실행자는 이대로 만들면 된다.

1. **`normalizeKakaoNicknames`는 `NORMALIZE`만이 아니라 `ABSORB`·`RENAME`도 남긴다.**
   스펙 예시는 스크립트가 남기는 줄로 정규화만 보여주지만, 이 스크립트는 실제로 회원을
   병합(`mergedIntoId` 주입)하고 빈 실명을 채우기도 한다. 병합을 로그에 남기지 않으면
   이 테이블을 만든 이유(「끊고 나면 연결했던 사실 자체가 사라진다」)가 스크립트 경로에서
   그대로 재현된다. 셋 다 `adminId = null`이므로 화면에서 「스크립트」로 묶여 보인다.
2. **`deleteMember`는 대상 회원 한 행에 대해서만 `DELETE`를 남긴다.** 함께 지워지는
   묘비들은 각각 남기지 않는다 — 묘비는 이미 자기 `ABSORB` 줄을 갖고 있고, `DELETE` 줄의
   `memberLabel`이 어느 사람이 사라졌는지를 말해준다.
3. **화면은 스펙 예시의 4칸(시각·관리자·액션·before→after)에 「대상」 칸을 하나 더 둔다.**
   `memberLabel`을 항상 렌더링하는 편이, before/after만으로 대상을 유추하게 하는 것보다
   읽기 쉽다. 스냅샷을 둔 목적("삭제된 회원도 누구였는지 읽힌다")과도 맞다.
4. **값이 실제로 바뀌지 않으면 로그를 남기지 않는다.** `updateMemberRealName`에 같은
   실명을 다시 저장하는 no-op은 줄을 만들지 않는다.

---

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `packages/db/prisma/migrations/<ts>_add_member_change_log/migration.sql` | 테이블·enum·인덱스 생성 (Prisma가 만든다) |
| `apps/dashboard/lib/mutations/record-member-change.ts` | 트랜잭션 클라이언트를 받아 로그 한 행을 쓰는 헬퍼 |
| `apps/dashboard/lib/mutations/record-member-change.test.ts` | 헬퍼 단위 테스트 |
| `apps/dashboard/lib/queries/member-change-log.ts` | 로그를 화면용 행으로 바꾸는 질의 (관리자 이름·액션 한글 라벨 해석) |
| `apps/dashboard/lib/queries/member-change-log.test.ts` | 질의 테스트 |
| `apps/dashboard/components/MemberChangeLogList.tsx` | 「변경 기록」 표 (서버 컴포넌트, 상호작용 없음) |

**수정**

| 파일 | 무엇을 |
|---|---|
| `packages/db/prisma/schema.prisma` | `model MemberChangeLog` + `enum MemberChangeAction` 추가 |
| `packages/db/src/test-utils.ts` | `resetDatabase`가 `memberChangeLog`도 지운다 |
| `apps/dashboard/lib/mutations/absorb-member.ts` | `adminId` 인자 + `ABSORB` 로그 |
| `apps/dashboard/lib/mutations/release-member.ts` | `adminId` 인자 + `RELEASE` 로그 |
| `apps/dashboard/lib/mutations/update-member-real-name.ts` | `adminId` 인자 + 트랜잭션화 + `RENAME` 로그 |
| `apps/dashboard/lib/mutations/delete-member.ts` | `adminId` 인자 + `DELETE` 로그 |
| `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts` | `adminId` 인자 + `ABSORB`/`NORMALIZE`/`RENAME` 로그 |
| `apps/dashboard/scripts/normalize-kakao-nicknames.ts` | `null`을 명시적으로 넘긴다 |
| `apps/dashboard/app/link-accounts/actions.ts` | `requireAdmin()`이 준 `admin.id`를 전달 |
| `apps/dashboard/app/members/actions.ts` | 같음 |
| `apps/dashboard/app/link-accounts/page.tsx` | 「변경 기록」 구획을 붙인다 |
| 각 뮤테이션의 `*.test.ts` | 늘어난 인자에 맞춰 호출부 수정 + 로그 검증 |

---

## Task 1: 테이블과 로그 헬퍼

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/test-utils.ts`
- Create: `apps/dashboard/lib/mutations/record-member-change.ts`
- Test: `apps/dashboard/lib/mutations/record-member-change.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - Prisma 모델 `MemberChangeLog { id, memberId, memberLabel, adminId, action, before, after, createdAt }`
  - Prisma enum `MemberChangeAction = ABSORB | RELEASE | RENAME | DELETE | NORMALIZE`
  - `interface MemberChangeInput { memberId: string; memberLabel: string; adminId: string | null; action: MemberChangeAction; before?: string | null; after?: string | null }`
  - `recordMemberChange(tx: Prisma.TransactionClient, input: MemberChangeInput): Promise<void>`

- [ ] **Step 1: 스키마에 모델과 enum을 추가한다**

`packages/db/prisma/schema.prisma`의 `model AdminSession { ... }` 블록 **다음에** 붙인다:

```prisma
// 회원을 연결·해제·개명·삭제·정규화한 사실. 연결은 mergedIntoId 한 컬럼으로 표현되므로
// 끊고 나면 연결했던 사실 자체가 사라진다 — 그래서 여기에 이벤트를 따로 쌓는다.
model MemberChangeLog {
  id          String             @id @default(uuid())
  // FK 아님 — 회원이 삭제돼도 로그는 남는다. Admin.createdById와 같은 이유다.
  memberId    String
  // 그 시점의 표시 이름 스냅샷. 회원이 삭제된 뒤에도 누구였는지 읽히게 한다.
  memberLabel String
  // FK 아님. null이면 세션 없이 실행된 것(정규화 스크립트)이다.
  adminId     String?
  action      MemberChangeAction
  before      String?
  after       String?
  createdAt   DateTime           @default(now())

  @@index([memberId])
  @@index([createdAt])
}

enum MemberChangeAction {
  ABSORB
  RELEASE
  RENAME
  DELETE
  NORMALIZE
}
```

- [ ] **Step 2: 마이그레이션을 만들고 클라이언트를 다시 생성한다**

Docker Desktop이 PATH에 없다. 필요하면 PowerShell에서
`$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"` 후
`docker compose up -d`로 Postgres(호스트 5434)를 먼저 띄운다.

```bash
npm run migrate --workspace=@lolpamin/db -- --name add_member_change_log
npm run generate --workspace=@lolpamin/db
```

기대: `packages/db/prisma/migrations/<타임스탬프>_add_member_change_log/migration.sql`이 생기고
`CREATE TYPE "MemberChangeAction"` + `CREATE TABLE "MemberChangeLog"` + 인덱스 두 개가 들어 있다.

- [ ] **Step 3: 테스트 DB에도 같은 마이그레이션을 적용한다**

`prisma migrate dev`는 `packages/db/.env`의 `DATABASE_URL`(개발 DB)에만 적용된다.
통합 테스트가 쓰는 `DATABASE_URL_TEST` 쪽에도 넣어야 다음 스텝이 통과한다.
Prisma의 dotenv는 이미 설정된 프로세스 환경변수를 덮어쓰지 않으므로, 아래처럼 덮어쓰면 된다
(PowerShell, 저장소 루트 `.env`의 `DATABASE_URL_TEST` 값을 그대로 넣는다):

```powershell
cd packages/db
$env:DATABASE_URL = "<루트 .env의 DATABASE_URL_TEST 값>"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
cd ../..
```

기대: `Applied 1 migration` 또는 `No pending migrations`(이미 적용된 경우).

- [ ] **Step 4: `resetDatabase`가 로그도 지우게 한다**

`packages/db/src/test-utils.ts`를 통째로 이 내용으로 바꾼다:

```ts
import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.adminSession.deleteMany();
  await client.admin.deleteMany();
  await client.gameParticipant.deleteMany();
  await client.gameResult.deleteMany();
  await client.mentionLog.deleteMany();
  // FK가 없으므로 Member보다 먼저 지울 필요는 없지만, 남겨두면 다음 테스트가
  // 이전 테스트의 로그를 세게 된다.
  await client.memberChangeLog.deleteMany();
  await client.member.deleteMany();
}
```

- [ ] **Step 5: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/record-member-change.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { recordMemberChange } from "./record-member-change";

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

describe("recordMemberChange", () => {
  it("writes one row with the given fields", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await prisma.$transaction(async (tx) => {
      await recordMemberChange(tx, {
        memberId: member.id,
        memberLabel: "유대혁",
        adminId: "admin-1",
        action: "ABSORB",
        before: "유대혁/95/유대혁#KR1",
        after: "유대혁",
      });
    });

    const rows = await prisma.memberChangeLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: member.id,
      memberLabel: "유대혁",
      adminId: "admin-1",
      action: "ABSORB",
      before: "유대혁/95/유대혁#KR1",
      after: "유대혁",
    });
  });

  it("defaults before and after to null when they are omitted", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "박시형/97/시형#KR1" } });

    await prisma.$transaction(async (tx) => {
      await recordMemberChange(tx, {
        memberId: member.id,
        memberLabel: "박시형",
        adminId: null,
        action: "DELETE",
        before: "박시형",
      });
    });

    const row = await prisma.memberChangeLog.findFirstOrThrow();
    expect(row.after).toBeNull();
    expect(row.adminId).toBeNull();
  });

  it("keeps the row after the member is deleted", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "박시형/97/시형#KR1" } });
    await prisma.$transaction(async (tx) => {
      await recordMemberChange(tx, {
        memberId: member.id,
        memberLabel: "박시형",
        adminId: null,
        action: "DELETE",
        before: "박시형",
      });
    });

    await prisma.member.delete({ where: { id: member.id } });

    const rows = await prisma.memberChangeLog.findMany({ where: { memberId: member.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].memberLabel).toBe("박시형");
  });

  it("leaves no row when the surrounding transaction rolls back", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "윤소영/99/소영#KR1" } });

    await expect(
      prisma.$transaction(async (tx) => {
        await recordMemberChange(tx, {
          memberId: member.id,
          memberLabel: "윤소영",
          adminId: null,
          action: "RENAME",
          before: null,
          after: "윤소영",
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/record-member-change.test.ts
```
기대: FAIL — `Failed to resolve import "./record-member-change"`.

- [ ] **Step 7: 헬퍼를 구현한다**

`apps/dashboard/lib/mutations/record-member-change.ts`:

```ts
import type { MemberChangeAction, Prisma } from "@lolpamin/db";

export interface MemberChangeInput {
  /** 바뀐 회원. FK가 아니므로 이미 지워진 회원의 id여도 된다. */
  memberId: string;
  /** 그 시점의 표시 이름. 회원이 지워진 뒤 로그를 읽는 유일한 단서다. */
  memberLabel: string;
  /** 서버 액션이 requireAdmin()에서 채운다. 스크립트 실행이면 null. */
  adminId: string | null;
  action: MemberChangeAction;
  before?: string | null;
  after?: string | null;
}

/**
 * 회원 변경 로그 한 행을 쓴다.
 *
 * PrismaClient가 아니라 TransactionClient를 받는 이유: 로그는 반드시 그 변경과 같은
 * 트랜잭션 안에 있어야 한다. 변경이 롤백되면 로그도 사라져야 "일어나지 않은 일"이
 * 기록으로 남는 상황을 피할 수 있다.
 */
export async function recordMemberChange(
  tx: Prisma.TransactionClient,
  input: MemberChangeInput,
): Promise<void> {
  await tx.memberChangeLog.create({
    data: {
      memberId: input.memberId,
      memberLabel: input.memberLabel,
      adminId: input.adminId,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
    },
  });
}
```

- [ ] **Step 8: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/record-member-change.test.ts
```
기대: 4 passed.

- [ ] **Step 9: 커밋한다**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts apps/dashboard/lib/mutations/record-member-change.ts apps/dashboard/lib/mutations/record-member-change.test.ts
git commit -m "feat(member-log): add the MemberChangeLog table and its write helper"
```

---

## Task 2: 연결·해제에 운영진을 붙이고 로그를 남긴다

**Files:**
- Modify: `apps/dashboard/lib/mutations/absorb-member.ts`
- Modify: `apps/dashboard/lib/mutations/release-member.ts`
- Modify: `apps/dashboard/app/link-accounts/actions.ts`
- Test: `apps/dashboard/lib/mutations/absorb-member.test.ts`, `apps/dashboard/lib/mutations/release-member.test.ts`

**Interfaces:**
- Consumes: `recordMemberChange(tx, input)` (Task 1), `getDisplayName(member)` from `@lolpamin/core`
- Produces:
  - `absorbMember(prisma: PrismaClient, loserId: string, survivorId: string, adminId: string | null): Promise<void>`
  - `releaseMember(prisma: PrismaClient, tombstoneId: string, adminId: string | null): Promise<void>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/absorb-member.test.ts`의 `describe("absorbMember", ...)` 블록 **맨 끝**에 추가한다:

```ts
  it("logs the absorb with the acting admin", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id, "admin-1");

    const rows = await prisma.memberChangeLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: loser.id,
      adminId: "admin-1",
      action: "ABSORB",
      before: "유대혁/95/유대혁#KR1",
      after: "유대혁",
    });
  });

  it("leaves no log when the absorb is rejected", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mergedIntoId: survivor.id },
    });

    await expect(absorbMember(prisma, loser.id, survivor.id, "admin-1")).rejects.toThrow();

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
```

`apps/dashboard/lib/mutations/release-member.test.ts`의 `describe("releaseMember", ...)` 블록 **맨 끝**에 추가한다:

```ts
  it("logs the release with the acting admin", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mergedIntoId: survivor.id },
    });

    await releaseMember(prisma, tombstone.id, "admin-1");

    const rows = await prisma.memberChangeLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: tombstone.id,
      adminId: "admin-1",
      action: "RELEASE",
      before: "유대혁",
      after: "유대혁/95/유대혁#KR1",
    });
  });

  it("leaves no log when the release is rejected", async () => {
    const active = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await expect(releaseMember(prisma, active.id, "admin-1")).rejects.toThrow();

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
```

- [ ] **Step 2: 두 테스트 파일의 기존 호출부에 인자를 더한다**

두 파일에서 `absorbMember(prisma, X, Y)` → `absorbMember(prisma, X, Y, "admin-1")`,
`releaseMember(prisma, X)` → `releaseMember(prisma, X, "admin-1")`로 모두 고친다.
빠짐없이 고쳤는지 확인:

```bash
cd apps/dashboard && grep -n "absorbMember(prisma\|releaseMember(prisma" lib/mutations/*.test.ts
```
기대: 모든 줄이 마지막 인자로 `"admin-1"`을 갖는다.

- [ ] **Step 3: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/absorb-member.test.ts lib/mutations/release-member.test.ts
```
기대: 새 네 테스트가 FAIL (`expect(rows).toHaveLength(1)` → received 0).

- [ ] **Step 4: `absorbMember`를 고친다**

`apps/dashboard/lib/mutations/absorb-member.ts` 맨 위 import에 두 줄을 더한다:

```ts
import { getDisplayName } from "@lolpamin/core";
import { recordMemberChange } from "./record-member-change";
```

시그니처를 바꾼다:

```ts
export async function absorbMember(
  prisma: PrismaClient,
  loserId: string,
  survivorId: string,
  adminId: string | null,
): Promise<void> {
```

트랜잭션 안에서, 생존자를 갱신하는 `await tx.member.update({ where: { id: survivor.id }, ... })`의
반환값을 받도록 `const updatedSurvivor = await tx.member.update({ ... })`로 바꾼다
(`data: { ... }` 내용은 그대로 둔다). 그리고 트랜잭션의 **마지막 줄**
`await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });`
**다음에** 붙인다:

```ts
      // 흡수당한 쪽을 로그의 주체로 삼는다 — mergedIntoId가 바뀐 행이 그쪽이고,
      // 「이 계정이 누구에게 붙었나」가 나중에 찾게 되는 질문이다.
      await recordMemberChange(tx, {
        memberId: loser.id,
        memberLabel: getDisplayName(loser),
        adminId,
        action: "ABSORB",
        before: loser.kakaoNickname,
        // 생존자의 표시 이름은 흡수로 채워질 수 있으므로(realName 승계) 갱신 후 값을 쓴다.
        after: getDisplayName(updatedSurvivor),
      });
```

- [ ] **Step 5: `releaseMember`를 고친다**

`apps/dashboard/lib/mutations/release-member.ts` 맨 위 import에 두 줄을 더한다:

```ts
import { getDisplayName } from "@lolpamin/core";
import { recordMemberChange } from "./record-member-change";
```

시그니처를 바꾼다:

```ts
export async function releaseMember(
  prisma: PrismaClient,
  tombstoneId: string,
  adminId: string | null,
): Promise<void> {
```

트랜잭션 본문에서 `const survivorId = tombstone.mergedIntoId;` **다음 줄**에 생존자를 읽어 둔다:

```ts
      const survivor = await tx.member.findUniqueOrThrow({ where: { id: survivorId } });
```

그리고 `await recomputeLastActiveAt(tx, survivorId);` **다음에** 붙인다:

```ts
      await recordMemberChange(tx, {
        memberId: tombstoneId,
        memberLabel: getDisplayName(tombstone),
        adminId,
        action: "RELEASE",
        before: getDisplayName(survivor),
        after: tombstone.kakaoNickname,
      });
```

- [ ] **Step 6: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/absorb-member.test.ts lib/mutations/release-member.test.ts
```
기대: 모두 PASS.

- [ ] **Step 7: 서버 액션이 운영진을 넘기게 한다**

`apps/dashboard/app/link-accounts/actions.ts`에서 두 함수를 고친다.
`absorbMemberAction`:

```ts
export async function absorbMemberAction(loserId: string, survivorId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  if (!loserId || !survivorId) {
    return { error: "연결할 카톡 계정과 상대를 각각 하나씩 골라주세요." };
  }

  try {
    await absorbMember(prisma, loserId, survivorId, admin.id);
```

`releaseMemberAction`:

```ts
export async function releaseMemberAction(tombstoneId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  if (!tombstoneId) {
    return { error: "끊을 별칭을 골라주세요." };
  }

  try {
    await releaseMember(prisma, tombstoneId, admin.id);
```

두 함수 모두 `revalidatePath("/link-accounts");`가 이미 있으므로 로그 화면도 함께 갱신된다.
나머지 본문은 건드리지 않는다.

- [ ] **Step 8: 전체 대시보드 테스트를 돌린다**

```bash
npm run test --workspace=dashboard
```
기대: 전부 PASS. `action-guards.test.ts`도 통과해야 한다(두 액션 모두 여전히 첫 줄에서 `requireAdmin()`을 부른다).

- [ ] **Step 9: 커밋한다**

```bash
git add apps/dashboard/lib/mutations/absorb-member.ts apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.ts apps/dashboard/lib/mutations/release-member.test.ts apps/dashboard/app/link-accounts/actions.ts
git commit -m "feat(member-log): attribute and log account linking and unlinking"
```

---

## Task 3: 실명 수정·삭제에 운영진을 붙이고 로그를 남긴다

**Files:**
- Modify: `apps/dashboard/lib/mutations/update-member-real-name.ts`
- Modify: `apps/dashboard/lib/mutations/delete-member.ts`
- Modify: `apps/dashboard/app/members/actions.ts`
- Test: `apps/dashboard/lib/mutations/update-member-real-name.test.ts`, `apps/dashboard/lib/mutations/delete-member.test.ts`

**Interfaces:**
- Consumes: `recordMemberChange(tx, input)` (Task 1), `getDisplayName(member)` from `@lolpamin/core`
- Produces:
  - `updateMemberRealName(prisma: PrismaClient, memberId: string, realName: string, adminId: string | null): Promise<void>`
  - `deleteMember(prisma: PrismaClient, memberId: string, adminId: string | null): Promise<DeleteMemberOutput>` (`DeleteMemberOutput`은 그대로 `{ mentionLogs: number; gameParticipants: number }`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/update-member-real-name.test.ts`의 describe 블록 끝에 추가한다:

```ts
  it("logs the rename with both the old and the new value", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혀" },
    });

    await updateMemberRealName(prisma, member.id, "유대혁", "admin-1");

    const rows = await prisma.memberChangeLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: member.id,
      memberLabel: "유대혁",
      adminId: "admin-1",
      action: "RENAME",
      before: "유대혀",
      after: "유대혁",
    });
  });

  it("logs a cleared real name as an after of null", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" },
    });

    await updateMemberRealName(prisma, member.id, "   ", "admin-1");

    const row = await prisma.memberChangeLog.findFirstOrThrow();
    expect(row.before).toBe("유대혁");
    expect(row.after).toBeNull();
  });

  it("writes no log when the real name does not actually change", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" },
    });

    await updateMemberRealName(prisma, member.id, "  유대혁  ", "admin-1");

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
```

`apps/dashboard/lib/mutations/delete-member.test.ts`의 describe 블록 끝에 추가한다:

```ts
  it("logs the deletion and keeps the log after the row is gone", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "박시형/97/시형#KR1", realName: "박시형" },
    });

    await deleteMember(prisma, member.id, "admin-1");

    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeNull();
    const rows = await prisma.memberChangeLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: member.id,
      memberLabel: "박시형",
      adminId: "admin-1",
      action: "DELETE",
      before: "박시형",
      after: null,
    });
  });

  it("leaves no log when the member does not exist", async () => {
    await expect(
      deleteMember(prisma, "00000000-0000-0000-0000-000000000000", "admin-1"),
    ).rejects.toThrow();

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
```

- [ ] **Step 2: 두 테스트 파일의 기존 호출부에 인자를 더한다**

`updateMemberRealName(prisma, X, Y)` → `updateMemberRealName(prisma, X, Y, "admin-1")`,
`deleteMember(prisma, X)` → `deleteMember(prisma, X, "admin-1")`로 모두 고친다.

```bash
cd apps/dashboard && grep -rn "updateMemberRealName(prisma\|deleteMember(prisma" lib app
```
기대: 테스트 안의 모든 호출이 마지막 인자를 갖는다. (`app/members/actions.ts`는 Step 6에서 고친다.)

- [ ] **Step 3: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/update-member-real-name.test.ts lib/mutations/delete-member.test.ts
```
기대: 새 다섯 테스트가 FAIL.

- [ ] **Step 4: `updateMemberRealName`을 고친다**

`apps/dashboard/lib/mutations/update-member-real-name.ts`를 통째로 이 내용으로 바꾼다:

```ts
import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";
import { recordMemberChange } from "./record-member-change";

export async function updateMemberRealName(
  prisma: PrismaClient,
  memberId: string,
  realName: string,
  adminId: string | null,
): Promise<void> {
  const trimmed = realName.trim();
  const next = trimmed.length > 0 ? trimmed : null;

  // 로그를 같은 트랜잭션에 넣으려고 감쌌다. 변경이 실패하면 로그도 남지 않아야 한다.
  await prisma.$transaction(async (tx) => {
    const previous = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
    // 값이 그대로면 아무 일도 일어나지 않은 것이다. 같은 이름을 다시 저장할 때마다
    // 로그가 쌓이면 「변경 기록」이 읽을 수 없게 된다.
    if (previous.realName === next) return;

    const updated = await tx.member.update({ where: { id: memberId }, data: { realName: next } });

    await recordMemberChange(tx, {
      memberId,
      memberLabel: getDisplayName(updated),
      adminId,
      action: "RENAME",
      before: previous.realName,
      after: next,
    });
  });
}
```

- [ ] **Step 5: `deleteMember`를 고친다**

`apps/dashboard/lib/mutations/delete-member.ts`에서 import 두 줄을 더한다:

```ts
import { getDisplayName } from "@lolpamin/core";
import { recordMemberChange } from "./record-member-change";
```

시그니처를 바꾼다:

```ts
export async function deleteMember(
  prisma: PrismaClient,
  memberId: string,
  adminId: string | null,
): Promise<DeleteMemberOutput> {
```

트랜잭션 첫 줄 `await tx.member.findUniqueOrThrow({ where: { id: memberId } });`를
반환값을 쓰도록 바꾼다:

```ts
    const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
```

그리고 `await tx.member.deleteMany({ where: { id: { in: ids } } });` **다음에** 붙인다:

```ts
    // 함께 지워지는 묘비들은 따로 남기지 않는다 — 묘비는 이미 자기 ABSORB 줄을 갖고
    // 있고, 이 줄의 memberLabel이 어느 사람이 사라졌는지를 말해준다.
    await recordMemberChange(tx, {
      memberId,
      memberLabel: getDisplayName(member),
      adminId,
      action: "DELETE",
      before: getDisplayName(member),
      after: null,
    });
```

- [ ] **Step 6: 서버 액션이 운영진을 넘기게 한다**

`apps/dashboard/app/members/actions.ts`에서 두 함수의 첫 줄과 호출부를 고친다:

```ts
export async function deleteMemberAction(memberId: string): Promise<DeleteMemberOutput> {
  const admin = await requireAdmin();
  if (!memberId) {
    throw new Error("memberId is required");
  }
  const result = await deleteMember(prisma, memberId, admin.id);
  revalidatePath("/members");
  revalidatePath("/inactive");
  revalidatePath("/link-accounts");
  revalidatePath("/matches");
  return result;
}

export async function updateMemberRealNameAction(
  memberId: string,
  realName: string
): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  try {
    await updateMemberRealName(prisma, memberId, realName, admin.id);
  } catch {
    return { error: "실명을 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/inactive");
  // 변경 기록이 /link-accounts 아래에 있으므로 실명 수정도 그 화면을 갱신해야 한다.
  revalidatePath("/link-accounts");
  return { error: null };
}
```

- [ ] **Step 7: 통과를 확인한다**

```bash
npm run test --workspace=dashboard
```
기대: 전부 PASS.

- [ ] **Step 8: 커밋한다**

```bash
git add apps/dashboard/lib/mutations/update-member-real-name.ts apps/dashboard/lib/mutations/update-member-real-name.test.ts apps/dashboard/lib/mutations/delete-member.ts apps/dashboard/lib/mutations/delete-member.test.ts apps/dashboard/app/members/actions.ts
git commit -m "feat(member-log): attribute and log real-name edits and deletions"
```

---

## Task 4: 정규화 스크립트가 남기는 로그

**Files:**
- Modify: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`
- Modify: `apps/dashboard/scripts/normalize-kakao-nicknames.ts`
- Test: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`

**Interfaces:**
- Consumes: `recordMemberChange(tx, input)` (Task 1), `getDisplayName(member)` from `@lolpamin/core`
- Produces: `normalizeKakaoNicknames(prisma: PrismaClient, adminId: string | null): Promise<NormalizeResult>` (`NormalizeResult`는 그대로)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`의 describe 블록 끝에 추가한다:

```ts
  it("logs a NORMALIZE row for a nickname it rewrites, with no admin", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "윤찬/85/드랍더비추kr3 (8시)", realName: "윤찬" },
    });

    await normalizeKakaoNicknames(prisma, null);

    const rows = await prisma.memberChangeLog.findMany({ where: { action: "NORMALIZE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: member.id,
      adminId: null,
      before: "윤찬/85/드랍더비추kr3 (8시)",
      after: "윤찬/85/드랍더비추kr3",
    });
  });

  it("logs an ABSORB row for each member it merges", async () => {
    const survivor = await prisma.member.create({
      data: { kakaoNickname: "윤찬/85/드랍더비추kr3", realName: "윤찬", createdAt: new Date(2026, 0, 1) },
    });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "윤찬/85/드랍더비추kr3 (8시)", createdAt: new Date(2026, 0, 2) },
    });

    await normalizeKakaoNicknames(prisma, null);

    const rows = await prisma.memberChangeLog.findMany({ where: { action: "ABSORB" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: loser.id,
      adminId: null,
      before: "윤찬/85/드랍더비추kr3 (8시)",
      after: "윤찬",
    });
    expect(survivor.id).not.toBe(loser.id);
  });

  it("logs a RENAME row for each real name it fills in", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "심현석/96/현석#KR1" } });

    await normalizeKakaoNicknames(prisma, null);

    const rows = await prisma.memberChangeLog.findMany({ where: { action: "RENAME" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: member.id,
      adminId: null,
      before: null,
      after: "심현석",
    });
  });

  it("writes no log on a second run that changes nothing", async () => {
    await prisma.member.create({ data: { kakaoNickname: "심현석/96/현석#KR1" } });
    await normalizeKakaoNicknames(prisma, null);
    const afterFirst = await prisma.memberChangeLog.count();

    await normalizeKakaoNicknames(prisma, null);

    expect(await prisma.memberChangeLog.count()).toBe(afterFirst);
  });
```

- [ ] **Step 2: 기존 호출부에 인자를 더한다**

같은 파일의 `normalizeKakaoNicknames(prisma)` 호출을 모두 `normalizeKakaoNicknames(prisma, null)`로 고친다.

```bash
cd apps/dashboard && grep -rn "normalizeKakaoNicknames(prisma" lib scripts
```

- [ ] **Step 3: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/normalize-kakao-nicknames.test.ts
```
기대: 새 세 테스트가 FAIL (네 번째는 0 === 0으로 우연히 통과할 수 있다).

- [ ] **Step 4: 뮤테이션을 고친다**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`에서 import에 한 줄을 더한다
(`@lolpamin/core` 임포트에 `getDisplayName`을 추가):

```ts
import { getDisplayName, normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";
import { recordMemberChange } from "./record-member-change";
```

시그니처를 바꾼다:

```ts
// 이 스크립트는 세션 없이 실행되므로 adminId는 보통 null이다. 화면에서 「스크립트」로 표시된다.
export async function normalizeKakaoNicknames(
  prisma: PrismaClient,
  adminId: string | null,
): Promise<NormalizeResult> {
```

**(a) 병합 로그.** 로저 루프 안, `mergedPairs.push({ ... });` **다음에** 붙인다:

```ts
          // 스펙 예시는 스크립트가 남기는 줄로 정규화만 보여주지만, 이 스크립트는
          // 실제로 병합도 한다. 남기지 않으면 이 테이블을 만든 이유(연결을 끊으면
          // 연결했던 사실 자체가 사라진다)가 스크립트 경로에서 그대로 재현된다.
          await recordMemberChange(tx, {
            memberId: loser.id,
            memberLabel: getDisplayName(loser),
            adminId,
            action: "ABSORB",
            before: loser.kakaoNickname,
            after: getDisplayName({
              realName: nextRealName,
              discordHandle: survivor.discordHandle,
              kakaoNickname: nickname,
            }),
          });
```

이 코드는 `nextRealName`을 참조하므로, 지금 로저 루프 **뒤에** 있는 네 개의 `const`
선언(`nextLastActiveAt`, `nextRealName`, `nextAge`, `nextRiotId`)을 로저 루프 **앞으로**
옮긴다. 순서만 바뀔 뿐 계산식은 그대로다:

```ts
        const survivor = pickSurvivor(group);
        const losers = group.filter((m) => m.id !== survivor.id);

        const blocked = losers.filter((l) => l.discordUserId !== null || l.kakaoUserId !== null);
        if (blocked.length > 0) {
          // ... 기존 그대로 ...
          continue;
        }

        // 로저 루프가 로그에 "누구에게 붙었는지"를 적으려면 승계 결과를 먼저 알아야 한다.
        // mmr은 생존자 값을 유지한다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
        const nextLastActiveAt = latest([survivor.lastActiveAt, ...losers.map((l) => l.lastActiveAt)]);
        const nextRealName = survivor.realName ?? losers.find((l) => l.realName !== null)?.realName ?? null;
        const nextAge = survivor.age ?? losers.find((l) => l.age !== null)?.age ?? null;
        const nextRiotId = survivor.riotId ?? losers.find((l) => l.riotId !== null)?.riotId ?? null;

        for (const loser of losers) {
          // ... 기존 그대로 + 위의 recordMemberChange ...
        }
```

**(b) 정규화 로그.** `if (survivorChanged) { await tx.member.update({ ... }); }` 블록을
아래처럼 바꾼다 — 닉네임이 **실제로** 달라진 경우에만 `NORMALIZE`를 남긴다:

```ts
        if (survivorChanged) {
          await tx.member.update({
            where: { id: survivor.id },
            data: {
              kakaoNickname: nickname,
              lastActiveAt: nextLastActiveAt,
              realName: nextRealName,
              age: nextAge,
              riotId: nextRiotId,
            },
          });

          // 병합만 일어나고 생존자 닉네임은 그대로인 경우가 있다. 그때는 ABSORB 줄만
          // 남기고 NORMALIZE는 남기지 않는다.
          if (nickname !== survivor.kakaoNickname) {
            await recordMemberChange(tx, {
              memberId: survivor.id,
              memberLabel: getDisplayName({
                realName: nextRealName,
                discordHandle: survivor.discordHandle,
                kakaoNickname: nickname,
              }),
              adminId,
              action: "NORMALIZE",
              before: survivor.kakaoNickname,
              after: nickname,
            });
          }
        }
```

**(c) 실명 채우기 로그.** `blankRealNames` 루프의 `realNamesFilled++;` **다음에** 붙인다:

```ts
        await recordMemberChange(tx, {
          memberId: member.id,
          memberLabel: realName,
          adminId,
          action: "RENAME",
          before: null,
          after: realName,
        });
```

- [ ] **Step 5: 스크립트가 `null`을 명시적으로 넘기게 한다**

`apps/dashboard/scripts/normalize-kakao-nicknames.ts`에서 한 줄을 고친다:

```ts
  // 세션 없이 실행되므로 adminId는 null이다 — 변경 기록에 「스크립트」로 표시된다.
  const result = await normalizeKakaoNicknames(prisma, null);
```

- [ ] **Step 6: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/normalize-kakao-nicknames.test.ts
```
기대: 전부 PASS. (기존 테스트들도 그대로 통과해야 한다 — 재실행 멱등성 테스트가 특히 중요하다.)

- [ ] **Step 7: 커밋한다**

```bash
git add apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts apps/dashboard/scripts/normalize-kakao-nicknames.ts
git commit -m "feat(member-log): log what the nickname normalisation script changes"
```

---

## Task 5: 「변경 기록」 질의

**Files:**
- Create: `apps/dashboard/lib/queries/member-change-log.ts`
- Test: `apps/dashboard/lib/queries/member-change-log.test.ts`

**Interfaces:**
- Consumes: `MemberChangeLog` 테이블 (Task 1), 그 테이블에 쌓이는 행들 (Task 2~4)
- Produces:
  - `interface MemberChangeLogRow { id: string; createdAt: Date; adminLabel: string; actionLabel: string; memberLabel: string; before: string | null; after: string | null }`
  - `getMemberChangeLog(): Promise<MemberChangeLogRow[]>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/queries/member-change-log.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/member-change-log.ts는 앱 싱글턴 prisma를 임포트한다 — game-history.test.ts와 같은 방식.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMemberChangeLog } = await import("./member-change-log");

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMemberChangeLog", () => {
  it("returns nothing when there are no changes", async () => {
    expect(await getMemberChangeLog()).toEqual([]);
  });

  it("resolves the admin username and the Korean action label", async () => {
    const admin = await prisma.admin.create({
      data: { username: "sujin", passwordHash: "x" },
    });
    await prisma.memberChangeLog.create({
      data: {
        memberId: "m-1",
        memberLabel: "박시형",
        adminId: admin.id,
        action: "DELETE",
        before: "박시형",
      },
    });

    const [row] = await getMemberChangeLog();
    expect(row.adminLabel).toBe("sujin");
    expect(row.actionLabel).toBe("삭제");
    expect(row.memberLabel).toBe("박시형");
    expect(row.before).toBe("박시형");
    expect(row.after).toBeNull();
  });

  it("labels a null adminId as the script and a missing admin as deleted", async () => {
    await prisma.memberChangeLog.create({
      data: { memberId: "m-1", memberLabel: "윤찬", adminId: null, action: "NORMALIZE" },
    });
    await prisma.memberChangeLog.create({
      data: { memberId: "m-2", memberLabel: "유대혁", adminId: "gone", action: "ABSORB" },
    });

    const labels = (await getMemberChangeLog()).map((r) => r.adminLabel);
    expect(labels).toContain("스크립트");
    expect(labels).toContain("삭제된 관리자");
  });

  it("orders newest first", async () => {
    await prisma.memberChangeLog.create({
      data: {
        memberId: "m-1",
        memberLabel: "먼저",
        adminId: null,
        action: "RENAME",
        createdAt: new Date(2026, 8, 1),
      },
    });
    await prisma.memberChangeLog.create({
      data: {
        memberId: "m-2",
        memberLabel: "나중",
        adminId: null,
        action: "RENAME",
        createdAt: new Date(2026, 8, 2),
      },
    });

    const rows = await getMemberChangeLog();
    expect(rows.map((r) => r.memberLabel)).toEqual(["나중", "먼저"]);
  });

  it("gives every action a Korean label", async () => {
    const actions = ["ABSORB", "RELEASE", "RENAME", "DELETE", "NORMALIZE"] as const;
    for (const action of actions) {
      await prisma.memberChangeLog.create({
        data: { memberId: "m-1", memberLabel: "회원", adminId: null, action },
      });
    }

    const labels = (await getMemberChangeLog()).map((r) => r.actionLabel);
    expect(labels).toHaveLength(5);
    expect(labels.every((l) => /^[가-힣 ]+$/.test(l))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/member-change-log.test.ts
```
기대: FAIL — `Failed to resolve import "./member-change-log"`.

- [ ] **Step 3: 질의를 구현한다**

`apps/dashboard/lib/queries/member-change-log.ts`:

```ts
import type { MemberChangeAction } from "@lolpamin/db";
import { prisma } from "@/lib/prisma";

export interface MemberChangeLogRow {
  id: string;
  createdAt: Date;
  /** 관리자 username, 「스크립트」, 또는 「삭제된 관리자」. */
  adminLabel: string;
  actionLabel: string;
  /** 변경 시점의 회원 표시 이름 스냅샷. 삭제된 회원도 이걸로 읽는다. */
  memberLabel: string;
  before: string | null;
  after: string | null;
}

const SCRIPT_LABEL = "스크립트";
const DELETED_ADMIN_LABEL = "삭제된 관리자";

const ACTION_LABELS: Record<MemberChangeAction, string> = {
  ABSORB: "연결",
  RELEASE: "연결 끊기",
  RENAME: "실명 수정",
  DELETE: "삭제",
  NORMALIZE: "정규화",
};

/**
 * 회원 변경 로그를 시간 역순으로 전부 읽는다.
 *
 * 페이지네이션이 없다 — 지금 규모(회원 40여 명)에서는 전부 불러도 된다. 언젠가 로그가
 * 많아지면 여기에 커서나 보존 기간을 붙이면 된다.
 */
export async function getMemberChangeLog(): Promise<MemberChangeLogRow[]> {
  const logs = await prisma.memberChangeLog.findMany({ orderBy: { createdAt: "desc" } });

  const adminIds = [...new Set(logs.map((l) => l.adminId).filter((id): id is string => id !== null))];
  const admins = await prisma.admin.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, username: true },
  });
  const usernameById = new Map(admins.map((a) => [a.id, a.username]));

  // adminId는 FK가 아니라 조회가 실패할 수 있다. null은 세션 없이 실행된 것이고,
  // 값이 있는데 못 찾으면 그 관리자가 삭제된 것이다 — game-history와 같은 방침이다.
  function adminLabel(id: string | null): string {
    if (id === null) return SCRIPT_LABEL;
    return usernameById.get(id) ?? DELETED_ADMIN_LABEL;
  }

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    adminLabel: adminLabel(log.adminId),
    actionLabel: ACTION_LABELS[log.action],
    memberLabel: log.memberLabel,
    before: log.before,
    after: log.after,
  }));
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/member-change-log.test.ts
```
기대: 5 passed.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/dashboard/lib/queries/member-change-log.ts apps/dashboard/lib/queries/member-change-log.test.ts
git commit -m "feat(member-log): read the change log with resolved admin and action labels"
```

---

## Task 6: 「변경 기록」 화면

**Files:**
- Create: `apps/dashboard/components/MemberChangeLogList.tsx`
- Modify: `apps/dashboard/app/link-accounts/page.tsx`

**Interfaces:**
- Consumes: `getMemberChangeLog(): Promise<MemberChangeLogRow[]>` 와 `MemberChangeLogRow` (Task 5)
- Produces: `MemberChangeLogList({ rows }: { rows: MemberChangeLogRow[] })` — 서버 컴포넌트

- [ ] **Step 1: 컴포넌트를 만든다**

상호작용이 없으므로 `"use client"`를 붙이지 않는다.
색·크기는 `GameHistoryList.tsx`와 같은 팔레트를 쓴다.

`apps/dashboard/components/MemberChangeLogList.tsx`:

```tsx
import type { MemberChangeLogRow } from "@/lib/queries/member-change-log";

function formatAt(at: Date): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MemberChangeLogList({ rows }: { rows: MemberChangeLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/[.07] bg-[#12161F] px-5 py-10 text-center text-[12.5px] text-[#5C6577]">
        아직 변경 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[.07] bg-[#12161F]">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-white/[.07] text-left text-[11.5px] text-[#6E7889]">
            <th className="px-4 py-2.5 font-bold">시각</th>
            <th className="px-4 py-2.5 font-bold">운영진</th>
            <th className="px-4 py-2.5 font-bold">동작</th>
            <th className="px-4 py-2.5 font-bold">대상</th>
            <th className="px-4 py-2.5 font-bold">변경</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-white/[.04] last:border-b-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-[#8A94A6]">
                {formatAt(row.createdAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-[#8A94A6]">{row.adminLabel}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <span className="rounded-md bg-[#20293A] px-2 py-0.5 text-[11px] font-bold text-[#C7D0DF]">
                  {row.actionLabel}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-[#C7D0DF]">{row.memberLabel}</td>
              <td className="px-4 py-2.5 text-[#8A94A6]">
                <span className="text-[#C7D0DF]">{row.before ?? "—"}</span>
                <span className="px-2 text-[#5C6577]">→</span>
                <span className="text-[#C7D0DF]">{row.after ?? "—"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: `/link-accounts` 아래에 붙인다**

`apps/dashboard/app/link-accounts/page.tsx`를 통째로 이 내용으로 바꾼다:

```tsx
import { AppShell } from "@/components/AppShell";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
import { MemberChangeLogList } from "@/components/MemberChangeLogList";
import { getPendingDiscordAccounts } from "@/lib/queries/pending-accounts";
import { getKakaoAccountsWithCandidates, getMembersWithAliases } from "@/lib/queries/link-candidates";
import { getMemberChangeLog } from "@/lib/queries/member-change-log";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function LinkAccountsPage() {
  const [discordAccounts, kakaoAccounts, membersWithAliases, changeLog, currentAdmin] = await Promise.all([
    getPendingDiscordAccounts(),
    getKakaoAccountsWithCandidates(),
    getMembersWithAliases(),
    getMemberChangeLog(),
    getCurrentAdmin(),
  ]);

  return (
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
      <div className="flex flex-col gap-8 px-7 pb-10 pt-6">
        <AccountMappingPanel
          discordAccounts={discordAccounts}
          kakaoAccounts={kakaoAccounts}
          membersWithAliases={membersWithAliases}
          isAdmin={currentAdmin !== null}
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="m-0 text-[13.5px] font-bold">변경 기록</h2>
            <span className="text-[11.5px] text-[#6E7889]">
              회원을 연결·해제하거나 실명을 고치고 삭제한 기록입니다. 경기는 「경기 기록」에 있습니다.
            </span>
          </div>
          <MemberChangeLogList rows={changeLog} />
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: 타입과 빌드를 확인한다**

```bash
npm run build --workspace=dashboard
```
기대: 성공. (`next build`가 타입체크를 겸한다 — 별도 lint 단계는 없다.)

- [ ] **Step 4: 전체 테스트를 돌린다**

```bash
npm test
```
기대: 모든 워크스페이스 PASS.

- [ ] **Step 5: 실제 화면에서 확인한다**

```bash
npm run dev --workspace=dashboard
```

`http://localhost:3000/link-accounts`에서:
1. 로그인 전 — 「변경 기록」 표가 보인다(읽기는 공개다).
2. 로그인 후 카톡 계정 하나를 연결한다 → 표 맨 위에 「연결」 줄이 생기고 운영진 이름이 붙는다.
3. 그 연결을 끊는다 → 「연결 끊기」 줄이 생긴다.
4. `/members`에서 실명을 고친다 → 돌아오면 「실명 수정」 줄이 있다.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/dashboard/components/MemberChangeLogList.tsx apps/dashboard/app/link-accounts/page.tsx
git commit -m "feat(member-log): show the change log under the account linking page"
```

---

## Task 7: 스펙 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-game-history-and-audit-log-design.md`

**Interfaces:**
- Consumes: Task 1~6의 결과
- Produces: 없음 (문서)

- [ ] **Step 1: 「구현 상태」 표와 「남긴 범위」를 고친다**

`## 구현 상태 (2026-09-03)` 절에서:

- 표의 마지막 줄 `| 회원 변경 로그 (\`MemberChangeLog\`) | **미구현** |`을 `| 회원 변경 로그 (\`MemberChangeLog\`) | 구현 |`으로 바꾼다.
- 그 위 문장 「이 문서의 **경기 기록과 되돌리기는 구현되었다.** 회원 변경 로그(`MemberChangeLog`)는 아직이다 — 아래 「남긴 범위」 참고.」를 다음으로 바꾼다:

```markdown
이 문서의 범위는 **전부 구현되었다.** 회원 변경 로그는 2026-09-03에 들어왔다
(계획: `docs/superpowers/plans/2026-09-03-member-change-log.md`).
```

- `### 남긴 범위` 절 전체를 다음으로 바꾼다:

```markdown
### 회원 변경 로그에서 스펙과 달라진 것

- `normalizeKakaoNicknames`는 `NORMALIZE`만이 아니라 자기가 수행한 병합(`ABSORB`)과
  실명 자동 채우기(`RENAME`)도 남긴다. 병합을 남기지 않으면 이 테이블을 만든 이유
  ―「끊고 나면 연결했던 사실 자체가 사라진다」― 가 스크립트 경로에서 그대로 재현된다.
- `deleteMember`는 대상 회원 한 행에 대해서만 `DELETE`를 남긴다. 함께 지워지는 묘비는
  이미 자기 `ABSORB` 줄을 갖고 있다.
- 「변경 기록」 표는 본문 예시의 네 칸에 「대상」(`memberLabel`) 칸을 하나 더 둔다.
- 실명을 같은 값으로 다시 저장하는 no-op은 로그를 남기지 않는다.
```

- [ ] **Step 2: 커밋한다**

```bash
git add docs/superpowers/specs/2026-09-01-game-history-and-audit-log-design.md
git commit -m "docs: mark the member change log as implemented"
```

---

## 배포 메모

이 작업은 마이그레이션을 하나 추가한다. 서버의 대시보드 컨테이너 `CMD`가
`prisma migrate deploy`를 `next start` 앞에서 돌리므로, 트리를 동기화하고 이미지를
다시 빌드하면 스키마가 따라온다. 서버 체크아웃은 git clone이 아니라 파일 복사라는 점을
잊지 말 것 — 커밋만으로는 서버에 반영되지 않는다.
