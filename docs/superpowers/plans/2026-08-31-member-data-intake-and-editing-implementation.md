# Member Data Intake and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디스코드 회원이 시스템에 들어올 경로를 만들고, 카톡 닉네임의 괄호 표기 때문에 갈라진 회원을 하나로 합치며, 실명을 자동으로 채우고 화면에서 고칠 수 있게 하고, 회원 목록을 정렬 가능하게 한다.

**Architecture:** 외부 API(디스코드)는 얇은 어댑터로 떼어내고 DB 반영 로직만 테스트한다. 닉네임 정규화는 `packages/core`의 순수 함수로 두고 임포트 경로가 그것을 쓴다. 기존 데이터는 일회성 스크립트로 정규화·병합한다. 정렬은 Prisma `orderBy`로 처리한다. 스키마 변경은 없다.

**Tech Stack:** TypeScript, Next.js 14 App Router(서버 액션, 서버 컴포넌트), Prisma 5 + PostgreSQL, Vitest(순수 함수 단위 테스트 + `DATABASE_URL_TEST` 대상 통합 테스트), 디스코드 REST API v10. 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-08-31-member-data-intake-and-editing-design.md`

## Global Constraints

- 스키마를 변경하지 않는다. 기존 `Member` 필드만 쓴다.
- 데이터를 바꾸는 모든 서버 액션은 본문에서 데이터에 손대기 전에 `await requireAdmin()`을 호출한다. `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 검사하며, 그 테스트를 수정해서 통과시키지 않는다.
- DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다 (`apps/dashboard/lib/mutations/delete-member.test.ts`와 동일한 형태). 가드 없이 쓰면 개발 DB가 지워진다.
- `Member.realName`이 이미 채워져 있으면 어떤 자동 경로도 덮어쓰지 않는다. 사람이 고친 값이 우선이다.
- 괄호 제거 규칙: 첫 번째 여는 괄호(`(` 또는 전각 `（`)부터 문자열 끝까지 잘라내고 양끝 공백 제거. 닫는 괄호를 요구하지 않는다.
- 병합 시 생존자의 `elo`는 유지한다. ELO를 합치거나 평균 내지 않는다.
- `discordHandle`에는 디스코드 `username`을 저장한다. `global_name`은 쓰지 않는다.
- 새 npm 의존성을 추가하지 않는다.
- 이 리포의 뮤테이션 헬퍼는 `prisma`를 첫 번째 인자로 받는다. 새 헬퍼도 같은 형태를 따른다.

---

## File Structure

```
packages/core/src/
  normalize-kakao-nickname.ts          # 순수: 괄호 제거 + 실명 추출
  normalize-kakao-nickname.test.ts
  index.ts                             # 수정: 새 모듈 re-export

apps/dashboard/
  lib/kakao-import/process-export.ts   # 수정: 정규화 + 실명 자동 채우기
  lib/kakao-import/process-export.test.ts  # 수정: 괄호/실명 케이스 추가
  lib/mutations/
    normalize-kakao-nicknames.ts       # 일회성 정리·병합 (테스트 가능한 함수)
    normalize-kakao-nicknames.test.ts
    import-discord-members.ts          # 디스코드 멤버 배열 → Member upsert
    import-discord-members.test.ts
    update-member-real-name.ts         # 실명 수정
    update-member-real-name.test.ts
  lib/discord/
    fetch-guild-members.ts             # 얇은 어댑터 (테스트 없음)
  lib/queries/members.ts               # 수정: 정렬
  lib/queries/members.test.ts          # 신규: 정렬 테스트
  scripts/
    normalize-kakao-nicknames.ts       # CLI 진입점 (npx tsx로 실행)
  app/link-accounts/actions.ts         # 수정: importDiscordMembersAction 추가
  app/members/actions.ts               # 수정: updateMemberRealNameAction 추가
  app/members/page.tsx                 # 수정: sort/dir 파라미터 전달
  components/
    AccountMappingPanel.tsx            # 수정: 가져오기 버튼
    MemberTable.tsx                    # 수정: 정렬 헤더 + 실명 편집 셀
    MemberRealNameCell.tsx             # 신규 client: 인라인 편집
```

---

### Task 1: `normalizeKakaoNickname` — 괄호 제거와 실명 추출

**Files:**
- Create: `packages/core/src/normalize-kakao-nickname.ts`
- Create: `packages/core/src/normalize-kakao-nickname.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 없음 — 순수 문자열 처리.
- Produces: `normalizeKakaoNickname(raw: string): string`, `realNameFromKakaoNickname(nickname: string): string | null`. Task 2(임포트), Task 3(정리 스크립트)이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/normalize-kakao-nickname.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "./normalize-kakao-nickname";

describe("normalizeKakaoNickname", () => {
  it("leaves a nickname without parentheses untouched", () => {
    expect(normalizeKakaoNickname("김민준/94/늑 대#1003")).toBe("김민준/94/늑 대#1003");
  });

  it("drops a parenthesised note and the space before it", () => {
    expect(normalizeKakaoNickname("유승수/98/ModCow#KR98(7시30분 도착)")).toBe("유승수/98/ModCow#KR98");
  });

  it("drops an unclosed parenthesised note", () => {
    expect(normalizeKakaoNickname("손민준/99/fukcin216 (8시 30분")).toBe("손민준/99/fukcin216");
  });

  it("drops a full-width parenthesised note", () => {
    expect(normalizeKakaoNickname("박지현/95/사육사#1003（늦음）")).toBe("박지현/95/사육사#1003");
  });

  it("keeps spaces inside the nickname itself", () => {
    expect(normalizeKakaoNickname("  김민준/94/늑 대#1003  ")).toBe("김민준/94/늑 대#1003");
  });

  it("returns an empty string when the whole value is a note", () => {
    expect(normalizeKakaoNickname("(8시 도착)")).toBe("");
  });
});

describe("realNameFromKakaoNickname", () => {
  it("takes the segment before the first slash", () => {
    expect(realNameFromKakaoNickname("김민준/94/늑 대#1003")).toBe("김민준");
  });

  it("takes the whole value when there is no slash", () => {
    expect(realNameFromKakaoNickname("모임장")).toBe("모임장");
  });

  it("trims the segment", () => {
    expect(realNameFromKakaoNickname(" 김민준 /94/늑 대#1003")).toBe("김민준");
  });

  it("returns null when the first segment is empty", () => {
    expect(realNameFromKakaoNickname("/94/늑 대#1003")).toBeNull();
    expect(realNameFromKakaoNickname("")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root packages/core src/normalize-kakao-nickname.test.ts`
