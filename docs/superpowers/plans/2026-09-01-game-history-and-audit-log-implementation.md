# 경기 기록과 운영 로그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 기록을 볼 수 있는 화면을 만들고, 가장 최근 경기를 되돌릴 수 있게 하며, 어떤 운영진이 무엇을 했는지 남긴다.

**Architecture:** 경기 로그는 별도 테이블 없이 `GameResult`에 컬럼 세 개(`createdById`, `cancelledAt`, `cancelledById`)를 더해 담는다 — 점수 변동은 이미 `GameParticipant.eloBefore/eloAfter`에 있다. 되돌리기는 재계산 없이 `eloBefore`를 복원하며, 「취소되지 않은 것 중 가장 늦게 입력된 경기」 하나로 대상을 제한해 정확성을 보장한다. 회원 변경(연결·끊기·실명·삭제·정규화)은 지금 흔적이 남지 않으므로 `MemberChangeLog` 테이블을 새로 만든다.

**Tech Stack:** TypeScript, Next.js 14 App Router(서버 액션, 서버 컴포넌트), Prisma 5 + PostgreSQL, Vitest. 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-01-game-history-and-audit-log-design.md`

## Global Constraints

- 새 npm 의존성을 추가하지 않는다.
- 스키마 변경은 Task 1의 마이그레이션 한 건뿐이다. 다른 태스크는 스키마를 건드리지 않는다.
- **`GameResult.createdById` / `cancelledById` / `MemberChangeLog.adminId` / `MemberChangeLog.memberId`는 외래키로 걸지 않는다.** 대상이 삭제돼도 로그는 남아야 한다. `Admin.createdById`가 이미 같은 이유로 FK가 아니다.
- **되돌리기 대상은 `cancelledAt IS NULL`인 경기 중 `createdAt`이 가장 늦은 것 하나뿐이다.** `playedAt` 기준이 아니다.
- **취소를 되살리는 기능을 만들지 않는다.** 되살리기가 있으면 LIFO가 깨지고 ELO 복원의 정확성 근거가 무너진다.
- **취소해도 `GameParticipant`를 지우지 않는다.** 누가 뛰었고 점수가 어떻게 움직였는지가 취소 후에도 보여야 한다.
- 데이터를 바꾸는 모든 서버 액션은 본문에서 데이터에 손대기 전에 `await requireAdmin()`을 호출한다. `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 검사하며, 그 테스트를 수정해서 통과시키지 않는다.
- DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다 (`apps/dashboard/lib/mutations/delete-member.test.ts`와 동일한 형태). 가드 없이 쓰면 개발 DB가 지워진다.
- 이 리포의 뮤테이션 헬퍼는 `prisma`를 첫 번째 인자로 받는다. 새 헬퍼도 같은 형태를 따른다.
- 새 `prisma.$transaction` 호출에는 `{ timeout: 20000 }`을 명시한다.
- 로그는 대상 뮤테이션과 **같은 트랜잭션 안에서** 쓴다. 뮤테이션이 실패하면 로그도 남지 않아야 한다.
- 주석과 화면 문구는 한국어다. 주변 코드의 문체를 따른다.

---

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `packages/db/prisma/migrations/<ts>_add_game_cancel_and_member_change_log/migration.sql` | 스키마 마이그레이션 |
| `apps/dashboard/lib/mutations/log-member-change.ts` | `MemberChangeLog` 한 줄을 쓰는 헬퍼 |
| `apps/dashboard/lib/mutations/cancel-game-result.ts` | 되돌리기 (LIFO 가드 + ELO 복원) |
| `apps/dashboard/lib/mutations/cancel-game-result.test.ts` | 되돌리기 정확성 테스트 |
| `apps/dashboard/lib/queries/match-history.ts` | 경기 목록 조회 |
| `apps/dashboard/lib/queries/match-history.test.ts` | 경기 목록 조회 테스트 |
| `apps/dashboard/lib/queries/member-change-log.ts` | 변경 기록 조회 |
| `apps/dashboard/app/match-history/page.tsx` | 「경기 기록」 화면 |
| `apps/dashboard/app/match-history/actions.ts` | 되돌리기 서버 액션 |
| `apps/dashboard/components/MatchHistoryList.tsx` | 경기 목록 컴포넌트 |
| `apps/dashboard/components/MemberChangeLogPanel.tsx` | 변경 기록 구획 |

**수정**

| 파일 | 변경 |
|---|---|
| `packages/db/prisma/schema.prisma` | `GameResult` 컬럼 3개, `MemberChangeLog` 모델, `MemberChangeAction` enum |
| `packages/db/src/test-utils.ts` | `resetDatabase`에 `memberChangeLog` 추가 |
| `apps/dashboard/lib/mutations/save-game-result.ts` | `createdById` 저장 |
| `apps/dashboard/lib/mutations/absorb-member.ts` | `adminId` 인자 + 로그 |
| `apps/dashboard/lib/mutations/release-member.ts` | `adminId` 인자 + 로그 |
| `apps/dashboard/lib/mutations/update-member-real-name.ts` | `adminId` 인자 + 로그 |
| `apps/dashboard/lib/mutations/delete-member.ts` | `adminId` 인자 + 로그 |
| `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts` | 로그 (`adminId` = null) |
| `apps/dashboard/app/matches/actions.ts` | `createdById` 전달 |
| `apps/dashboard/app/members/actions.ts` | `adminId` 전달 |
| `apps/dashboard/app/link-accounts/actions.ts` | `adminId` 전달 |
| `apps/dashboard/app/link-accounts/page.tsx` | 변경 기록 전달 |
| `apps/dashboard/components/AppShell.tsx` | `activeNav`에 `match-history` 추가, 내비 항목 |
| `apps/dashboard/lib/queries/members.ts` | 취소된 경기를 내전 횟수에서 제외 |
| `apps/dashboard/lib/queries/inactive.ts` | 취소된 경기를 내전 횟수에서 제외 |

## 병렬 실행 가이드

Task 1은 스키마 게이트라 가장 먼저 혼자 실행한다. 그 뒤 Task 2가 로그 헬퍼를 만들고, Task 3·4(회원 뮤테이션)와 Task 5(되돌리기)는 서로 파일이 겹치지 않으므로 동시에 진행할 수 있다. Task 6·7은 Task 5를, Task 8은 Task 2·3·4를 필요로 한다. Task 9는 Task 1 이후 아무 때나. Task 10은 전부 끝난 뒤다.

---

### Task 1: 스키마 마이그레이션

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/test-utils.ts`

**Interfaces:**
- Produces: `GameResult.createdById`, `GameResult.cancelledAt`, `GameResult.cancelledById`, `MemberChangeLog` 모델, `MemberChangeAction` enum. 이후 모든 태스크가 쓴다.

- [ ] **Step 1: 스키마에 컬럼과 모델을 추가한다**

`packages/db/prisma/schema.prisma`의 `GameResult`를 다음으로 바꾼다:

```prisma
model GameResult {
  id        String   @id @default(uuid())
  playedAt  DateTime
  winner    Team
  createdAt DateTime @default(now())

  // 입력·취소한 운영진. FK가 아니다 — 관리자가 삭제돼도 "누가 했는지"는 남아야 하고,
  // 화면에서는 조회 실패 시 "삭제된 관리자"로 표시한다. Admin.createdById와 같은 방침이다.
  createdById   String?
  // null이면 살아 있는 경기다. 취소 표시와 취소 시각과 "되돌릴 수 있는가" 판정을 겸한다.
  cancelledAt   DateTime?
  cancelledById String?

  participants GameParticipant[]

  @@index([cancelledAt, createdAt])
}
```

파일 끝에 다음을 추가한다:

```prisma
enum MemberChangeAction {
  ABSORB
  RELEASE
  RENAME
  DELETE
  NORMALIZE
}