Expected: FAIL — `Failed to load url ./normalize-kakao-nickname`

- [ ] **Step 3: 구현 작성**

`packages/core/src/normalize-kakao-nickname.ts`:

```typescript
// 카톡 닉네임 뒤에는 "(7시30분 도착)" 같은 메모가 붙는 일이 잦다. 그 메모까지 포함해
// 저장하면 같은 사람이 메모를 적은 날과 안 적은 날에 서로 다른 회원으로 갈라진다.
// 닫는 괄호를 요구하지 않는 이유는 실제 데이터에 "(8시 30분"처럼 닫히지 않은 표기가 있기 때문이다.
export function normalizeKakaoNickname(raw: string): string {
  const noteStart = raw.search(/[(（]/);
  const withoutNote = noteStart === -1 ? raw : raw.slice(0, noteStart);
  return withoutNote.trim();
}

// "실명/나이/닉네임#태그" 관례의 첫 조각. parseKakaoNickname과 달리 세 조각을
// 요구하지 않는다 — 관례를 따르지 않는 닉네임에서도 실명 후보를 얻기 위해서다.
export function realNameFromKakaoNickname(nickname: string): string | null {
  const firstSegment = nickname.split("/")[0].trim();
  return firstSegment.length > 0 ? firstSegment : null;
}
```

- [ ] **Step 4: index에서 내보내기**

`packages/core/src/index.ts`의 마지막 줄 뒤에 추가한다:

```typescript
export * from "./normalize-kakao-nickname";
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run --root packages/core src/normalize-kakao-nickname.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/normalize-kakao-nickname.ts packages/core/src/normalize-kakao-nickname.test.ts packages/core/src/index.ts
git commit -m "feat(core): normalize kakao nicknames and extract the real name"
```

---

### Task 2: 임포트가 정규화된 닉네임을 쓰고 실명을 채우게 한다

**Files:**
- Modify: `apps/dashboard/lib/kakao-import/process-export.ts`
- Modify: `apps/dashboard/lib/kakao-import/process-export.test.ts`

**Interfaces:**
- Consumes: `normalizeKakaoNickname`, `realNameFromKakaoNickname` (Task 1).
- Produces: 동작 변경만. `processKakaoExport`의 시그니처와 반환 타입 `{ newMembers, activityUpdates, skippedAsAlreadyProcessed }`는 그대로다.

- [ ] **Step 1: 실패하는 테스트를 기존 파일에 추가**

`apps/dashboard/lib/kakao-import/process-export.test.ts`의 마지막 `describe` 블록 안, 기존 테스트들 뒤에 추가한다:

```typescript
  it("treats a nickname with a parenthesised note as the same member", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @유승수/98/ModCow#KR98(7시30분 도착)",
      "[갑] [오전 9:05] @유승수/98/ModCow#KR98",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(1);
    expect(result.activityUpdates).toBe(1);
    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("fills realName from the nickname when creating a member", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @유승수/98/ModCow#KR98(7시30분 도착)",
    ].join("\n");

    await processKakaoExport(prisma, upload);

    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수");
  });

  it("never overwrites a realName that someone already set", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수(부계정)" },
    });

    await processKakaoExport(
      prisma,
      [
        "--------------- 2026년 8월 29일 토요일 ---------------",
        "[갑] [오전 9:00] @유승수/98/ModCow#KR98",
      ].join("\n")
    );

    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수(부계정)");
  });

  it("skips a mention whose entire nickname is a note", async () => {
    const upload = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @(8시 도착)",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result).toEqual({ newMembers: 0, activityUpdates: 0, skippedAsAlreadyProcessed: 0 });
    expect(await prisma.member.count()).toBe(0);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/kakao-import/process-export.test.ts`
Expected: FAIL — 괄호 붙은 닉네임이 별도 회원으로 생성되어 `expect(members).toHaveLength(1)`이 2를 받는다.

- [ ] **Step 3: 구현 수정**

`apps/dashboard/lib/kakao-import/process-export.ts`를 다음으로 바꾼다:

```typescript
import type { PrismaClient } from "@lolpamin/db";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";
import { parseKakaoExport } from "./parse-export";

export interface ProcessKakaoExportResult {
  newMembers: number;
  activityUpdates: number;
  skippedAsAlreadyProcessed: number;
}

export async function processKakaoExport(
  prisma: PrismaClient,
  exportText: string
): Promise<ProcessKakaoExportResult> {
  const mentions = parseKakaoExport(exportText);

  const watermark = await prisma.mentionLog.aggregate({ _max: { mentionedAt: true } });
  const cutoff = watermark._max.mentionedAt;

  const toProcess = cutoff ? mentions.filter((m) => m.mentionedAt > cutoff) : mentions;
  const skippedAsAlreadyProcessed = mentions.length - toProcess.length;

  return prisma.$transaction(async (tx) => {
    let newMembers = 0;
    let activityUpdates = 0;

    for (const mention of toProcess) {
      // 닉네임 뒤에 붙은 "(7시30분 도착)" 같은 메모를 떼고 매칭한다. 메모까지 포함해
      // 매칭하면 같은 사람이 여러 회원으로 갈라진다.
      const nickname = normalizeKakaoNickname(mention.mentionedNickname);
      if (nickname.length === 0) continue;

      const existing = await tx.member.findFirst({ where: { kakaoNickname: nickname } });

      let memberId: string;
      if (existing) {
        // realName은 건드리지 않는다 — 사람이 고쳐둔 값을 재업로드가 되돌리면 안 된다.
        await tx.member.update({ where: { id: existing.id }, data: { lastActiveAt: mention.mentionedAt } });
        memberId = existing.id;
        activityUpdates++;
      } else {
        const created = await tx.member.create({
          data: {
            kakaoNickname: nickname,
            realName: realNameFromKakaoNickname(nickname),
            lastActiveAt: mention.mentionedAt,
          },
        });
        memberId = created.id;
        newMembers++;
      }

      await tx.mentionLog.create({
        data: { memberId, mentionedAt: mention.mentionedAt, rawMessage: mention.rawMessage },
      });
    }

    return { newMembers, activityUpdates, skippedAsAlreadyProcessed };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/kakao-import/process-export.test.ts`
Expected: PASS — 기존 3개 + 신규 4개 = 7개.

기존 테스트 중 `"creates half-record Members for unseen nicknames and logs their activity"`가 실패하면 그 테스트가 `realName`이 `null`이라고 단언하고 있는지 확인한다. 지금은 실명이 채워지는 것이 올바른 동작이므로, 그 단언만 새 동작에 맞게 고친다(`realName`이 닉네임 첫 조각과 같은지). 다른 단언은 건드리지 않는다.

- [ ] **Step 5: 전체 테스트**

Run: `npm test`
Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/lib/kakao-import/process-export.ts apps/dashboard/lib/kakao-import/process-export.test.ts
git commit -m "feat(kakao-import): normalize nicknames and fill realName on create"
```

---

### Task 3: 기존 데이터 정규화·병합 (일회성)

**Files:**
- Create: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`
- Create: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`
- Create: `apps/dashboard/scripts/normalize-kakao-nicknames.ts`

**Interfaces:**
- Consumes: `normalizeKakaoNickname`, `realNameFromKakaoNickname` (Task 1).
- Produces: `normalizeKakaoNicknames(prisma: PrismaClient): Promise<NormalizeResult>` where `NormalizeResult = { normalized: number; merged: number; realNamesFilled: number }`. Task 8(검증·배포)이 CLI로 실행한다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { normalizeKakaoNicknames } from "./normalize-kakao-nicknames";

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

describe("normalizeKakaoNicknames", () => {
  it("strips notes from nicknames that have no duplicate", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.normalized).toBe(1);
    expect(result.merged).toBe(0);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("merges two members that normalize to the same nickname, moving their activity", async () => {
    const older = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        lastActiveAt: new Date("2026-08-10T00:00:00Z"),
        elo: 1200,
      },
    });
    const newer = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98(7시30분 도착)",
        createdAt: new Date("2026-08-05T00:00:00Z"),
        lastActiveAt: new Date("2026-08-20T00:00:00Z"),
      },
    });
    await prisma.mentionLog.create({ data: { memberId: newer.id, mentionedAt: new Date("2026-08-20T00:00:00Z") } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(older.id);
    expect(members[0].elo).toBe(1200);
    expect(members[0].lastActiveAt).toEqual(new Date("2026-08-20T00:00:00Z"));
    const logs = await prisma.mentionLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].memberId).toBe(older.id);
  });

  it("keeps the linked member as the survivor even when it was created later", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    const linked = await prisma.member.create({
      data: {
        kakaoNickname: "유승수/98/ModCow#KR98",
        discordUserId: "d-1",
        createdAt: new Date("2026-08-05T00:00:00Z"),
      },
    });

    await normalizeKakaoNicknames(prisma);

    const members = await prisma.member.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(linked.id);
  });

  it("fills a blank realName from the normalized nickname", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.realNamesFilled).toBe(1);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수");
  });

  it("leaves an existing realName alone", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수(부계정)" } });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.realNamesFilled).toBe(0);
    const member = await prisma.member.findFirstOrThrow();
    expect(member.realName).toBe("유승수(부계정)");
  });

  it("changes nothing on a second run", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98(도착)" } });
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });
    await normalizeKakaoNicknames(prisma);

    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0 });
    expect(await prisma.member.count()).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/normalize-kakao-nicknames.test.ts`
Expected: FAIL — `Failed to load url ./normalize-kakao-nicknames`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`:

```typescript
import type { Member, PrismaClient } from "@lolpamin/db";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";

export interface NormalizeResult {
  normalized: number;
  merged: number;
  realNamesFilled: number;
}