model MemberChangeLog {
  id String @id @default(uuid())

  // memberId도 adminId도 FK가 아니다. 회원이 지워져도 로그는 남아야 하므로,
  // 그 시점의 표시 이름을 memberLabel에 스냅샷으로 함께 저장한다.
  memberId    String
  memberLabel String
  // null이면 세션 없이 CLI 스크립트로 실행된 것이다(정규화).
  adminId     String?

  action MemberChangeAction
  before String?
  after  String?

  createdAt DateTime @default(now())

  @@index([memberId])
  @@index([createdAt])
}
```

- [ ] **Step 2: 마이그레이션을 만든다**

Run: `npx prisma migrate dev --name add_game_cancel_and_member_change_log --schema packages/db/prisma/schema.prisma --create-only`

생성된 `migration.sql`을 열어 확인한다. 기대하는 내용: `GameResult`에 nullable 컬럼 3개 `ADD COLUMN`, 인덱스 1개, `MemberChangeAction` 타입 생성, `MemberChangeLog` 테이블 생성과 인덱스 2개. **`DROP`이나 `NOT NULL`이 있으면 안 된다** — 프로덕션에 데이터가 있다.

- [ ] **Step 3: 테스트 DB에 적용하고 클라이언트를 다시 만든다**

Run: `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`
(`DATABASE_URL`이 테스트 DB를 가리키게 하거나, `DATABASE_URL_TEST` 값을 `DATABASE_URL`로 넘겨 실행한다. 개발 DB에는 컨트롤러가 Task 10에서 적용한다.)

Run: `npx prisma generate --schema packages/db/prisma/schema.prisma`
Expected: 성공.

- [ ] **Step 4: `resetDatabase`에 새 테이블을 넣는다**

`packages/db/src/test-utils.ts`:

```typescript
export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.adminSession.deleteMany();
  await client.admin.deleteMany();
  await client.memberChangeLog.deleteMany();
  await client.gameParticipant.deleteMany();
  await client.gameResult.deleteMany();
  await client.mentionLog.deleteMany();
  await client.member.deleteMany();
}
```

이걸 빼먹으면 테스트 간에 로그가 새어 다음 태스크들이 원인 모를 실패를 겪는다.

- [ ] **Step 5: 전체 스위트가 그대로 통과하는지 확인한다**

Run: `npx vitest run`
Expected: 전부 통과. 이 태스크는 기존 동작을 바꾸지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts
git commit -m "feat(db): add game cancellation columns and the member change log"
```

---

### Task 2: `logMemberChange` 헬퍼

**Files:**
- Create: `apps/dashboard/lib/mutations/log-member-change.ts`
- Create: `apps/dashboard/lib/mutations/log-member-change.test.ts`

**Interfaces:**
- Consumes: Task 1의 `MemberChangeLog`, `MemberChangeAction`.
- Produces: `logMemberChange(tx, input: LogMemberChangeInput): Promise<void>`, `interface LogMemberChangeInput`. Task 3·4가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/log-member-change.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { logMemberChange } from "./log-member-change";

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