// 병합에서 살아남을 회원: 디스코드까지 연결된 쪽을 우선하고, 그다음 먼저 만들어진 쪽.
// 연결된 레코드를 지우면 계정 연결 작업을 다시 해야 하므로 그쪽을 남긴다.
function pickSurvivor(members: Member[]): Member {
  const sorted = [...members].sort((a, b) => {
    const aLinked = a.discordUserId !== null ? 0 : 1;
    const bLinked = b.discordUserId !== null ? 0 : 1;
    if (aLinked !== bLinked) return aLinked - bLinked;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0];
}

function latest(dates: Array<Date | null>): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

export async function normalizeKakaoNicknames(prisma: PrismaClient): Promise<NormalizeResult> {
  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({ where: { kakaoNickname: { not: null } } });

    const groups = new Map<string, Member[]>();
    let normalized = 0;
    for (const member of members) {
      const normalizedNickname = normalizeKakaoNickname(member.kakaoNickname!);
      if (normalizedNickname.length === 0) continue;
      if (normalizedNickname !== member.kakaoNickname) normalized++;
      const group = groups.get(normalizedNickname);
      if (group) group.push(member);
      else groups.set(normalizedNickname, [member]);
    }

    let merged = 0;

    for (const [nickname, group] of groups) {
      const survivor = pickSurvivor(group);
      const losers = group.filter((m) => m.id !== survivor.id);

      for (const loser of losers) {
        await tx.mentionLog.updateMany({ where: { memberId: loser.id }, data: { memberId: survivor.id } });
        await tx.gameParticipant.updateMany({ where: { memberId: loser.id }, data: { memberId: survivor.id } });
        await tx.member.delete({ where: { id: loser.id } });
        merged++;
      }

      // elo는 생존자 값을 유지한다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
      await tx.member.update({
        where: { id: survivor.id },
        data: {
          kakaoNickname: nickname,
          lastActiveAt: latest([survivor.lastActiveAt, ...losers.map((l) => l.lastActiveAt)]),
          realName: survivor.realName ?? losers.find((l) => l.realName !== null)?.realName ?? null,
          age: survivor.age ?? losers.find((l) => l.age !== null)?.age ?? null,
          riotId: survivor.riotId ?? losers.find((l) => l.riotId !== null)?.riotId ?? null,
        },
      });
    }

    const blankRealNames = await tx.member.findMany({
      where: { realName: null, kakaoNickname: { not: null } },
    });
    let realNamesFilled = 0;
    for (const member of blankRealNames) {
      const realName = realNameFromKakaoNickname(member.kakaoNickname!);
      if (realName === null) continue;
      await tx.member.update({ where: { id: member.id }, data: { realName } });
      realNamesFilled++;
    }

    return { normalized, merged, realNamesFilled };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/normalize-kakao-nicknames.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: CLI 진입점 작성**

`apps/dashboard/scripts/normalize-kakao-nicknames.ts`:

```typescript
// npx tsx scripts/normalize-kakao-nicknames.ts  (apps/dashboard 에서 실행)
// tsx는 tsconfig의 "@/" 별칭을 해석하지 않으므로 상대 경로로 임포트한다.
import { prisma } from "@lolpamin/db";
import { normalizeKakaoNicknames } from "../lib/mutations/normalize-kakao-nicknames";

async function main(): Promise<void> {
  const before = {
    members: await prisma.member.count(),
    mentionLogs: await prisma.mentionLog.count(),
  };
  console.log("before:", before);

  const result = await normalizeKakaoNicknames(prisma);
  console.log("result:", result);

  console.log("after:", {
    members: await prisma.member.count(),
    mentionLogs: await prisma.mentionLog.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts apps/dashboard/scripts/normalize-kakao-nicknames.ts
git commit -m "feat(members): add the one-off kakao nickname normalization and merge"
```

---

### Task 4: `importDiscordMembers` — 가져온 목록을 DB에 반영

**Files:**
- Create: `apps/dashboard/lib/mutations/import-discord-members.ts`
- Create: `apps/dashboard/lib/mutations/import-discord-members.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`.
- Produces:
  - `interface DiscordGuildMember { discordUserId: string; username: string; isBot: boolean; joinedAt: Date | null }`
  - `interface ImportDiscordMembersResult { created: number; updated: number; skippedBots: number }`
  - `importDiscordMembers(prisma: PrismaClient, members: DiscordGuildMember[]): Promise<ImportDiscordMembersResult>`

  Task 5(어댑터·액션·UI)가 쓴다. `DiscordGuildMember`는 어댑터가 만들어 이 함수에 넘기는 형태다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/mutations/import-discord-members.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { importDiscordMembers, type DiscordGuildMember } from "./import-discord-members";

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

function guildMember(overrides: Partial<DiscordGuildMember> = {}): DiscordGuildMember {
  return {
    discordUserId: "d-1",
    username: "minjun",
    isBot: false,
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("importDiscordMembers", () => {
  it("creates a half record for an unseen discord account", async () => {
    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result).toEqual({ created: 1, updated: 0, skippedBots: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordUserId).toBe("d-1");
    expect(member.discordHandle).toBe("minjun");
    expect(member.discordJoinedAt).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(member.kakaoNickname).toBeNull();
    expect(member.elo).toBe(1000);
  });

  it("updates the handle of an account it has seen before", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "old-handle", elo: 1400 },
    });

    const result = await importDiscordMembers(prisma, [guildMember({ username: "new-handle" })]);

    expect(result).toEqual({ created: 0, updated: 1, skippedBots: 0 });
    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordHandle).toBe("new-handle");
    expect(member.elo).toBe(1400);
  });

  it("skips bot accounts", async () => {
    const result = await importDiscordMembers(prisma, [
      guildMember({ discordUserId: "d-bot", username: "MEE6", isBot: true }),
    ]);

    expect(result).toEqual({ created: 0, updated: 0, skippedBots: 1 });
    expect(await prisma.member.count()).toBe(0);
  });

  it("leaves kakao-only members untouched", async () => {
    await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수" } });

    const result = await importDiscordMembers(prisma, [guildMember()]);

    expect(result.created).toBe(1);
    expect(await prisma.member.count()).toBe(2);
    const kakaoOnly = await prisma.member.findFirstOrThrow({ where: { kakaoNickname: { not: null } } });
    expect(kakaoOnly.discordUserId).toBeNull();
  });

  it("does not overwrite a discordJoinedAt that is already recorded", async () => {
    await prisma.member.create({
      data: {
        discordUserId: "d-1",
        discordHandle: "minjun",
        discordJoinedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    await importDiscordMembers(prisma, [guildMember()]);

    const member = await prisma.member.findFirstOrThrow();
    expect(member.discordJoinedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("returns zeroes for an empty list", async () => {
    expect(await importDiscordMembers(prisma, [])).toEqual({ created: 0, updated: 0, skippedBots: 0 });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/import-discord-members.test.ts`
Expected: FAIL — `Failed to load url ./import-discord-members`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/mutations/import-discord-members.ts`:

```typescript
import type { PrismaClient } from "@lolpamin/db";

export interface DiscordGuildMember {
  discordUserId: string;
  username: string;
  isBot: boolean;
  joinedAt: Date | null;
}

export interface ImportDiscordMembersResult {
  created: number;
  updated: number;
  skippedBots: number;
}

export async function importDiscordMembers(
  prisma: PrismaClient,
  members: DiscordGuildMember[]
): Promise<ImportDiscordMembersResult> {
  return prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let skippedBots = 0;

    for (const member of members) {
      if (member.isBot) {
        skippedBots++;
        continue;
      }

      const existing = await tx.member.findUnique({ where: { discordUserId: member.discordUserId } });

      if (existing) {
        // 핸들만 최신으로 맞춘다. 카톡 연결이나 elo 등 다른 필드는 건드리지 않는다.
        await tx.member.update({
          where: { id: existing.id },
          data: {
            discordHandle: member.username,
            discordJoinedAt: existing.discordJoinedAt ?? member.joinedAt,
          },
        });
        updated++;
      } else {
        await tx.member.create({
          data: {
            discordUserId: member.discordUserId,
            discordHandle: member.username,
            discordJoinedAt: member.joinedAt,
          },
        });
        created++;
      }
    }

    return { created, updated, skippedBots };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/import-discord-members.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/mutations/import-discord-members.ts apps/dashboard/lib/mutations/import-discord-members.test.ts
git commit -m "feat(members): add importDiscordMembers"
```

---

### Task 5: 디스코드 어댑터, 서버 액션, 가져오기 버튼

**Files:**
- Create: `apps/dashboard/lib/discord/fetch-guild-members.ts`
- Modify: `apps/dashboard/app/link-accounts/actions.ts`
- Modify: `apps/dashboard/components/AccountMappingPanel.tsx`

**Interfaces:**
- Consumes: `importDiscordMembers`, `DiscordGuildMember`, `ImportDiscordMembersResult` (Task 4), `requireAdmin` (기존).
- Produces: `fetchGuildMembers(token: string, guildId: string): Promise<DiscordGuildMember[]>`, `importDiscordMembersAction(): Promise<ImportDiscordMembersActionResult>` where `ImportDiscordMembersActionResult = { result: ImportDiscordMembersResult | null; error: string | null }`.

- [ ] **Step 1: 어댑터 작성**

`apps/dashboard/lib/discord/fetch-guild-members.ts`:

```typescript
import type { DiscordGuildMember } from "@/lib/mutations/import-discord-members";

// 디스코드 응답 중 이 시스템이 쓰는 필드만 옮겨 담는다. 네트워크와 디스코드의 응답
// 형식을 아는 유일한 파일이며, 실제 API에 의존하므로 자동 테스트 대상이 아니다.
interface DiscordApiGuildMember {
  user?: { id: string; username: string; bot?: boolean };
  joined_at?: string;
}

const MAX_MEMBERS_PER_REQUEST = 1000;

export async function fetchGuildMembers(token: string, guildId: string): Promise<DiscordGuildMember[]> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members?limit=${MAX_MEMBERS_PER_REQUEST}`,
    { headers: { Authorization: `Bot ${token}` }, cache: "no-store" }
  );

  if (response.status === 403) {
    throw new Error(
      "디스코드가 회원 목록 조회를 거부했습니다. 개발자 포털에서 Server Members Intent를 켜야 합니다."
    );
  }
  if (!response.ok) {
    throw new Error(`디스코드 API 오류 (${response.status})`);
  }

  const body = (await response.json()) as DiscordApiGuildMember[];

  if (body.length === MAX_MEMBERS_PER_REQUEST) {
    console.warn(
      `[discord] 길드 회원이 ${MAX_MEMBERS_PER_REQUEST}명에 도달했습니다. 그 이후 인원은 가져오지 않습니다.`
    );
  }

  return body.flatMap((entry) => {
    if (!entry.user) return [];
    return [
      {
        discordUserId: entry.user.id,
        username: entry.user.username,
        isBot: entry.user.bot === true,
        joinedAt: entry.joined_at ? new Date(entry.joined_at) : null,
      },
    ];
  });
}
```

- [ ] **Step 2: 서버 액션 추가**

`apps/dashboard/app/link-accounts/actions.ts`의 임포트에 다음을 더한다:

```typescript
import { fetchGuildMembers } from "@/lib/discord/fetch-guild-members";
import { importDiscordMembers, type ImportDiscordMembersResult } from "@/lib/mutations/import-discord-members";
```

그리고 파일 끝에 액션을 추가한다:

```typescript
export interface ImportDiscordMembersActionResult {
  result: ImportDiscordMembersResult | null;
  error: string | null;
}

export async function importDiscordMembersAction(): Promise<ImportDiscordMembersActionResult> {
  await requireAdmin();

  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    return { result: null, error: "DISCORD_TOKEN 또는 DISCORD_GUILD_ID가 설정되지 않았습니다." };
  }

  try {
    const members = await fetchGuildMembers(token, guildId);
    const result = await importDiscordMembers(prisma, members);
    revalidatePath("/link-accounts");
    revalidatePath("/members");
    return { result, error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "디스코드 회원을 가져오지 못했습니다." };
  }
}
```

- [ ] **Step 3: 가드 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/action-guards.test.ts`
Expected: PASS — 새 액션이 `await requireAdmin()`을 데이터에 손대기 전에 부르므로 통과한다. 실패하면 가드 위치를 고친다. 테스트는 고치지 않는다.

- [ ] **Step 4: 가져오기 버튼 추가**

`apps/dashboard/components/AccountMappingPanel.tsx`에서:

임포트에 추가한다:

```typescript
import { importDiscordMembersAction } from "@/app/link-accounts/actions";
```

컴포넌트 본문의 기존 `useState` 선언들 뒤에 추가한다:

```typescript
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleImportDiscord() {
    setIsImporting(true);
    setImportStatus(null);
    try {
      const { result, error } = await importDiscordMembersAction();
      setImportStatus(
        error ?? `가져오기 완료 · 신규 ${result!.created}명 · 갱신 ${result!.updated}명 · 봇 제외 ${result!.skippedBots}개`
      );
    } finally {
      setIsImporting(false);
    }
  }
```

그리고 `<h2>계정 매핑</h2>`이 들어 있는 헤더 `div` 바로 다음에 다음 블록을 넣는다:

```tsx
      {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleImportDiscord}
            disabled={isImporting}
            className={`rounded-lg px-3.5 py-2 text-[12px] font-extrabold ${
              isImporting ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#5865F2] text-white"
            }`}
          >
            {isImporting ? "가져오는 중..." : "디스코드 회원 가져오기"}
          </button>
          {importStatus && <span className="text-[11.5px] text-[#8A94A6]">{importStatus}</span>}
        </div>
      )}
```

- [ ] **Step 5: 타입체크와 빌드**

Run: `npx tsc --noEmit --project apps/dashboard/tsconfig.json`
Expected: 에러 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/lib/discord apps/dashboard/app/link-accounts/actions.ts apps/dashboard/components/AccountMappingPanel.tsx
git commit -m "feat(link-accounts): add the discord member import button"
```

---

### Task 6: 실명 수정

**Files:**
- Create: `apps/dashboard/lib/mutations/update-member-real-name.ts`
- Create: `apps/dashboard/lib/mutations/update-member-real-name.test.ts`
- Create: `apps/dashboard/components/MemberRealNameCell.tsx`
- Modify: `apps/dashboard/app/members/actions.ts`
- Modify: `apps/dashboard/components/MemberTable.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (기존), `MemberRow` (기존, `lib/queries/members.ts`).
- Produces: `updateMemberRealName(prisma: PrismaClient, memberId: string, realName: string): Promise<void>`, `updateMemberRealNameAction(memberId: string, realName: string): Promise<{ error: string | null }>`.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/mutations/update-member-real-name.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberRealName } from "./update-member-real-name";

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

describe("updateMemberRealName", () => {
  it("stores the trimmed name", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유승수/98/ModCow#KR98" } });

    await updateMemberRealName(prisma, member.id, "  유승수  ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.realName).toBe("유승수");
  });

  it("stores null for an empty name", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", realName: "유승수" },
    });

    await updateMemberRealName(prisma, member.id, "   ");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.realName).toBeNull();
  });

  it("touches nothing but realName", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유승수/98/ModCow#KR98", elo: 1400, discordUserId: "d-1" },
    });

    await updateMemberRealName(prisma, member.id, "유승수");

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated.elo).toBe(1400);
    expect(updated.discordUserId).toBe("d-1");
    expect(updated.kakaoNickname).toBe("유승수/98/ModCow#KR98");
  });

  it("throws for a member that does not exist", async () => {
    await expect(
      updateMemberRealName(prisma, "5f1a1a2e-0000-4000-8000-000000000000", "유승수")
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/update-member-real-name.test.ts`
Expected: FAIL — `Failed to load url ./update-member-real-name`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/mutations/update-member-real-name.ts`:

```typescript
import type { PrismaClient } from "@lolpamin/db";

export async function updateMemberRealName(
  prisma: PrismaClient,
  memberId: string,
  realName: string
): Promise<void> {
  const trimmed = realName.trim();
  await prisma.member.update({
    where: { id: memberId },
    data: { realName: trimmed.length > 0 ? trimmed : null },
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/update-member-real-name.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 서버 액션 추가**

`apps/dashboard/app/members/actions.ts`의 임포트에 추가한다:

```typescript
import { updateMemberRealName } from "@/lib/mutations/update-member-real-name";
```

파일 끝에 추가한다:

```typescript
export async function updateMemberRealNameAction(
  memberId: string,
  realName: string
): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await updateMemberRealName(prisma, memberId, realName);
  } catch {
    return { error: "실명을 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/inactive");
  return { error: null };
}
```

- [ ] **Step 6: 인라인 편집 컴포넌트 작성**

`apps/dashboard/components/MemberRealNameCell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRealNameAction } from "@/app/members/actions";

export function MemberRealNameCell({
  memberId,
  realName,
  isAdmin,
}: {
  memberId: string;
  realName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(realName === "-" ? "" : realName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return (
      <div className={`truncate font-semibold ${realName === "-" ? "text-[#5C6577]" : ""}`}>{realName}</div>
    );
  }

  function save() {
    setIsEditing(false);
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberRealNameAction(memberId, value);
      setError(actionError);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(realName === "-" ? "" : realName);
            setIsEditing(false);
          }
        }}
        className="w-full rounded-md border border-[#4472C4]/50 bg-[#0F131B] px-1.5 py-1 text-[13px] text-[#E6EAF2] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      title="클릭해서 실명 수정"
      disabled={isPending}
      className={`truncate text-left font-semibold hover:underline ${
        realName === "-" ? "text-[#5C6577]" : ""
      }`}
    >
      {isPending ? "저장 중..." : realName}
      {error && <span className="ml-1 text-[10px] text-[#EE8B8B]">{error}</span>}
    </button>
  );
}
```

- [ ] **Step 7: 표에 연결**

`apps/dashboard/components/MemberTable.tsx`에서 임포트에 추가한다:

```typescript
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
```

실명을 렌더하던 줄

```tsx
          <div className={`truncate font-semibold ${m.realName === "-" ? "text-[#5C6577]" : ""}`}>{m.realName}</div>
```

을 다음으로 바꾼다:

```tsx
          <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
```

- [ ] **Step 8: 타입체크·빌드·전체 테스트**

Run: `npx tsc --noEmit --project apps/dashboard/tsconfig.json`
Expected: 에러 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공.

Run: `npm test`
Expected: 전부 통과.

- [ ] **Step 9: 커밋**

```bash
git add apps/dashboard/lib/mutations/update-member-real-name.ts apps/dashboard/lib/mutations/update-member-real-name.test.ts apps/dashboard/components/MemberRealNameCell.tsx apps/dashboard/app/members/actions.ts apps/dashboard/components/MemberTable.tsx
git commit -m "feat(members): edit a member's real name in place"
```

---

### Task 7: 정렬

**Files:**
- Modify: `apps/dashboard/lib/queries/members.ts`
- Create: `apps/dashboard/lib/queries/members.test.ts`
- Modify: `apps/dashboard/app/members/page.tsx`
- Modify: `apps/dashboard/components/MemberTable.tsx`

**Interfaces:**
- Consumes: 기존 `MemberFilter`, `MemberRow`, `MemberListData`.
- Produces:
  - `type MemberSort = "elo" | "realName" | "kakaoNickname"`, `type SortDirection = "asc" | "desc"`
  - `parseMemberSort(value: string | undefined): MemberSort`, `parseSortDirection(value: string | undefined): SortDirection`
  - `getMemberListData(filter: MemberFilter, query: string, sort: MemberSort, dir: SortDirection): Promise<MemberListData>` — **인자 두 개가 늘어난 것에 주의**. 호출부는 `app/members/page.tsx` 하나뿐이다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/queries/members.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// queries/members.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를 보는
// 클라이언트로 바꿔치기한다 — current-admin.test.ts와 같은 방식이다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getMemberListData, parseMemberSort, parseSortDirection } = await import("./members");

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.member.create({ data: { realName: "나회원", kakaoNickname: "나회원/95/na#1", elo: 1200 } });
  await prisma.member.create({ data: { realName: "가회원", kakaoNickname: "가회원/95/ga#1", elo: 1500 } });
  await prisma.member.create({ data: { realName: null, kakaoNickname: null, discordUserId: "d-1", elo: 1000 } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseMemberSort / parseSortDirection", () => {
  it("defaults to elo descending", () => {
    expect(parseMemberSort(undefined)).toBe("elo");
    expect(parseMemberSort("nonsense")).toBe("elo");
    expect(parseSortDirection(undefined)).toBe("desc");
    expect(parseSortDirection("nonsense")).toBe("desc");
  });

  it("accepts the supported values", () => {
    expect(parseMemberSort("realName")).toBe("realName");
    expect(parseMemberSort("kakaoNickname")).toBe("kakaoNickname");
    expect(parseSortDirection("asc")).toBe("asc");
  });
});

describe("getMemberListData sorting", () => {
  it("sorts by elo descending by default", async () => {
    const data = await getMemberListData("all", "", "elo", "desc");

    expect(data.rows.map((r) => r.elo)).toEqual([1500, 1200, 1000]);
  });

  it("sorts by elo ascending", async () => {
    const data = await getMemberListData("all", "", "elo", "asc");

    expect(data.rows.map((r) => r.elo)).toEqual([1000, 1200, 1500]);
  });

  it("sorts by realName and puts members without one last in both directions", async () => {
    const ascending = await getMemberListData("all", "", "realName", "asc");
    expect(ascending.rows.map((r) => r.realName)).toEqual(["가회원", "나회원", "-"]);

    const descending = await getMemberListData("all", "", "realName", "desc");
    expect(descending.rows.map((r) => r.realName)).toEqual(["나회원", "가회원", "-"]);
  });

  it("sorts by kakao nickname", async () => {
    const data = await getMemberListData("all", "", "kakaoNickname", "asc");

    expect(data.rows.map((r) => r.kakaoNickname)).toEqual(["가회원/95/ga#1", "나회원/95/na#1", "-"]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/queries/members.test.ts`