describe("logMemberChange", () => {
  it("표시 이름을 스냅샷으로 남겨 회원이 지워져도 읽힌다", async () => {
    const member = await prisma.member.create({ data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await logMemberChange(prisma, {
      member,
      adminId: "admin-1",
      action: "DELETE",
      before: "유대혁",
      after: null,
    });

    await prisma.member.delete({ where: { id: member.id } });

    const logs = await prisma.memberChangeLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].memberId).toBe(member.id);
    expect(logs[0].memberLabel).toBe("유대혁");
    expect(logs[0].adminId).toBe("admin-1");
    expect(logs[0].action).toBe("DELETE");
  });

  it("실명이 없으면 디스코드 핸들, 그다음 카톡 닉네임을 표시 이름으로 쓴다", async () => {
    const member = await prisma.member.create({
      data: { realName: null, discordUserId: "d-1", discordHandle: "daehyeok_", kakaoNickname: null },
    });

    await logMemberChange(prisma, { member, adminId: null, action: "NORMALIZE", before: "a", after: "b" });

    const log = await prisma.memberChangeLog.findFirstOrThrow();
    expect(log.memberLabel).toBe("daehyeok_");
    expect(log.adminId).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/log-member-change.test.ts`
Expected: FAIL — `Failed to resolve import "./log-member-change"`.

- [ ] **Step 3: 헬퍼를 만든다**

`apps/dashboard/lib/mutations/log-member-change.ts`:

```typescript
import type { MemberChangeAction, Prisma, PrismaClient } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";

export interface LogMemberChangeInput {
  member: { id: string; realName: string | null; discordHandle: string | null; kakaoNickname: string | null };
  adminId: string | null;
  action: MemberChangeAction;
  before: string | null;
  after: string | null;
}

/**
 * 회원 변경을 한 줄 남긴다. 반드시 대상 뮤테이션과 같은 트랜잭션 안에서 호출한다 —
 * 뮤테이션이 실패했는데 로그만 남으면 로그가 거짓말을 하게 된다.
 *
 * memberId를 FK로 걸지 않으므로 회원이 지워지면 조회가 실패한다. 그래서 그 시점의
 * 표시 이름을 memberLabel에 스냅샷으로 함께 남긴다.
 */
export async function logMemberChange(
  tx: Prisma.TransactionClient | PrismaClient,
  input: LogMemberChangeInput
): Promise<void> {
  await tx.memberChangeLog.create({
    data: {
      memberId: input.member.id,
      memberLabel: getDisplayName(input.member),
      adminId: input.adminId,
      action: input.action,
      before: input.before,
      after: input.after,
    },
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/log-member-change.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/mutations/log-member-change.ts apps/dashboard/lib/mutations/log-member-change.test.ts
git commit -m "feat(members): add the member change log helper"
```

---

### Task 3: `absorbMember` · `releaseMember`에 운영진 귀속

**Files:**
- Modify: `apps/dashboard/lib/mutations/absorb-member.ts`
- Modify: `apps/dashboard/lib/mutations/release-member.ts`
- Modify: `apps/dashboard/lib/mutations/absorb-member.test.ts`
- Modify: `apps/dashboard/lib/mutations/release-member.test.ts`
- Modify: `apps/dashboard/app/link-accounts/actions.ts`

**Interfaces:**
- Consumes: `logMemberChange` (Task 2).
- Produces: `absorbMember(prisma, loserId, survivorId, adminId: string | null)`, `releaseMember(prisma, tombstoneId, adminId: string | null)`. 시그니처가 바뀐다.

- [ ] **Step 1: 실패하는 테스트를 더한다**

`apps/dashboard/lib/mutations/absorb-member.test.ts` 끝에 추가한다. 이 파일의 기존 헬퍼와 관례를 그대로 쓴다.

```typescript
describe("absorbMember 로그", () => {
  it("흡수를 로그로 남긴다", async () => {
    const survivor = await prisma.member.create({
      data: { realName: "유대혁", discordUserId: "d-1", discordHandle: "daehyeok_" },
    });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id, "admin-1");

    const log = await prisma.memberChangeLog.findFirstOrThrow();
    expect(log.action).toBe("ABSORB");
    expect(log.adminId).toBe("admin-1");
    expect(log.memberId).toBe(loser.id);
    expect(log.before).toBe("유대혁/95/유대혁#KR1");
    expect(log.after).toBe("유대혁");
  });

  it("흡수가 거부되면 로그도 남지 않는다", async () => {
    const survivor = await prisma.member.create({ data: { realName: "유대혁", discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoUserId: "k-1", kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await expect(absorbMember(prisma, loser.id, survivor.id, "admin-1")).rejects.toThrow();

    expect(await prisma.memberChangeLog.count()).toBe(0);
  });
});
```

`apps/dashboard/lib/mutations/release-member.test.ts` 끝에 추가한다:

```typescript
describe("releaseMember 로그", () => {
  it("해제를 로그로 남긴다", async () => {
    const survivor = await prisma.member.create({
      data: { realName: "유대혁", discordUserId: "d-1", discordHandle: "daehyeok_" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", mergedIntoId: survivor.id },
    });

    await releaseMember(prisma, tombstone.id, "admin-2");

    const log = await prisma.memberChangeLog.findFirstOrThrow();
    expect(log.action).toBe("RELEASE");
    expect(log.adminId).toBe("admin-2");
    expect(log.memberId).toBe(tombstone.id);
    expect(log.before).toBe("유대혁");
    expect(log.after).toBe("유대혁/95/유대혁#KR1");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.test.ts`
Expected: FAIL — 인자 개수 불일치 또는 `findFirstOrThrow`가 아무것도 못 찾음.

- [ ] **Step 3: `absorbMember`를 고친다**

`apps/dashboard/lib/mutations/absorb-member.ts`의 시그니처와 트랜잭션 끝을 바꾼다. **기존 가드와 묘비 재지정 로직은 그대로 둔다.**

```typescript
export async function absorbMember(
  prisma: PrismaClient,
  loserId: string,
  survivorId: string,
  adminId: string | null
): Promise<void> {
```

트랜잭션 안, `loser`의 `mergedIntoId`를 심는 마지막 `update` **다음에** 추가한다:

```typescript
      await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });

      await logMemberChange(tx, {
        member: loser,
        adminId,
        action: "ABSORB",
        before: loser.kakaoNickname,
        after: getDisplayName(survivor),
      });
```

파일 상단에 임포트를 더한다:

```typescript
import { getDisplayName } from "@lolpamin/core";
import { logMemberChange } from "./log-member-change";
```

- [ ] **Step 4: `releaseMember`를 고친다**

`apps/dashboard/lib/mutations/release-member.ts`:

```typescript
export async function releaseMember(
  prisma: PrismaClient,
  tombstoneId: string,
  adminId: string | null
): Promise<void> {
```

트랜잭션 안 `recomputeLastActiveAt(tx, survivorId)` 다음에 추가한다:

```typescript
      const survivor = await tx.member.findUniqueOrThrow({ where: { id: survivorId } });
      await logMemberChange(tx, {
        member: tombstone,
        adminId,
        action: "RELEASE",
        before: getDisplayName(survivor),
        after: tombstone.kakaoNickname,
      });
```

임포트를 더한다:

```typescript
import { getDisplayName } from "@lolpamin/core";
import { logMemberChange } from "./log-member-change";
```

- [ ] **Step 5: 서버 액션이 운영진을 넘기게 한다**

`apps/dashboard/app/link-accounts/actions.ts`에서 `requireAdmin()`의 반환값을 받아 넘긴다. **`await requireAdmin()`은 지금처럼 본문 첫 줄에 그대로 둔다.**

```typescript
export async function absorbMemberAction(loserId: string, survivorId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin();
  // ...기존 검증 유지...
  await absorbMember(prisma, loserId, survivorId, admin.id);
```

`releaseMemberAction`도 같은 방식으로 `admin.id`를 넘긴다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.test.ts apps/dashboard/lib/auth/action-guards.test.ts`
Expected: 전부 통과. `action-guards.test.ts`는 수정하지 않는다.

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add apps/dashboard/lib/mutations/absorb-member.ts apps/dashboard/lib/mutations/release-member.ts apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.test.ts apps/dashboard/app/link-accounts/actions.ts
git commit -m "feat(members): record who linked and unlinked an account"
```

---

### Task 4: 실명 수정 · 삭제 · 정규화에 운영진 귀속

**Files:**
- Modify: `apps/dashboard/lib/mutations/update-member-real-name.ts`
- Modify: `apps/dashboard/lib/mutations/delete-member.ts`
- Modify: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`
- Modify: `apps/dashboard/lib/mutations/update-member-real-name.test.ts`
- Modify: `apps/dashboard/lib/mutations/delete-member.test.ts`
- Modify: `apps/dashboard/app/members/actions.ts`

**Interfaces:**
- Consumes: `logMemberChange` (Task 2).
- Produces: `updateMemberRealName(prisma, memberId, realName, adminId: string | null)`, `deleteMember(prisma, memberId, adminId: string | null)`. 시그니처가 바뀐다. `normalizeKakaoNicknames(prisma)`는 시그니처가 그대로다 — CLI 스크립트라 세션이 없어 `adminId`는 항상 `null`이다.

- [ ] **Step 1: 실패하는 테스트를 더한다**

`apps/dashboard/lib/mutations/update-member-real-name.test.ts` 끝에:

```typescript
describe("updateMemberRealName 로그", () => {
  it("이전 실명과 새 실명을 남긴다", async () => {
    const member = await prisma.member.create({ data: { realName: "유대현", kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberRealName(prisma, member.id, "유대혁", "admin-1");

    const log = await prisma.memberChangeLog.findFirstOrThrow();
    expect(log.action).toBe("RENAME");
    expect(log.before).toBe("유대현");
    expect(log.after).toBe("유대혁");
    expect(log.adminId).toBe("admin-1");
  });
});
```

`apps/dashboard/lib/mutations/delete-member.test.ts` 끝에:

```typescript
describe("deleteMember 로그", () => {
  it("삭제된 회원의 로그가 남는다", async () => {
    const member = await prisma.member.create({ data: { realName: "박시형", kakaoNickname: "박시형/95/즐겜#KR1" } });

    await deleteMember(prisma, member.id, "admin-1");

    expect(await prisma.member.count()).toBe(0);
    const log = await prisma.memberChangeLog.findFirstOrThrow();
    expect(log.action).toBe("DELETE");
    expect(log.memberLabel).toBe("박시형");
    expect(log.before).toBe("박시형");
    expect(log.after).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/update-member-real-name.test.ts apps/dashboard/lib/mutations/delete-member.test.ts`
Expected: FAIL.

- [ ] **Step 3: `updateMemberRealName`을 고친다**

`apps/dashboard/lib/mutations/update-member-real-name.ts` 전체를 다음으로 바꾼다:

```typescript
import type { PrismaClient } from "@lolpamin/db";
import { logMemberChange } from "./log-member-change";

export async function updateMemberRealName(
  prisma: PrismaClient,
  memberId: string,
  realName: string,
  adminId: string | null
): Promise<void> {
  const trimmed = realName.trim();
  const next = trimmed.length > 0 ? trimmed : null;

  await prisma.$transaction(
    async (tx) => {
      const before = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
      await tx.member.update({ where: { id: memberId }, data: { realName: next } });
      await logMemberChange(tx, {
        member: before,
        adminId,
        action: "RENAME",
        before: before.realName,
        after: next,
      });
    },
    { timeout: 20000 },
  );
}
```

- [ ] **Step 4: `deleteMember`를 고친다**

시그니처에 `adminId: string | null`을 더하고, 트랜잭션 안에서 **회원을 지우기 전에** 대상을 읽어두었다가 지운 뒤 로그를 쓴다. `findUniqueOrThrow`의 반환값을 버리지 말고 쓴다:

```typescript
export async function deleteMember(
  prisma: PrismaClient,
  memberId: string,
  adminId: string | null
): Promise<DeleteMemberOutput> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.member.findUniqueOrThrow({ where: { id: memberId } });

    // ...기존 묘비 수집과 삭제 로직 그대로...

    await tx.member.deleteMany({ where: { id: { in: ids } } });

    await logMemberChange(tx, {
      member: target,
      adminId,
      action: "DELETE",
      before: getDisplayName(target),
      after: null,
    });

    return { mentionLogs: mentionLogs.count, gameParticipants: gameParticipants.count };
  });
}
```

임포트를 더한다:

```typescript
import { getDisplayName } from "@lolpamin/core";
import { logMemberChange } from "./log-member-change";
```

- [ ] **Step 5: 정규화에 로그를 더한다**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`에서 생존자의 닉네임을 정규형으로 갱신하는 `update` 다음에 로그를 쓴다. 값이 실제로 바뀔 때만 남긴다 — 안 바뀐 회원까지 남기면 스크립트를 돌릴 때마다 로그가 부풀어 오른다.

```typescript
      if (survivor.kakaoNickname !== normalized) {
        await logMemberChange(tx, {
          member: survivor,
          adminId: null,
          action: "NORMALIZE",
          before: survivor.kakaoNickname,
          after: normalized,
        });
      }
```

`adminId`는 항상 `null`이다 — 이 함수는 CLI 스크립트로만 실행되어 세션이 없다.

- [ ] **Step 6: 서버 액션이 운영진을 넘기게 한다**

`apps/dashboard/app/members/actions.ts`:

```typescript
export async function deleteMemberAction(memberId: string): Promise<DeleteMemberOutput> {
  const admin = await requireAdmin();
  if (!memberId) {
    throw new Error("memberId is required");
  }
  const result = await deleteMember(prisma, memberId, admin.id);
```

```typescript
export async function updateMemberRealNameAction(
  memberId: string,
  realName: string
): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  try {
    await updateMemberRealName(prisma, memberId, realName, admin.id);
```

두 액션 모두 `revalidatePath("/link-accounts")`가 이미 있는지 확인하고, `deleteMemberAction`에는 있고 `updateMemberRealNameAction`에는 없으므로 후자에 추가한다 — 변경 기록이 그 화면에 뜨기 때문이다.

- [ ] **Step 7: 통과와 타입을 확인한다**

Run: `npx vitest run`
Expected: 전부 통과.

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

- [ ] **Step 8: 커밋**

```bash
git add apps/dashboard/lib/mutations apps/dashboard/app/members/actions.ts
git commit -m "feat(members): record who renamed, deleted and normalized a member"
```

---

### Task 5: `cancelGameResult` — 되돌리기

**Files:**
- Create: `apps/dashboard/lib/mutations/cancel-game-result.ts`
- Create: `apps/dashboard/lib/mutations/cancel-game-result.test.ts`
- Modify: `apps/dashboard/lib/mutations/save-game-result.ts`
- Modify: `apps/dashboard/app/matches/actions.ts`

**Interfaces:**
- Produces: `cancelGameResult(prisma, gameResultId, adminId: string | null): Promise<void>`, `CANCEL_GAME_RESULT_ERRORS`. Task 7이 쓴다. `SaveGameResultInput`에 `createdById?: string | null`이 더해진다.

이 태스크가 이 계획의 핵심이다. 정확성이 여기서 결정된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/cancel-game-result.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { saveGameResult } from "./save-game-result";
import { cancelGameResult, CANCEL_GAME_RESULT_ERRORS } from "./cancel-game-result";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// 경기에 참가하려면 디스코드와 카톡이 모두 연결돼 있어야 한다(saveGameResult의 가드).
async function createPlayers(count: number, offset = 0) {
  const members = [];
  for (let i = 0; i < count; i++) {
    members.push(
      await prisma.member.create({
        data: {
          realName: `선수${offset + i}`,
          discordUserId: `d-${offset + i}`,
          discordHandle: `player${offset + i}`,
          kakaoNickname: `선수${offset + i}/95/p${offset + i}#KR1`,
          elo: 1000,
        },
      })
    );
  }
  return members;
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cancelGameResult", () => {
  it("참가자 전원의 elo를 eloBefore로 되돌린다", async () => {
    const players = await createPlayers(4);
    const blue = players.slice(0, 2).map((p) => p.id);
    const red = players.slice(2).map((p) => p.id);

    const saved = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: blue,
      redMemberIds: red,
      winner: "BLUE",
      createdById: "admin-1",
    });

    const afterSave = await prisma.member.findMany({ orderBy: { id: "asc" } });
    expect(afterSave.some((m) => m.elo !== 1000)).toBe(true);

    await cancelGameResult(prisma, saved.gameResultId, "admin-2");

    const afterCancel = await prisma.member.findMany({ orderBy: { id: "asc" } });
    expect(afterCancel.every((m) => m.elo === 1000)).toBe(true);

    const game = await prisma.gameResult.findUniqueOrThrow({ where: { id: saved.gameResultId } });
    expect(game.cancelledAt).not.toBeNull();
    expect(game.cancelledById).toBe("admin-2");
  });

  it("참가 기록은 지우지 않는다", async () => {
    const players = await createPlayers(4);
    const saved = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: players.slice(0, 2).map((p) => p.id),
      redMemberIds: players.slice(2).map((p) => p.id),
      winner: "BLUE",
      createdById: "admin-1",
    });

    await cancelGameResult(prisma, saved.gameResultId, "admin-1");

    expect(await prisma.gameParticipant.count({ where: { gameResultId: saved.gameResultId } })).toBe(4);
  });

  it("두 판을 역순으로 취소하면 처음 값으로 돌아온다", async () => {
    const players = await createPlayers(4);
    const blue = players.slice(0, 2).map((p) => p.id);
    const red = players.slice(2).map((p) => p.id);

    const first = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T20:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "BLUE", createdById: "admin-1",
    });
    const second = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "RED", createdById: "admin-1",
    });

    await cancelGameResult(prisma, second.gameResultId, "admin-1");
    await cancelGameResult(prisma, first.gameResultId, "admin-1");

    const members = await prisma.member.findMany();
    expect(members.every((m) => m.elo === 1000)).toBe(true);
  });

  it("가장 최근이 아닌 경기는 거부하고 아무것도 바꾸지 않는다", async () => {
    const players = await createPlayers(4);
    const blue = players.slice(0, 2).map((p) => p.id);
    const red = players.slice(2).map((p) => p.id);

    const first = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T20:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "BLUE", createdById: "admin-1",
    });
    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "RED", createdById: "admin-1",
    });

    const before = await prisma.member.findMany({ orderBy: { id: "asc" } });

    await expect(cancelGameResult(prisma, first.gameResultId, "admin-1")).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.notLatest
    );

    const after = await prisma.member.findMany({ orderBy: { id: "asc" } });
    expect(after.map((m) => m.elo)).toEqual(before.map((m) => m.elo));
    const game = await prisma.gameResult.findUniqueOrThrow({ where: { id: first.gameResultId } });
    expect(game.cancelledAt).toBeNull();
  });

  it("참가자가 겹치지 않아도 LIFO를 지킨다", async () => {
    const groupA = await createPlayers(4, 0);
    const groupB = await createPlayers(4, 10);

    const first = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T20:00:00Z"),
      blueMemberIds: groupA.slice(0, 2).map((p) => p.id),
      redMemberIds: groupA.slice(2).map((p) => p.id),
      winner: "BLUE", createdById: "admin-1",
    });
    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: groupB.slice(0, 2).map((p) => p.id),
      redMemberIds: groupB.slice(2).map((p) => p.id),
      winner: "BLUE", createdById: "admin-1",
    });

    await expect(cancelGameResult(prisma, first.gameResultId, "admin-1")).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.notLatest
    );
  });

  it("이미 취소된 경기는 거부한다", async () => {
    const players = await createPlayers(4);
    const saved = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: players.slice(0, 2).map((p) => p.id),
      redMemberIds: players.slice(2).map((p) => p.id),
      winner: "BLUE", createdById: "admin-1",
    });

    await cancelGameResult(prisma, saved.gameResultId, "admin-1");

    await expect(cancelGameResult(prisma, saved.gameResultId, "admin-1")).rejects.toThrow(
      CANCEL_GAME_RESULT_ERRORS.alreadyCancelled
    );
  });

  it("playedAt이 과거여도 취소 대상은 입력 순서로 정해진다", async () => {
    const players = await createPlayers(4);
    const blue = players.slice(0, 2).map((p) => p.id);
    const red = players.slice(2).map((p) => p.id);

    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "BLUE", createdById: "admin-1",
    });
    // 나중에 입력했지만 경기 날짜는 과거다. 이쪽이 취소 대상이어야 한다.
    const backdated = await saveGameResult(prisma, {
      playedAt: new Date("2026-08-30T21:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "RED", createdById: "admin-1",
    });

    await expect(cancelGameResult(prisma, backdated.gameResultId, "admin-1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/cancel-game-result.test.ts`
Expected: FAIL — `Failed to resolve import "./cancel-game-result"`.

- [ ] **Step 3: `saveGameResult`에 `createdById`를 더한다**

`apps/dashboard/lib/mutations/save-game-result.ts`:

```typescript
export interface SaveGameResultInput {
  playedAt: Date;
  blueMemberIds: string[];
  redMemberIds: string[];
  winner: "BLUE" | "RED";
  createdById?: string | null;
}
```

`gameResult.create`를 바꾼다:

```typescript
    const gameResult = await tx.gameResult.create({
      data: { playedAt, winner: winner as Team, createdById: input.createdById ?? null },
    });
```

구조 분해에서 `createdById`를 함께 꺼내도 되고 `input.createdById`로 읽어도 된다. 기존 구조 분해 줄은 그대로 두고 `input.createdById`로 읽는 편이 변경이 작다.

- [ ] **Step 4: `cancelGameResult`를 만든다**

`apps/dashboard/lib/mutations/cancel-game-result.ts`:

```typescript
import type { PrismaClient } from "@lolpamin/db";

// 화면에 그대로 보여줄 안내 문구. 서버 액션은 이 목록에 있는 메시지만 통과시킨다.
export const CANCEL_GAME_RESULT_ERRORS = {
  notFound: "경기를 찾을 수 없습니다.",
  alreadyCancelled: "이미 취소된 경기입니다.",
  notLatest: "가장 최근 경기만 되돌릴 수 있습니다. 뒤에 입력된 경기를 먼저 되돌리세요.",
} as const;

/**
 * 경기를 취소하고 참가자의 elo를 그 경기 직전 값으로 되돌린다. 재계산하지 않는다.
 *
 * 대상을 "취소되지 않은 것 중 createdAt이 가장 늦은 경기" 하나로 제한하는 것이 정확성의
 * 근거다. 그러면 참가자들이 이후에 뛴 살아 있는 경기가 없으므로 현재 elo가 정확히 이
 * 경기의 eloAfter와 같고, eloBefore를 그대로 써 넣으면 된다. 이후 경기가 있더라도 이미
 * 취소됐다면 그 취소가 자기 몫을 되돌려 놓았으므로 같은 결론이 선다.
 *
 * 기준이 playedAt이 아니라 createdAt인 이유: elo는 입력한 순서대로 누적되므로, 경기
 * 날짜를 과거로 적어 나중에 입력한 판이 있어도 되돌리기는 입력 역순으로 빠져야 맞는다.
 *
 * 참가 기록은 지우지 않는다 — 취소된 뒤에도 누가 뛰었고 점수가 어떻게 움직였는지 보여야
 * 한다. 회원 병합에서 활동 기록을 옮기지 않는 것과 같은 방침이다.
 */
export async function cancelGameResult(
  prisma: PrismaClient,
  gameResultId: string,
  adminId: string | null
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const game = await tx.gameResult.findUnique({
        where: { id: gameResultId },
        include: { participants: true },
      });
      if (!game) {
        throw new Error(CANCEL_GAME_RESULT_ERRORS.notFound);
      }
      if (game.cancelledAt !== null) {
        throw new Error(CANCEL_GAME_RESULT_ERRORS.alreadyCancelled);
      }

      const latest = await tx.gameResult.findFirst({
        where: { cancelledAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (latest === null || latest.id !== game.id) {
        throw new Error(CANCEL_GAME_RESULT_ERRORS.notLatest);
      }

      for (const participant of game.participants) {
        await tx.member.update({
          where: { id: participant.memberId },
          data: { elo: participant.eloBefore },
        });
      }

      await tx.gameResult.update({
        where: { id: game.id },
        data: { cancelledAt: new Date(), cancelledById: adminId },
      });
    },
    { timeout: 20000 },
  );
}
```

`orderBy`에 `id`를 2차 키로 둔 이유: 같은 밀리초에 두 경기가 입력되면 `createdAt`만으로는 순서가 갈리지 않아 어느 쪽이 「가장 최근」인지 실행마다 달라진다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run apps/dashboard/lib/mutations/cancel-game-result.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 6: 서버 액션이 운영진을 넘기게 한다**

`apps/dashboard/app/matches/actions.ts`:

```typescript
export async function saveGameResultAction(input: SaveGameResultInput) {
  const admin = await requireAdmin();
  const result = await saveGameResult(prisma, { ...input, createdById: admin.id });
  revalidatePath("/matches");
  revalidatePath("/match-history");
  revalidatePath("/members");
  return result;
}
```

- [ ] **Step 7: 전체 스위트와 타입**

Run: `npx vitest run`
Expected: 전부 통과.

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

- [ ] **Step 8: 커밋**

```bash
git add apps/dashboard/lib/mutations/cancel-game-result.ts apps/dashboard/lib/mutations/cancel-game-result.test.ts apps/dashboard/lib/mutations/save-game-result.ts apps/dashboard/app/matches/actions.ts
git commit -m "feat(matches): let an admin undo the most recent game"
```

---

### Task 6: 경기 목록 조회

**Files:**
- Create: `apps/dashboard/lib/queries/match-history.ts`
- Create: `apps/dashboard/lib/queries/match-history.test.ts`

**Interfaces:**
- Consumes: Task 1의 컬럼, Task 5가 채우는 값.
- Produces: `getMatchHistory(): Promise<MatchHistoryRow[]>`, `interface MatchHistoryRow`, `interface MatchHistoryPlayer`. Task 7이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/queries/match-history.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/match-history.ts는 앱 싱글턴 prisma를 임포트한다. 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — members.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMatchHistory } = await import("./match-history");
const { saveGameResult } = await import("@/lib/mutations/save-game-result");
const { cancelGameResult } = await import("@/lib/mutations/cancel-game-result");

async function createPlayers(count: number) {
  const members = [];
  for (let i = 0; i < count; i++) {
    members.push(
      await prisma.member.create({
        data: {
          realName: `선수${i}`,
          discordUserId: `d-${i}`,
          discordHandle: `player${i}`,
          kakaoNickname: `선수${i}/95/p${i}#KR1`,
          elo: 1000,
        },
      })
    );
  }
  return members;
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMatchHistory", () => {
  it("입력 역순으로 돌려주고 가장 최근 한 경기에만 취소 가능 표시를 단다", async () => {
    const players = await createPlayers(4);
    const blue = players.slice(0, 2).map((p) => p.id);
    const red = players.slice(2).map((p) => p.id);

    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T20:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "BLUE", createdById: null,
    });
    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: blue, redMemberIds: red, winner: "RED", createdById: null,
    });

    const rows = await getMatchHistory();

    expect(rows).toHaveLength(2);
    expect(rows[0].winner).toBe("RED");
    expect(rows[0].canCancel).toBe(true);
    expect(rows[1].canCancel).toBe(false);
  });

  it("운영진 이름을 붙이고, 없는 운영진은 삭제된 관리자로 표시한다", async () => {
    const admin = await prisma.admin.create({ data: { username: "sujin", passwordHash: "x" } });
    const players = await createPlayers(4);

    await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: players.slice(0, 2).map((p) => p.id),
      redMemberIds: players.slice(2).map((p) => p.id),
      winner: "BLUE",
      createdById: admin.id,
    });
    await prisma.gameResult.updateMany({ data: { cancelledById: "지워진-id", cancelledAt: new Date() } });

    const rows = await getMatchHistory();

    expect(rows[0].createdByLabel).toBe("sujin");
    expect(rows[0].cancelledByLabel).toBe("삭제된 관리자");
  });

  it("취소된 경기는 참가 기록을 그대로 들고 있고 취소 가능하지 않다", async () => {
    const players = await createPlayers(4);
    const saved = await saveGameResult(prisma, {
      playedAt: new Date("2026-09-01T21:00:00Z"),
      blueMemberIds: players.slice(0, 2).map((p) => p.id),
      redMemberIds: players.slice(2).map((p) => p.id),
      winner: "BLUE", createdById: null,
    });
    await cancelGameResult(prisma, saved.gameResultId, null);

    const rows = await getMatchHistory();

    expect(rows[0].isCancelled).toBe(true);
    expect(rows[0].canCancel).toBe(false);
    expect(rows[0].players).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/queries/match-history.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 조회를 만든다**

`apps/dashboard/lib/queries/match-history.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@lolpamin/core";

export interface MatchHistoryPlayer {
  memberId: string;
  name: string;
  team: "BLUE" | "RED";
  eloBefore: number;
  eloAfter: number;
}

export interface MatchHistoryRow {
  id: string;
  playedAt: Date;
  winner: "BLUE" | "RED";
  isCancelled: boolean;
  // 취소되지 않은 것 중 입력이 가장 늦은 한 경기에만 true다.
  canCancel: boolean;
  createdAt: Date;
  createdByLabel: string | null;
  cancelledAt: Date | null;
  cancelledByLabel: string | null;
  players: MatchHistoryPlayer[];
}

// 관리자 id는 FK가 아니라서 계정이 지워지면 조회에 실패한다. 그때는 "삭제된 관리자"로
// 표시한다 — 누가 했는지는 잃더라도 무언가 했다는 사실은 남긴다.
function labelFor(adminId: string | null, byId: Map<string, string>): string | null {
  if (adminId === null) return null;
  return byId.get(adminId) ?? "삭제된 관리자";
}

export async function getMatchHistory(): Promise<MatchHistoryRow[]> {
  const [games, admins] = await Promise.all([
    prisma.gameResult.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { participants: { include: { member: true } } },
    }),
    prisma.admin.findMany({ select: { id: true, username: true } }),
  ]);

  const adminById = new Map(admins.map((a) => [a.id, a.username]));
  const latestLiveId = games.find((g) => g.cancelledAt === null)?.id ?? null;

  return games.map((g) => ({
    id: g.id,
    playedAt: g.playedAt,
    winner: g.winner as "BLUE" | "RED",
    isCancelled: g.cancelledAt !== null,
    canCancel: g.id === latestLiveId,
    createdAt: g.createdAt,
    createdByLabel: labelFor(g.createdById, adminById),
    cancelledAt: g.cancelledAt,
    cancelledByLabel: labelFor(g.cancelledById, adminById),
    players: g.participants.map((p) => ({
      memberId: p.memberId,
      name: getDisplayName(p.member),
      team: p.team as "BLUE" | "RED",
      eloBefore: p.eloBefore,
      eloAfter: p.eloAfter,
    })),
  }));
}
```

`latestLiveId`는 목록이 이미 입력 역순이라 첫 번째 살아 있는 경기를 찾으면 된다 — Task 5의 `cancelGameResult`가 쓰는 판정과 같은 정렬이다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run apps/dashboard/lib/queries/match-history.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/queries/match-history.ts apps/dashboard/lib/queries/match-history.test.ts
git commit -m "feat(matches): add the match history query"
```

---

### Task 7: 「경기 기록」 화면

**Files:**
- Create: `apps/dashboard/app/match-history/page.tsx`
- Create: `apps/dashboard/app/match-history/actions.ts`
- Create: `apps/dashboard/components/MatchHistoryList.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `getMatchHistory`, `MatchHistoryRow` (Task 6), `cancelGameResult`, `CANCEL_GAME_RESULT_ERRORS` (Task 5).
- Produces: 화면만.

- [ ] **Step 1: 내비게이션에 항목을 더한다**

`apps/dashboard/components/AppShell.tsx`:

```typescript
  activeNav: "members" | "matches" | "match-history" | "inactive" | "kakao-import" | "link-accounts" | "admins";
```

`navItems` 배열에서 `matches` 다음에 넣고, 뒤 항목들의 `icon` 번호를 하나씩 밀어 순서를 맞춘다:

```typescript
    { key: "members" as const, href: "/members", label: "회원 관리", icon: "01" },
    { key: "matches" as const, href: "/matches", label: "게임 결과 입력", icon: "02" },
    { key: "match-history" as const, href: "/match-history", label: "경기 기록", icon: "03" },
    { key: "inactive" as const, href: "/inactive", label: "미활동 리포트", icon: "04", badge: String(inactiveNavCount) },
    { key: "kakao-import" as const, href: "/kakao-import", label: "카톡 내보내기", icon: "05" },
    { key: "link-accounts" as const, href: "/link-accounts", label: "계정 연결", icon: "06" },
```

`if (currentAdmin)` 안의 관리자 항목은 `icon: "07"`로 바꾼다.

- [ ] **Step 2: 서버 액션을 만든다**

`apps/dashboard/app/match-history/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { cancelGameResult, CANCEL_GAME_RESULT_ERRORS } from "@/lib/mutations/cancel-game-result";

const KNOWN_ERRORS: string[] = Object.values(CANCEL_GAME_RESULT_ERRORS);

// 의도한 안내 문구만 화면에 그대로 보여준다. 그 외에는 Prisma의 영문 예외가 관리자
// 화면에 새어 나오므로 고정된 한글 폴백을 쓴다 — link-accounts/actions.ts와 같은 방식이다.
function messageFor(error: unknown): string {
  if (error instanceof Error && KNOWN_ERRORS.includes(error.message)) return error.message;
  return "경기를 되돌리지 못했습니다.";
}

export async function cancelGameResultAction(gameResultId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  if (!gameResultId) {
    return { error: "되돌릴 경기를 고르세요." };
  }

  try {
    await cancelGameResult(prisma, gameResultId, admin.id);
  } catch (error) {
    console.error(error);
    return { error: messageFor(error) };
  }

  revalidatePath("/match-history");
  revalidatePath("/members");
  revalidatePath("/matches");
  revalidatePath("/inactive");
  return { error: null };
}
```

- [ ] **Step 3: 목록 컴포넌트를 만든다**

`apps/dashboard/components/MatchHistoryList.tsx`. 클라이언트 컴포넌트다. 색과 크기 값은 `MemberTable.tsx`와 `AccountMappingPanel.tsx`에 이미 쓰인 값을 그대로 재사용한다.

```tsx
"use client";

import { useState } from "react";
import type { MatchHistoryRow } from "@/lib/queries/match-history";
import { cancelGameResultAction } from "@/app/match-history/actions";

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MatchHistoryList({ rows, isAdmin }: { rows: MatchHistoryRow[]; isAdmin: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleCancel(id: string) {
    setIsPending(true);
    setStatus(null);
    try {
      const { error } = await cancelGameResultAction(id);
      setStatus({ text: error ?? "경기를 되돌렸습니다.", ok: !error });
    } finally {
      setIsPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/[.06] bg-[#151A24] p-8 text-center text-[12px] text-[#6E7889]">
        아직 입력된 경기가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status && (
        <div
          className={`rounded-lg border p-2.5 text-[11.5px] ${
            status.ok
              ? "border-[#9BD173]/30 bg-[#9BD173]/[.10] text-[#9BD173]"
              : "border-[#C6553F]/40 bg-[#C6553F]/[.12] text-[#C6553F]"
          }`}
        >
          {status.text}
        </div>
      )}
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        {rows.map((m) => {
          const winners = m.players.filter((p) => p.team === m.winner);
          const losers = m.players.filter((p) => p.team !== m.winner);
          return (
            <div key={m.id} className="border-b border-white/[.04] last:border-b-0">
              <div className={`flex items-center gap-4 px-5 py-3.5 ${m.isCancelled ? "opacity-45" : ""}`}>
                <button
                  onClick={() => setOpenId(openId === m.id ? null : m.id)}
                  className="flex flex-1 items-center gap-4 text-left"
                >
                  <span className="font-mono text-[12.5px] text-[#B7C0D0]">{formatDateTime(m.playedAt)}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      m.isCancelled
                        ? "bg-[#1E2534] text-[#5C6577]"
                        : m.winner === "BLUE"
                        ? "bg-[#4472C4]/[.18] text-[#8FB4F5]"
                        : "bg-[#C6553F]/[.18] text-[#EE8B8B]"
                    }`}
                  >
                    {m.isCancelled ? "취소됨" : m.winner === "BLUE" ? "블루 승" : "레드 승"}
                  </span>
                  <span className="text-[11px] text-[#7A8496]">
                    {m.createdByLabel ?? "(스크립트)"} 입력
                    {m.cancelledByLabel && ` · ${m.cancelledByLabel} 취소`}
                  </span>
                </button>
                {isAdmin && m.canCancel && (
                  <button
                    onClick={() => handleCancel(m.id)}
                    disabled={isPending}
                    className="shrink-0 rounded-md border border-white/[.08] px-2.5 py-1 text-[11px] text-[#C6553F] disabled:cursor-not-allowed disabled:text-[#5C6577]"
                  >
                    되돌리기
                  </button>
                )}
              </div>
              {openId === m.id && (
                <div className="flex flex-col gap-1.5 border-t border-white/[.04] bg-[#12161F] px-5 py-3">
                  {[
                    { mark: "↑", tone: "text-[#9BD173]", list: winners },
                    { mark: "↓", tone: "text-[#EE8B8B]", list: losers },
                  ].map(({ mark, tone, list }) => (
                    <div key={mark} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className={`font-mono text-[12px] ${tone}`}>{mark}</span>
                      {list.map((p) => (
                        <span key={p.memberId} className="font-mono text-[11.5px] text-[#8A94A6]">
                          {p.name} {p.eloBefore}→{p.eloAfter}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 페이지를 만든다**

`apps/dashboard/app/match-history/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { MatchHistoryList } from "@/components/MatchHistoryList";
import { getMatchHistory } from "@/lib/queries/match-history";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function MatchHistoryPage() {
  const [rows, currentAdmin] = await Promise.all([getMatchHistory(), getCurrentAdmin()]);

  return (
    <AppShell
      activeNav="match-history"
      pageTitle="경기 기록"
      pageDesc="지난 내전 결과와 점수 변동 · 가장 최근 경기 되돌리기"
    >
      <div className="px-7 pb-10 pt-6">
        <MatchHistoryList rows={rows} isAdmin={currentAdmin !== null} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: 타입체크와 빌드**

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공. `/match-history`를 포함한 모든 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 6: 전체 스위트 확인 후 커밋**

Run: `npx vitest run`
Expected: 전부 통과.

```bash
git add apps/dashboard/app/match-history apps/dashboard/components/MatchHistoryList.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(match-history): add the game history screen with undo"
```

---

### Task 8: 「변경 기록」 구획

**Files:**
- Create: `apps/dashboard/lib/queries/member-change-log.ts`
- Create: `apps/dashboard/components/MemberChangeLogPanel.tsx`
- Modify: `apps/dashboard/app/link-accounts/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `MemberChangeLog`, Task 3·4가 남기는 행.
- Produces: `getMemberChangeLog(): Promise<MemberChangeLogRow[]>`, `interface MemberChangeLogRow`.

- [ ] **Step 1: 조회를 만든다**

`apps/dashboard/lib/queries/member-change-log.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import type { MemberChangeAction } from "@lolpamin/db";

export interface MemberChangeLogRow {
  id: string;
  createdAt: Date;
  // null이면 세션 없이 스크립트로 실행된 것이다.
  adminLabel: string | null;
  actionLabel: string;
  memberLabel: string;
  before: string | null;
  after: string | null;
}

const ACTION_LABELS: Record<MemberChangeAction, string> = {
  ABSORB: "연결",
  RELEASE: "끊기",
  RENAME: "실명 수정",
  DELETE: "삭제",
  NORMALIZE: "정규화",
};

// 최근 것부터 이만큼만 보여준다. 로그는 계속 쌓이는데 이 화면은 "방금 뭘 했더라"를
// 확인하는 자리라, 전부 불러올 이유가 없다.
const MAX_ROWS = 100;

export async function getMemberChangeLog(): Promise<MemberChangeLogRow[]> {
  const [logs, admins] = await Promise.all([
    prisma.memberChangeLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_ROWS }),
    prisma.admin.findMany({ select: { id: true, username: true } }),
  ]);

  const adminById = new Map(admins.map((a) => [a.id, a.username]));

  return logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    adminLabel: l.adminId === null ? null : adminById.get(l.adminId) ?? "삭제된 관리자",
    actionLabel: ACTION_LABELS[l.action],
    memberLabel: l.memberLabel,
    before: l.before,
    after: l.after,
  }));
}
```

- [ ] **Step 2: 구획 컴포넌트를 만든다**

`apps/dashboard/components/MemberChangeLogPanel.tsx`. 서버 컴포넌트로 충분하다 — 상호작용이 없다.

```tsx
import type { MemberChangeLogRow } from "@/lib/queries/member-change-log";

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MemberChangeLogPanel({ rows }: { rows: MemberChangeLogRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
        <span className="text-[12.5px] font-bold">변경 기록</span>
        <span className="font-mono text-[11px] text-[#7A8496]">{rows.length}</span>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[.04] px-4 py-2 last:border-b-0"
          >
            <span className="font-mono text-[11px] text-[#7A8496]">{formatDateTime(r.createdAt)}</span>
            <span className="text-[11.5px] text-[#B7C0D0]">{r.adminLabel ?? "(스크립트)"}</span>
            <span className="rounded-md bg-[#1E2534] px-2 py-0.5 text-[10.5px] font-semibold text-[#8FB4F5]">
              {r.actionLabel}
            </span>
            <span className="font-mono text-[11px] text-[#8A94A6]">
              {r.before ?? "-"}
              {r.after !== null && ` → ${r.after}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 페이지에 붙인다**

`apps/dashboard/app/link-accounts/page.tsx`의 `Promise.all`에 `getMemberChangeLog()`를 더하고, `AccountMappingPanel` 아래에 구획을 넣는다. 바깥 `div`에 세로 간격이 없으면 `flex flex-col gap-4`로 감싼다.

```tsx
import { getMemberChangeLog } from "@/lib/queries/member-change-log";
import { MemberChangeLogPanel } from "@/components/MemberChangeLogPanel";
```

```tsx
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <AccountMappingPanel {...} />
        <MemberChangeLogPanel rows={changeLog} />
      </div>
```

- [ ] **Step 4: 타입체크와 빌드**

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/queries/member-change-log.ts apps/dashboard/components/MemberChangeLogPanel.tsx apps/dashboard/app/link-accounts/page.tsx
git commit -m "feat(link-accounts): show who changed which member"
```

---

### Task 9: 취소된 경기를 내전 횟수에서 뺀다

**Files:**
- Modify: `apps/dashboard/lib/queries/members.ts`
- Modify: `apps/dashboard/lib/queries/inactive.ts`
- Modify: `apps/dashboard/lib/queries/inactive.test.ts`

**Interfaces:**
- Consumes: Task 1의 `cancelledAt`.
- Produces: 없음. 기존 숫자의 의미만 바로잡는다.

- [ ] **Step 1: 실패하는 테스트를 더한다**

`apps/dashboard/lib/queries/inactive.test.ts` 끝에 추가한다. 이 파일의 기존 관례(`vi.mock` 스왑, 헬퍼)를 그대로 쓴다.

```typescript
describe("취소된 경기와 내전 횟수", () => {
  it("취소된 경기는 내전 횟수에 잡히지 않는다", async () => {
    await resetDatabase(prisma);
    const member = await prisma.member.create({
      data: {
        realName: "유대혁", discordUserId: "d-1", discordHandle: "daehyeok_",
        kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: daysAgo(40),
      },
    });
    const cancelled = await prisma.gameResult.create({
      data: { playedAt: new Date(), winner: "BLUE", cancelledAt: new Date() },
    });
    await prisma.gameParticipant.create({
      data: { gameResultId: cancelled.id, memberId: member.id, team: "BLUE", eloBefore: 1000, eloAfter: 1015 },
    });

    const data = await getInactiveReportData();

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].gameCount).toBe(0);
  });
});
```

`daysAgo` 헬퍼가 이 파일에 없으면 파일 안의 기존 날짜 만들기 방식을 그대로 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run apps/dashboard/lib/queries/inactive.test.ts`
Expected: FAIL — `expected 1 to be 0`.

- [ ] **Step 3: 두 조회를 고친다**

`apps/dashboard/lib/queries/inactive.ts`의 `_count`에 조건을 단다:

```typescript
      _count: { select: { participants: { where: { gameResult: { cancelledAt: null } } } } },
```

`apps/dashboard/lib/queries/members.ts`도 같은 조건을 단다. **단, 삭제 확인창 숫자는 예외다.** 그 숫자는 「지워질 행이 몇 개인가」이고 취소된 경기의 참가 기록도 함께 지워지므로 전부 세야 한다. 그래서 두 값을 따로 가져온다:

```typescript
    include: {
      _count: {
        select: {
          mentionLogs: true,
          // 삭제 확인창용 — 취소 여부와 무관하게 지워질 행을 전부 센다.
          participants: true,
        },
      },
      // 화면에 보여줄 내전 횟수 — 취소된 경기는 뺀다.
      ...
    },
```

`members.ts`에서 화면용 내전 횟수를 쓰는 자리가 있으면 그쪽만 조건부 집계로 바꾸고, `gameCount`(삭제 확인창)는 그대로 둔다. 두 값의 쓰임을 구분하는 주석을 남긴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 통과. 특히 `members.test.ts`의 삭제 확인창 숫자 테스트가 그대로 통과해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/queries/members.ts apps/dashboard/lib/queries/inactive.ts apps/dashboard/lib/queries/inactive.test.ts
git commit -m "fix(queries): stop counting cancelled games as matches played"
```

---

### Task 10: 로컬 검증과 배포

**Files:** 없음 — 검증과 배포만 한다.

**Interfaces:** 없음.

- [ ] **Step 1: 전체 테스트와 빌드**

Run: `npx vitest run`
Expected: 전부 통과.

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공, 모든 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 2: 개발 DB에 마이그레이션을 적용한다**

먼저 백업한다:

```bash
docker exec -i dashboard-implementation-postgres-1 pg_dump -U lolpamin -d lolpamin -Fc > lolpamin-dev-before-game-log.dump
```

```bash
DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin" npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Expected: `All migrations have been successfully applied.`

- [ ] **Step 3: 로컬 화면에서 확인한다**

```bash
DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin" npm run dev --workspace=dashboard
```

`/matches`에서 경기를 하나 입력하고 `/match-history`에서 확인한다: 목록에 뜨는지, 펼치면 오른 사람과 내린 사람이 갈려 보이는지, 입력한 운영진 이름이 뜨는지, 「되돌리기」가 가장 최근 한 판에만 붙는지. 되돌린 뒤 `/members`에서 그 참가자들의 ELO가 원래대로 돌아왔는지, `/match-history`에서 「취소됨 · 누가 취소」로 바뀌었는지.

`/link-accounts`에서 계정을 하나 연결하고 「변경 기록」에 「연결」 줄이 뜨는지, 끊으면 「끊기」 줄이 더 붙는지 확인한다.

확인 후 개발 서버를 종료한다.

- [ ] **Step 4: 프로덕션 배포**

**마이그레이션을 컨테이너 교체보다 먼저 적용한다.** 신 코드는 구 스키마에서 즉시 죽고, `discord-bot`은 스스로 마이그레이션하지 않는다.

프로덕션 DB를 먼저 백업한다:

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U lolpamin -d lolpamin -Fc > ~/lolpamin-before-game-log-$(date +%F-%H%M%S).dump'
```

코드를 보낸다. **`git archive | tar x`는 덮어쓰기만 하고 삭제하지 않는다.** 이번 계획은 파일을 지우지 않으므로 문제없지만, 보낸 뒤 서버 파일 목록을 `git ls-files`와 대조해 잔여 파일이 없는지 확인한다:

```bash
git archive HEAD | ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'tar x -C ~/lolpamin'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && find apps packages -type f -not -path "*/node_modules/*" -not -path "*/.next/*" | sort' > /tmp/onserver.txt
git ls-files apps packages | sort > /tmp/tracked.txt
comm -23 /tmp/onserver.txt /tmp/tracked.txt
```

Expected: 마지막 명령의 출력이 비어 있다.

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml build dashboard discord-bot'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml run --rm dashboard npx prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml up -d'
```

이 서버는 `ubuntu` 계정이 docker 그룹에 없어 모든 docker 명령에 `sudo`가 필요하다. 빌드는 vCPU 1개라 수 분 걸린다.

- [ ] **Step 5: 배포 확인**

```bash
for p in /match-history /matches /members /link-accounts; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://168.107.53.72:3200$p")  $p"
done
```

Expected: 전부 `200`.

브라우저에서 `http://168.107.53.72:3200/match-history`에 로그인해 경기 하나를 입력 → 기록 확인 → 되돌리기 → ELO 복원 확인을 한 번씩 해 본다.

---

## Self-Review

**스펙 커버리지** — 스펙의 각 절이 어느 태스크로 가는지:

| 스펙 절 | 태스크 |
|---|---|
| 데이터 모델 (경기 컬럼 3개) | Task 1 |
| 데이터 모델 (`MemberChangeLog`) | Task 1, 2 |
| 되돌리기 규칙과 정확성 | Task 5 |
| 취소가 하는 일 | Task 5 |
| 화면 `/match-history` | Task 6, 7 |
| 화면 「변경 기록」 | Task 8 |
| 내비게이션 | Task 7 |
| 운영진 귀속 시그니처 변경 | Task 3, 4, 5 |
| 취소된 경기를 내전 횟수에서 제외 | Task 9 |
| 에러 처리 | Task 5(문구), 7(액션) |
| 테스트 전략 | Task 2·3·4·5·6·9의 테스트 단계 |

빠진 요구사항 없음.

**타입 일관성** — `MatchHistoryRow`/`MatchHistoryPlayer`(Task 6 정의 → Task 7 사용), `MemberChangeLogRow`(Task 8 정의·사용), `LogMemberChangeInput`(Task 2 정의 → Task 3·4 사용), `CANCEL_GAME_RESULT_ERRORS`(Task 5 정의 → Task 7 사용) 모두 이름과 필드가 일치한다. `adminId: string | null` 인자 순서가 네 뮤테이션에서 모두 마지막이다.

**알려진 판단** — Task 9의 `members.ts` 수정은 그 파일의 현재 `_count` 구조에 따라 형태가 달라질 수 있어 지시가 조건부다. 구현자가 파일을 읽고 화면용 횟수와 삭제 확인창 숫자를 구분하되, 삭제 확인창 숫자는 취소된 경기까지 세는 현재 동작을 유지해야 한다.