Expected: FAIL — `parseMemberSort`가 존재하지 않고 `getMemberListData`가 인자 2개만 받는다.

- [ ] **Step 3: 쿼리 수정**

`apps/dashboard/lib/queries/members.ts`에서 임포트를 다음으로 바꾼다:

```typescript
import { prisma } from "@/lib/prisma";
import type { Member, Prisma } from "@lolpamin/db";
```

`MemberFilter` 선언 아래에 추가한다:

```typescript
export type MemberSort = "elo" | "realName" | "kakaoNickname";
export type SortDirection = "asc" | "desc";

const MEMBER_SORTS: MemberSort[] = ["elo", "realName", "kakaoNickname"];

export function parseMemberSort(value: string | undefined): MemberSort {
  return MEMBER_SORTS.includes(value as MemberSort) ? (value as MemberSort) : "elo";
}

export function parseSortDirection(value: string | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

// 값이 비어 있는 행은 방향과 무관하게 마지막에 둔다 — 실명 없는 회원이 목록 맨 위를
// 차지하면 정렬이 쓸모없어진다. id 2차 정렬은 동점일 때 순서를 고정하기 위한 것이다.
function orderByFor(sort: MemberSort, dir: SortDirection): Prisma.MemberOrderByWithRelationInput[] {
  if (sort === "elo") return [{ elo: dir }, { id: "asc" }];
  if (sort === "realName") return [{ realName: { sort: dir, nulls: "last" } }, { id: "asc" }];
  return [{ kakaoNickname: { sort: dir, nulls: "last" } }, { id: "asc" }];
}
```

`getMemberListData`의 시그니처와 첫 쿼리를 바꾼다:

```typescript
export async function getMemberListData(
  filter: MemberFilter,
  query: string,
  sort: MemberSort = "elo",
  dir: SortDirection = "desc"
): Promise<MemberListData> {
  const now = new Date();
  const allMembers = await prisma.member.findMany({
    orderBy: orderByFor(sort, dir),
    include: { _count: { select: { mentionLogs: true, participants: true } } },
  });
```

나머지 본문(집계, 필터링, 반환)은 그대로 둔다.

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/queries/members.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 페이지에서 파라미터 읽기**

`apps/dashboard/app/members/page.tsx`를 다음으로 바꾼다(기존 `isAdmin` 계산은 유지):

```tsx
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { MemberTable } from "@/components/MemberTable";
import { MemberFilters } from "@/components/MemberFilters";
import {
  getMemberListData,
  parseMemberSort,
  parseSortDirection,
  type MemberFilter,
} from "@/lib/queries/members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string; sort?: string; dir?: string };
}) {
  const filter = (searchParams.filter ?? "all") as MemberFilter;
  const query = searchParams.q ?? "";
  const sort = parseMemberSort(searchParams.sort);
  const dir = parseSortDirection(searchParams.dir);
  const [data, currentAdmin] = await Promise.all([
    getMemberListData(filter, query, sort, dir),
    getCurrentAdmin(),
  ]);
  const isAdmin = currentAdmin !== null;

  return (
    <AppShell activeNav="members" pageTitle="회원 관리" pageDesc="전체 회원 조회 및 검색">
      <div className="flex flex-col gap-5.5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="전체 회원" value={data.totalCount} unit="명" colorClassName="text-[#E6EAF2]" />
          <StatCard label="미연결(반쪽) 회원" value={data.halfCount} unit="명" colorClassName="text-[#F2985C]" />
          <StatCard label="미배정 계정" value={data.unassignedCount} unit="건" colorClassName="text-[#F2C75C]" />
          <StatCard label="평균 ELO" value={data.averageElo} unit="점" colorClassName="text-[#8FB4F5]" />
        </div>
        <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <MemberFilters activeFilter={filter} query={query} />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} />
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 6: 정렬 헤더 만들기**

`apps/dashboard/components/MemberTable.tsx`에서 임포트에 추가한다:

```typescript
import Link from "next/link";
import type { MemberFilter, MemberSort, SortDirection } from "@/lib/queries/members";
```

props를 바꾼다:

```typescript
export function MemberTable({
  rows,
  isAdmin,
  sort,
  dir,
  filter,
  query,
}: {
  rows: MemberRow[];
  isAdmin: boolean;
  sort: MemberSort;
  dir: SortDirection;
  filter: MemberFilter;
  query: string;
}) {
  function sortHref(key: MemberSort): string {
    // 같은 기준을 다시 누르면 방향을 뒤집고, 다른 기준으로 바꾸면 내림차순부터 시작한다.
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams({ filter, sort: key, dir: nextDir });
    if (query) params.set("q", query);
    return `/members?${params.toString()}`;
  }

  function sortMark(key: MemberSort): string {
    if (sort !== key) return "";
    return dir === "desc" ? " ↓" : " ↑";
  }
```

헤더 행의 실명·카톡 닉네임·ELO 칸을 링크로 바꾼다:

```tsx
        <Link href={sortHref("realName")} className="hover:text-[#B7C0D0]">
          실명{sortMark("realName")}
        </Link>
        <Link href={sortHref("kakaoNickname")} className="hover:text-[#B7C0D0]">
          카톡 닉네임{sortMark("kakaoNickname")}
        </Link>
        <div>디코 닉네임</div>
        <Link href={sortHref("elo")} className="text-right hover:text-[#B7C0D0]">
          ELO{sortMark("elo")}
        </Link>
```

나머지 헤더 칸(`마지막 활동`, `관리`)과 행 렌더링은 그대로 둔다.

- [ ] **Step 7: 타입체크·빌드·전체 테스트**

Run: `npx tsc --noEmit --project apps/dashboard/tsconfig.json`
Expected: 에러 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공.

Run: `npm test`
Expected: 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add apps/dashboard/lib/queries/members.ts apps/dashboard/lib/queries/members.test.ts apps/dashboard/app/members/page.tsx apps/dashboard/components/MemberTable.tsx
git commit -m "feat(members): sort the member table by name, nickname, or elo"
```

---

### Task 8: 로컬 검증과 배포

**Files:** 없음 — 검증과 배포만 한다.

**Interfaces:** 없음.

- [ ] **Step 1: 전체 테스트와 빌드**

Run: `npm test`
Expected: 전부 통과.

Run: `npm run build --workspace=dashboard`
Expected: 성공, 모든 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 2: 개발 DB에 정리 스크립트 실행**

먼저 현재 상태를 기록한다:

```bash
docker exec dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin -c "SELECT (SELECT count(*) FROM \"Member\") AS members, (SELECT count(*) FROM \"MentionLog\") AS logs, (SELECT count(*) FROM \"Member\" WHERE \"kakaoNickname\" LIKE '%(%') AS with_note;"
```

스크립트를 실행한다 (리포 루트에서):

```bash
DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin" npx tsx apps/dashboard/scripts/normalize-kakao-nicknames.ts
```

Expected: `before` / `result` / `after`가 출력된다. `result.normalized`는 괄호가 있던 회원 수와 같고, `after.mentionLogs`는 `before.mentionLogs`와 같아야 한다 — 병합은 활동기록을 옮길 뿐 지우지 않는다.

- [ ] **Step 3: 로컬 화면에서 확인**

Run: `DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin" npm run dev --workspace=dashboard`

`/members`에서 확인한다: 실명이 채워져 있는지, 헤더를 눌러 세 기준으로 정렬되고 방향이 토글되는지, 실명이 없는 회원이 항상 마지막에 오는지, 실명 칸을 클릭해 수정·저장되는지, 로그아웃 상태에서는 실명이 그냥 글자로 보이는지.

`/link-accounts`에서 「디스코드 회원 가져오기」를 누른다.
Expected: Server Members Intent가 켜져 있으면 `신규 N명 · 갱신 N명 · 봇 제외 N개`가 뜨고 미연결 디스코드 목록이 채워진다. 꺼져 있으면 인텐트를 켜라는 안내가 뜬다.

확인 후 개발 서버를 종료한다.

- [ ] **Step 4: 서버에 배포**

리포 루트에서 (`OCI_*` 값은 `.env`에 있다):

```bash
git archive HEAD | ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'tar x -C ~/lolpamin'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml build dashboard'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml up -d'
```

이 서버는 `ubuntu` 계정이 docker 그룹에 없어 모든 docker 명령에 `sudo`가 필요하다. 빌드는 vCPU 1개라 수 분 걸린다.

- [ ] **Step 5: 서버 DB에 정리 스크립트 실행**

먼저 기록한다:

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U lolpamin -d lolpamin -c "SELECT (SELECT count(*) FROM \"Member\") AS members, (SELECT count(*) FROM \"MentionLog\") AS logs;"'
```

실행한다:

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml exec -T dashboard npx tsx scripts/normalize-kakao-nicknames.ts'
```

Expected: `before` / `result` / `after`. 활동기록 수는 변하지 않는다.

- [ ] **Step 6: 배포된 화면 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "http://168.107.53.72:3200/members?sort=realName&dir=asc"
```

Expected: `200`.

브라우저에서 `http://168.107.53.72:3200/members`에 로그인해 정렬·실명 수정이 동작하는지, `/link-accounts`에서 가져오기가 동작하는지 확인한다.
