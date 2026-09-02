# 계정 매칭과 되돌릴 수 있는 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 병합을 삭제 대신 묘비(tombstone) 표시로 바꿔 연결을 되돌릴 수 있게 하고, 묘비가 보존하는 과거 닉네임으로 닉네임 변경 후에도 활동이 이어지게 하며, 실명·게임닉 두 신호로 연결 후보를 제안한다.

**Architecture:** `Member`에 자기참조 컬럼 `mergedIntoId` 하나를 추가한다. 활성 회원은 `mergedIntoId IS NULL`이고, 그 외는 묘비로서 자기 `kakaoNickname`을 과거 닉네임(별칭)으로 보존한다. 활동 기록은 옮기지 않고 원래 행에 남긴다 — 그래서 되돌리기가 `mergedIntoId = null` 한 줄로 끝난다. 매칭 점수는 `packages/core`의 순수 함수로 두고 DB·API를 모르게 한다.

**Tech Stack:** TypeScript, Next.js 14 App Router(서버 액션, 서버 컴포넌트), Prisma 5 + PostgreSQL, Vitest(순수 함수 단위 테스트 + `DATABASE_URL_TEST` 대상 통합 테스트). 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-01-account-matching-and-reversible-linking-design.md`

## Global Constraints

- 새 npm 의존성을 추가하지 않는다.
- 스키마 변경은 Task 2의 마이그레이션 한 건뿐이다. 다른 태스크는 스키마를 건드리지 않는다.
- **불변식 1: 묘비(`mergedIntoId != null`)는 `discordUserId`와 `kakaoUserId`가 모두 `null`이어야 한다.** 두 컬럼은 `@unique`라서, 묘비가 값을 쥐고 있으면 같은 계정을 다시 가져올 때 유니크 제약에 막힌다.
- **불변식 2: `mergedIntoId`는 항상 활성 회원을 가리킨다.** 흡수 대상이 이미 묘비면 그 생존자로 바꿔 가리킨다(체인 압축).
- **활동 기록(`MentionLog`, `GameParticipant`)을 병합 시 옮기지 않는다.** 원래 행에 남긴다.
- 데이터를 바꾸는 모든 서버 액션은 본문에서 데이터에 손대기 전에 `await requireAdmin()`을 호출한다. `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 검사하며, 그 테스트를 수정해서 통과시키지 않는다.
- DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다 (`apps/dashboard/lib/mutations/delete-member.test.ts`와 동일한 형태). 가드 없이 쓰면 개발 DB가 지워진다.
- 이 리포의 뮤테이션 헬퍼는 `prisma`를 첫 번째 인자로 받는다. 새 헬퍼도 같은 형태를 따른다.
- 생존자의 `elo`는 흡수로 바뀌지 않는다. 합치거나 평균 내지 않는다.
- 자동 연결을 만들지 않는다. 점수는 후보 제안일 뿐이고 확정은 항상 사람이 누른다.
- 새 `prisma.$transaction` 호출에는 `{ timeout: 20000 }`을 명시한다(리포의 기존 관례).

---

## File Structure

```
packages/core/src/
  score-account-match.ts               # 신규: 순수 매칭 점수 함수
  score-account-match.test.ts          # 신규
  index.ts                             # 수정: 새 모듈 re-export, merge-members re-export 제거
  merge-members.ts                     # 삭제 (linkMembers와 함께 사라짐)
  merge-members.test.ts                # 삭제

packages/db/prisma/
  schema.prisma                        # 수정: mergedIntoId, discordDisplayName
  migrations/<ts>_add_member_merge_and_display_name/  # 신규

apps/dashboard/
  lib/discord/fetch-guild-members.ts   # 수정: nick/global_name 추출
  lib/mutations/
    import-discord-members.ts          # 수정: displayName 저장
    import-discord-members.test.ts     # 수정
    absorb-member.ts                   # 신규: 흡수
    absorb-member.test.ts              # 신규
    release-member.ts                  # 신규: 해제
    release-member.test.ts             # 신규
    normalize-kakao-nicknames.ts       # 수정: 삭제 대신 묘비
    normalize-kakao-nicknames.test.ts  # 수정
    delete-member.ts                   # 수정: 묘비까지 삭제
    delete-member.test.ts              # 수정
    save-game-result.ts                # 수정: 연결 판정 버그
    save-game-result.test.ts           # 수정
    link-members.ts                    # 삭제
    link-members.test.ts               # 삭제
  lib/kakao-import/process-export.ts   # 수정: 묘비 히트 시 생존자에 활동 기록
  lib/kakao-import/process-export.test.ts  # 수정
  lib/queries/
    members.ts                         # 수정: 활성 필터
    members.test.ts                    # 수정
    inactive.ts                        # 수정: 활성 필터
    linked-members.ts                  # 수정: 활성 필터
    pending-accounts.ts                # 수정: 활성 필터
    link-candidates.ts                 # 신규: 후보 제안 + 별칭 목록
    link-candidates.test.ts            # 신규
  components/
    AppShell.tsx                       # 수정: 활성 필터
    AccountMappingPanel.tsx            # 수정: 후보 UI + 해제 섹션
  app/link-accounts/
    actions.ts                         # 수정: absorb/release 액션, linkMembersAction 제거
    page.tsx                           # 수정: 새 쿼리 전달

apps/discord-bot/src/lib/
  get-leaderboard.ts                   # 수정: 활성 필터
  get-member-rank.ts                   # 수정: 활성 필터
```

## 병렬 실행 가이드

Task 1은 다른 어떤 태스크와도 파일이 겹치지 않으므로 Task 2와 동시에 시작할 수 있다. Task 2(스키마)가 끝나면 Task 3·4·5·6·7이 서로 독립이므로 동시에 진행할 수 있다. Task 8은 Task 1과 3을, Task 9는 Task 8을 필요로 한다. Task 10은 전부 끝난 뒤다.

```
1 ─────────────────────────────┐
2 ─┬─ 3 ──────────────┐        ├─ 8 ─ 9 ─ 10
   ├─ 4 ─┐            │        │
   ├─ 5 ─┼─(독립)─────┤        │
   ├─ 6 ─┤            │        │
   └─ 7 ─┘            └────────┘
```

---

### Task 1: `scoreAccountMatch` — 카톡 닉네임과 디스코드 표시 이름의 매칭 점수

**Files:**
- Create: `packages/core/src/score-account-match.ts`
- Create: `packages/core/src/score-account-match.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 없음 — 순수 문자열 처리.
- Produces: `scoreAccountMatch(kakaoNickname: string, discordDisplayName: string): AccountMatchScore` where `AccountMatchScore = { score: number; reasons: string[] }`, `isSoleCandidate(topScore: number, secondScore: number): boolean`, 상수 `SOLE_CANDIDATE_SCORE = 140`, `SOLE_CANDIDATE_GAP = 60`. Task 8(후보 제안 쿼리)이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/score-account-match.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isSoleCandidate, scoreAccountMatch } from "./score-account-match";

// 2026-09-01 실데이터(디스코드 25명 × 카톡 16명)에서 관측된 짝. 왼쪽이 카톡
// kakaoNickname, 가운데가 디스코드 표시 이름(서버 별명 우선), 오른쪽이 기대 점수.
const REAL_PAIRS: Array<[string, string, number]> = [
  ["국동명/99/kooki#kr99", "동명", 60],
  ["김나연/04/주디#주토피아", "김나연/주디#주토피아/미드정글", 180],
  ["김복건/96/뚜비뚜밥#뚜비얌", "김복건/96/뚜비뚜밥#뚜비얌", 180],
  ["김하제/96/모티애비#7805", "김하제/모티애비#7805/정글 탑", 180],
  ["박병준/94/늑 구#1003", "박병준/늑 구#1003/정글탑", 180],
  ["손민준/99/fukcin216", "손민준/fukcin216#7980/정글제외 무관", 180],
  ["송고은/95/고라니기운kr1", "송고은/95/고라니기운kr1", 180],
  ["시형/95/즐겜유저니로바#KR1", "박시형/95/즐겜유저니로바#KR1", 140],
  ["심현석/98/나는야칭찬무새kr1", "심현석/나는야칭찬무새#kr1", 180],
  ["유기훈/92/람스터#람스터", "유기훈/92/람스터#람스터/미드탑", 180],
  ["유대혁/95/유대혁#KR1", "유대혁/95/유대혁#KR1/sup", 180],
  ["유승수/98/MadCow#KR98", "유승수/MadCow/KR98", 180],
  ["윤소영/95/사육사#1003", "윤소영/사육사#1003/원딜미드서폿", 180],
  ["윤찬/85/드랍더비추kr3", "허윤찬/드랍더비추 #KR3/서폿", 140],
  ["이민우/99/네이내#KR1", "이민우/네이내#KR1/ALL", 180],
  ["최경준/98/뀨 잇#KR01", "최경준/뀨 잇/AD,SUP", 100],
];

describe("scoreAccountMatch", () => {
  it.each(REAL_PAIRS)("scores the observed pair %s / %s", (kakao, discord, expected) => {
    expect(scoreAccountMatch(kakao, discord).score).toBe(expected);
  });

  it("reports which signals fired", () => {
    expect(scoreAccountMatch("유대혁/95/유대혁#KR1", "유대혁/95/유대혁#KR1/sup").reasons).toEqual([
      "실명일치",
      "게임닉일치",
    ]);
    expect(scoreAccountMatch("국동명/99/kooki#kr99", "동명").reasons).toEqual(["실명접미사"]);
  });

  it("does not match a different person with a similar-looking name", () => {
    expect(scoreAccountMatch("윤소영/95/사육사#1003", "윤소영(지인)").score).toBe(0);
  });

  it("does not match two unrelated members", () => {
    expect(scoreAccountMatch("김하제/96/모티애비#7805", "김나연/주디#주토피아/미드정글").score).toBe(0);
  });

  it("scores nothing when either side is empty", () => {
    expect(scoreAccountMatch("", "김나연/주디#주토피아").score).toBe(0);
    expect(scoreAccountMatch("김나연/04/주디#주토피아", "").score).toBe(0);
  });

  it("ignores a segment shorter than three characters as a game-nickname signal", () => {
    // "뀨 잇" -> "뀨잇"(2자)은 신호로 쓰기에 너무 짧아 오탐이 나기 쉽다.
    expect(scoreAccountMatch("최경준/98/뀨 잇#KR01", "최경준/뀨 잇/AD,SUP").reasons).toEqual(["실명일치"]);
  });

  it("ignores the age segment", () => {
    // 나이가 같다는 이유로 점수가 붙으면 안 된다.
    expect(scoreAccountMatch("가나다/95/aaa", "라마바/95/bbb").score).toBe(0);
  });
});

describe("isSoleCandidate", () => {
  it("accepts a top score at or above the threshold", () => {
    expect(isSoleCandidate(140, 100)).toBe(true);
    expect(isSoleCandidate(180, 180)).toBe(true);
  });

  it("accepts a clear gap even below the threshold", () => {
    expect(isSoleCandidate(100, 0)).toBe(true);
    expect(isSoleCandidate(60, 0)).toBe(true);
  });

  it("rejects a close race below the threshold", () => {
    expect(isSoleCandidate(100, 60)).toBe(false);
    expect(isSoleCandidate(60, 60)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run packages/core/src/score-account-match.test.ts`
Expected: FAIL — `Failed to load url ./score-account-match`

- [ ] **Step 3: 구현**

`packages/core/src/score-account-match.ts`:

```typescript
export interface AccountMatchScore {
  score: number;
  reasons: string[];
}

const NAME_MATCH = 100;
const NAME_SUFFIX_MATCH = 60;
const GAME_NICK_MATCH = 80;

/** 단독 후보로 볼 최소 점수. */
export const SOLE_CANDIDATE_SCORE = 140;
/** 1위가 2위를 이만큼 벌리면 단독 후보로 본다. */
export const SOLE_CANDIDATE_GAP = 60;

/** 게임닉 신호로 쓰기에 충분히 긴 조각의 최소 길이. 짧으면 우연히 겹친다. */
const MIN_SIGNAL_LENGTH = 3;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s#._-]/g, "");
}

// "실명/95/게임닉#태그/포지션" 같은 문자열을 조각으로 쪼갠다. 나이처럼 숫자만인
// 조각은 버린다 — 같은 나이라는 이유로 점수가 붙으면 안 된다.
function segments(value: string): string[] {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^\d+$/.test(part));
}

export function scoreAccountMatch(kakaoNickname: string, discordDisplayName: string): AccountMatchScore {
  const kakaoSegments = segments(kakaoNickname);
  const discordSegments = segments(discordDisplayName);
  const reasons: string[] = [];
  let score = 0;

  const kakaoName = normalize(kakaoSegments[0] ?? "");
  const discordName = normalize(discordSegments[0] ?? "");

  if (kakaoName.length > 0 && kakaoName === discordName) {
    score += NAME_MATCH;
    reasons.push("실명일치");
  } else if (
    kakaoName.length > 0 &&
    discordName.length > 0 &&
    (kakaoName.endsWith(discordName) || discordName.endsWith(kakaoName))
  ) {
    // 카톡에서는 성을 빼고 쓰는 경우가 흔하다: "동명" ⊂ "국동명", "시형" ⊂ "박시형".
    score += NAME_SUFFIX_MATCH;
    reasons.push("실명접미사");
  }

  const kakaoRest = kakaoSegments.slice(1).map(normalize).filter((s) => s.length >= MIN_SIGNAL_LENGTH);
  const discordRest = discordSegments.slice(1).map(normalize).filter((s) => s.length >= MIN_SIGNAL_LENGTH);
  const gameNickHit = kakaoRest.some((k) =>
    discordRest.some((d) => d === k || d.startsWith(k) || k.startsWith(d))
  );
  if (gameNickHit) {
    score += GAME_NICK_MATCH;
    reasons.push("게임닉일치");
  }

  return { score, reasons };
}

export function isSoleCandidate(topScore: number, secondScore: number): boolean {
  return topScore >= SOLE_CANDIDATE_SCORE || topScore - secondScore >= SOLE_CANDIDATE_GAP;
}
```

`packages/core/src/index.ts`에 한 줄 추가한다 (`merge-members` 줄은 Task 8에서 지운다):

```typescript
export * from "./score-account-match";
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run packages/core/src/score-account-match.test.ts`
Expected: PASS — 16개 실데이터 케이스를 포함해 전부 통과.

- [ ] **Step 5: 전체 스위트 확인 후 커밋**

Run: `npx vitest run`
Expected: 기존 테스트 전부 통과 + 신규.

```bash
git add packages/core/src/score-account-match.ts packages/core/src/score-account-match.test.ts packages/core/src/index.ts
git commit -m "feat(core): score a kakao nickname against a discord display name"
```

---

### Task 2: 스키마 마이그레이션과 디스코드 표시 이름 수집

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_member_merge_and_display_name/migration.sql` (Prisma가 생성)
- Modify: `apps/dashboard/lib/discord/fetch-guild-members.ts`
- Modify: `apps/dashboard/lib/mutations/import-discord-members.ts`
- Modify: `apps/dashboard/lib/mutations/import-discord-members.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `Member.mergedIntoId: string | null`, `Member.discordDisplayName: string | null`, 관계 이름 `"MemberMerge"`(`mergedInto` / `absorbed`). `DiscordGuildMember`에 `displayName: string | null` 필드 추가. Task 3~9 전부가 이 스키마에 의존한다.

- [ ] **Step 1: 스키마 수정**

`packages/db/prisma/schema.prisma`의 `model Member`에서, `discordHandle` 줄 아래에 한 줄을 넣고 `updatedAt` 줄 아래에 병합 컬럼을 넣는다.

```prisma
model Member {
  id                 String   @id @default(uuid())
  realName           String?
  age                Int?
  riotId             String?
  discordUserId      String?  @unique
  discordHandle      String?
  discordDisplayName String?
  discordJoinedAt    DateTime?
  kakaoUserId        String?  @unique
  kakaoNickname      String?
  elo                Int      @default(1000)
  lastActiveAt       DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  // 흡수된 행(묘비)이 가리키는 생존자. null이면 활성 회원이다.
  // 묘비는 자기 kakaoNickname을 과거 닉네임으로 보존해 임포트 매칭에 쓰인다.
  mergedIntoId String?
  mergedInto   Member?  @relation("MemberMerge", fields: [mergedIntoId], references: [id])
  absorbed     Member[] @relation("MemberMerge")

  mentionLogs  MentionLog[]
  participants GameParticipant[]

  @@index([mergedIntoId])
}
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `cd packages/db && npx prisma migrate dev --name add_member_merge_and_display_name`
Expected: 새 마이그레이션 폴더가 생기고 개발 DB에 적용된다. 기존 행은 두 컬럼 모두 `NULL`이 된다.

Run: `cd packages/db && npx prisma generate`
Expected: 클라이언트 타입에 두 필드가 나타난다.

**주의:** `DATABASE_URL_TEST`가 가리키는 테스트 DB에도 마이그레이션을 적용해야 이후 통합 테스트가 돈다.

Run: `cd packages/db && DATABASE_URL="$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d'"' -f2)" npx prisma migrate deploy`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 3: 어댑터가 표시 이름을 뽑게 한다**

`apps/dashboard/lib/discord/fetch-guild-members.ts`에서 응답 타입과 매핑을 수정한다.

```typescript
interface DiscordApiGuildMember {
  user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null;
  joined_at?: string;
}
```

```typescript
  return body.flatMap((entry) => {
    if (!entry.user) return [];
    return [
      {
        discordUserId: entry.user.id,
        username: entry.user.username,
        // 매칭·표시용 이름. 서버 별명이 카톡 닉네임과 가장 비슷한 형식이라 먼저 보고,
        // 없으면 global_name으로 떨어진다. username은 "k._.dj" 같은 값이라 쓰지 않는다.
        displayName: entry.nick ?? entry.user.global_name ?? null,
        isBot: entry.user.bot === true,
        joinedAt: entry.joined_at ? new Date(entry.joined_at) : null,
      },
    ];
  });
```

- [ ] **Step 4: 실패하는 테스트 작성**

`apps/dashboard/lib/mutations/import-discord-members.test.ts`의 `describe` 블록 안에 두 케이스를 추가한다. 기존 케이스가 `DiscordGuildMember` 객체를 만들고 있으므로, 그것들에도 `displayName` 필드를 채워 타입을 맞춘다(값은 `null`이면 된다).

```typescript
  it("stores the discord display name on a newly created member", async () => {
    await importDiscordMembers(prisma, [
      { discordUserId: "d-1", username: "daehyeok_", displayName: "유대혁/95/유대혁#KR1/sup", isBot: false, joinedAt: null },
    ]);

    const member = await prisma.member.findUnique({ where: { discordUserId: "d-1" } });
    expect(member?.discordHandle).toBe("daehyeok_");
    expect(member?.discordDisplayName).toBe("유대혁/95/유대혁#KR1/sup");
  });

  it("refreshes the display name of an existing member", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "옛이름" },
    });

    await importDiscordMembers(prisma, [
      { discordUserId: "d-1", username: "daehyeok_", displayName: "새이름", isBot: false, joinedAt: null },
    ]);

    const member = await prisma.member.findUnique({ where: { discordUserId: "d-1" } });
    expect(member?.discordDisplayName).toBe("새이름");
  });
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/import-discord-members.test.ts`
Expected: FAIL — `discordDisplayName`이 `null`이라 기대값과 다르다.

- [ ] **Step 6: 임포트가 표시 이름을 저장하게 한다**

`apps/dashboard/lib/mutations/import-discord-members.ts`에서 타입에 필드를 추가하고 두 분기 모두에 저장한다.

```typescript
export interface DiscordGuildMember {
  discordUserId: string;
  username: string;
  displayName: string | null;
  isBot: boolean;
  joinedAt: Date | null;
}
```

기존 회원 갱신 분기:

```typescript
          await tx.member.update({
            where: { id: existing.id },
            data: {
              discordHandle: member.username,
              discordDisplayName: member.displayName,
              discordJoinedAt: existing.discordJoinedAt ?? member.joinedAt,
            },
          });
```

신규 생성 분기:

```typescript
          await tx.member.create({
            data: {
              discordUserId: member.discordUserId,
              discordHandle: member.username,
              discordDisplayName: member.displayName,
              discordJoinedAt: member.joinedAt,
            },
          });
```

- [ ] **Step 7: 테스트 통과 확인 후 커밋**

Run: `npx vitest run apps/dashboard/lib/mutations/import-discord-members.test.ts`
Expected: PASS

Run: `npx vitest run && npx tsc --noEmit -p apps/dashboard`
Expected: 전부 통과, 타입 오류 없음.

```bash
git add packages/db/prisma apps/dashboard/lib/discord/fetch-guild-members.ts apps/dashboard/lib/mutations/import-discord-members.ts apps/dashboard/lib/mutations/import-discord-members.test.ts
git commit -m "feat(db): add member merge tombstone column and discord display name"
```

---

### Task 3: `absorbMember` / `releaseMember`

**Files:**
- Create: `apps/dashboard/lib/mutations/absorb-member.ts`
- Create: `apps/dashboard/lib/mutations/absorb-member.test.ts`
- Create: `apps/dashboard/lib/mutations/release-member.ts`
- Create: `apps/dashboard/lib/mutations/release-member.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Member.mergedIntoId`.
- Produces: `absorbMember(prisma: PrismaClient, loserId: string, survivorId: string): Promise<void>`, `releaseMember(prisma: PrismaClient, tombstoneId: string): Promise<void>`. Task 8(서버 액션)이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성 — 흡수**

`apps/dashboard/lib/mutations/absorb-member.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "./absorb-member";

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

describe("absorbMember", () => {
  it("marks the loser as merged without deleting it", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "daehyeok_" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUnique({ where: { id: loser.id } });
    expect(after?.mergedIntoId).toBe(survivor.id);
    expect(after?.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("leaves the loser's mention logs on the loser", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@유대혁" },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    expect(await prisma.mentionLog.count({ where: { memberId: loser.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);
  });

  it("fills the survivor's blank fields and keeps its elo", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", elo: 1200 } });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁", age: 95, riotId: "유대혁#KR1", elo: 900 },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.realName).toBe("유대혁");
    expect(after.age).toBe(95);
    expect(after.riotId).toBe("유대혁#KR1");
    expect(after.elo).toBe(1200);
  });

  it("does not overwrite a field the survivor already has", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1", realName: "사람이 고친 이름" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" } });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.realName).toBe("사람이 고친 이름");
  });

  it("moves the survivor's lastActiveAt forward to the later of the two", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", lastActiveAt: new Date(2026, 7, 1) },
    });
    const loser = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", lastActiveAt: new Date(2026, 7, 20) },
    });

    await absorbMember(prisma, loser.id, survivor.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.lastActiveAt).toEqual(new Date(2026, 7, 20));
  });

  it("points at the ultimate survivor when the target is itself a tombstone", async () => {
    const top = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const middle = await prisma.member.create({ data: { kakaoNickname: "옛닉" } });
    await absorbMember(prisma, middle.id, top.id);

    const newest = await prisma.member.create({ data: { kakaoNickname: "새닉" } });
    await absorbMember(prisma, newest.id, middle.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: newest.id } });
    expect(after.mergedIntoId).toBe(top.id);
  });

  it("refuses a loser that is already a tombstone", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "옛닉" } });
    await absorbMember(prisma, loser.id, survivor.id);

    await expect(absorbMember(prisma, loser.id, survivor.id)).rejects.toThrow();
  });

  it("refuses a loser that holds a discord account", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { discordUserId: "d-2", kakaoNickname: "닉" } });

    await expect(absorbMember(prisma, loser.id, survivor.id)).rejects.toThrow();

    const after = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    expect(after.mergedIntoId).toBeNull();
  });

  it("refuses to absorb a member into itself", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "닉" } });

    await expect(absorbMember(prisma, member.id, member.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/absorb-member.test.ts`
Expected: FAIL — `Failed to load url ./absorb-member`

- [ ] **Step 3: `absorbMember` 구현**

`apps/dashboard/lib/mutations/absorb-member.ts`:

```typescript
import type { PrismaClient } from "@lolpamin/db";

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * loser를 survivor에게 흡수시킨다. 행을 지우지 않고 mergedIntoId만 심으므로
 * releaseMember로 되돌릴 수 있고, loser의 kakaoNickname은 과거 닉네임으로 남아
 * 이후 카톡 임포트가 같은 사람에게 활동을 이어붙이는 데 쓰인다.
 */
export async function absorbMember(
  prisma: PrismaClient,
  loserId: string,
  survivorId: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const loser = await tx.member.findUniqueOrThrow({ where: { id: loserId } });

      if (loser.mergedIntoId !== null) {
        throw new Error("이미 다른 회원에게 흡수된 계정입니다.");
      }
      // 묘비가 유니크 컬럼을 쥐고 있으면 같은 계정을 다시 가져올 때 제약에 막힌다.
      if (loser.discordUserId !== null || loser.kakaoUserId !== null) {
        throw new Error("플랫폼 계정 ID를 가진 회원은 흡수할 수 없습니다. 카톡 닉네임만 있는 회원만 흡수됩니다.");
      }

      // 대상이 이미 묘비면 그 생존자를 가리키게 한다 — mergedIntoId는 항상 활성 회원을 가리킨다.
      const target = await tx.member.findUniqueOrThrow({ where: { id: survivorId } });
      const survivor =
        target.mergedIntoId === null
          ? target
          : await tx.member.findUniqueOrThrow({ where: { id: target.mergedIntoId } });

      if (survivor.id === loser.id) {
        throw new Error("자기 자신에게 흡수시킬 수 없습니다.");
      }

      // elo는 건드리지 않는다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
      await tx.member.update({
        where: { id: survivor.id },
        data: {
          realName: survivor.realName ?? loser.realName,
          age: survivor.age ?? loser.age,
          riotId: survivor.riotId ?? loser.riotId,
          lastActiveAt: laterOf(survivor.lastActiveAt, loser.lastActiveAt),
        },
      });

      await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });
    },
    { timeout: 20000 },
  );
}
```

- [ ] **Step 4: 흡수 테스트 통과 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/absorb-member.test.ts`
Expected: PASS (9개)

- [ ] **Step 5: 실패하는 테스트 작성 — 해제**

`apps/dashboard/lib/mutations/release-member.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { absorbMember } from "./absorb-member";
import { releaseMember } from "./release-member";

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

describe("releaseMember", () => {
  it("makes the tombstone an active member again", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await absorbMember(prisma, loser.id, survivor.id);

    await releaseMember(prisma, loser.id);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: loser.id } });
    expect(after.mergedIntoId).toBeNull();
    expect(after.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
  });

  it("recomputes both sides' lastActiveAt from their own mention logs", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const loser = await prisma.member.create({ data: { kakaoNickname: "닉" } });
    await prisma.mentionLog.create({
      data: { memberId: loser.id, mentionedAt: new Date(2026, 7, 20), rawMessage: "@닉" },
    });
    await absorbMember(prisma, loser.id, survivor.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 20)
    );

    await releaseMember(prisma, loser.id);

    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toBeNull();
    expect((await prisma.member.findUniqueOrThrow({ where: { id: loser.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 20)
    );
  });

  it("keeps the survivor's activity that came from a tombstone it still holds", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const kept = await prisma.member.create({ data: { kakaoNickname: "남는닉" } });
    const released = await prisma.member.create({ data: { kakaoNickname: "떼는닉" } });
    await prisma.mentionLog.create({
      data: { memberId: kept.id, mentionedAt: new Date(2026, 7, 10), rawMessage: "@남는닉" },
    });
    await prisma.mentionLog.create({
      data: { memberId: released.id, mentionedAt: new Date(2026, 7, 20), rawMessage: "@떼는닉" },
    });
    await absorbMember(prisma, kept.id, survivor.id);
    await absorbMember(prisma, released.id, survivor.id);

    await releaseMember(prisma, released.id);

    // 떼어낸 쪽의 활동은 사라지고, 아직 붙어 있는 묘비의 활동은 남아야 한다.
    expect((await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } })).lastActiveAt).toEqual(
      new Date(2026, 7, 10)
    );
  });

  it("refuses a member that is not a tombstone", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "닉" } });

    await expect(releaseMember(prisma, member.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/release-member.test.ts`
Expected: FAIL — `Failed to load url ./release-member`

- [ ] **Step 7: `releaseMember` 구현**

`apps/dashboard/lib/mutations/release-member.ts`:

```typescript
import type { Prisma, PrismaClient } from "@lolpamin/db";

// 활동 기록은 병합할 때 옮기지 않으므로, 한 회원의 진짜 마지막 활동은 자기 로그와
// 아직 자기에게 붙어 있는 묘비들의 로그를 함께 봐야 나온다.
async function recomputeLastActiveAt(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
  const ids = [memberId, ...tombstones.map((t) => t.id)];
  const latest = await tx.mentionLog.aggregate({
    where: { memberId: { in: ids } },
    _max: { mentionedAt: true },
  });
  await tx.member.update({ where: { id: memberId }, data: { lastActiveAt: latest._max.mentionedAt } });
}

/** 흡수를 되돌린다. 묘비를 다시 활성 회원으로 만들고 양쪽 lastActiveAt을 다시 계산한다. */
export async function releaseMember(prisma: PrismaClient, tombstoneId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const tombstone = await tx.member.findUniqueOrThrow({ where: { id: tombstoneId } });
      if (tombstone.mergedIntoId === null) {
        throw new Error("흡수되지 않은 회원이라 연결을 끊을 수 없습니다.");
      }
      const survivorId = tombstone.mergedIntoId;

      await tx.member.update({ where: { id: tombstoneId }, data: { mergedIntoId: null } });

      await recomputeLastActiveAt(tx, tombstoneId);
      await recomputeLastActiveAt(tx, survivorId);
    },
    { timeout: 20000 },
  );
}
```

- [ ] **Step 8: 테스트 통과 확인 후 커밋**

Run: `npx vitest run apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.test.ts`
Expected: PASS (13개)

Run: `npx vitest run`
Expected: 전부 통과.

```bash
git add apps/dashboard/lib/mutations/absorb-member.ts apps/dashboard/lib/mutations/absorb-member.test.ts apps/dashboard/lib/mutations/release-member.ts apps/dashboard/lib/mutations/release-member.test.ts
git commit -m "feat(members): absorb and release a member without deleting rows"
```

---

### Task 4: 활성 회원만 보이도록 조회에 필터 추가

이 태스크는 같은 모양의 작은 수정 일곱 건이다. 파일마다 `where`에 `mergedIntoId: null`을 넣는 것이 전부이고, 마지막에 묘비가 어디에도 안 보이는지 확인하는 테스트를 하나 추가한다.

**Files:**
- Modify: `apps/dashboard/lib/queries/members.ts`
- Modify: `apps/dashboard/lib/queries/inactive.ts`
- Modify: `apps/dashboard/lib/queries/linked-members.ts`
- Modify: `apps/dashboard/lib/queries/pending-accounts.ts`
- Modify: `apps/dashboard/components/AppShell.tsx`
- Modify: `apps/discord-bot/src/lib/get-leaderboard.ts`
- Modify: `apps/discord-bot/src/lib/get-member-rank.ts`
- Modify: `apps/dashboard/lib/queries/members.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Member.mergedIntoId`.
- Produces: 동작 변경만. 모든 함수 시그니처와 반환 타입은 그대로다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/queries/members.test.ts`의 `describe` 블록 안에 추가한다.

```typescript
  it("hides a member that was absorbed into another", async () => {
    const survivor = await prisma.member.create({ data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1" } });
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    const data = await getMemberListData("all", "", "elo", "desc");

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].id).toBe(survivor.id);
    expect(data.totalCount).toBe(1);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/queries/members.test.ts`
Expected: FAIL — `expected length 1, received 2`

- [ ] **Step 3: 일곱 곳에 필터를 넣는다**

`apps/dashboard/lib/queries/members.ts` — `getMemberListData` 안의 `findMany`:

```typescript
  const allMembers = await prisma.member.findMany({
    where: { mergedIntoId: null },
    orderBy: orderByFor(sort, dir),
    include: { _count: { select: { mentionLogs: true, participants: true } } },
  });
```

`apps/dashboard/lib/queries/inactive.ts` — `getInactiveReportData` 안의 `findMany`:

```typescript
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: { _count: { select: { participants: true } } },
  });
```

`apps/dashboard/lib/queries/linked-members.ts` — `getLinkedMembers` 안의 `where`:

```typescript
    where: {
      mergedIntoId: null,
      discordUserId: { not: null },
      OR: [{ kakaoUserId: { not: null } }, { kakaoNickname: { not: null } }],
    },
```

`apps/dashboard/lib/queries/pending-accounts.ts` — 두 함수의 `where` 각각에 `mergedIntoId: null,`을 첫 줄로 넣는다:

```typescript
    where: { mergedIntoId: null, kakaoUserId: null, kakaoNickname: null, discordUserId: { not: null } },
```

```typescript
    where: { mergedIntoId: null, discordUserId: null, kakaoNickname: { not: null } },
```

`apps/dashboard/components/AppShell.tsx` — 두 호출:

```typescript
    prisma.member.count({ where: { mergedIntoId: null } }),
    prisma.member.findMany({
      where: { mergedIntoId: null },
      select: { id: true, kakaoUserId: true, kakaoNickname: true, lastActiveAt: true, createdAt: true },
    }),
```

`apps/discord-bot/src/lib/get-leaderboard.ts`:

```typescript
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    orderBy: [{ elo: "desc" }, { id: "asc" }],
    take: limit,
  });
```

`apps/discord-bot/src/lib/get-member-rank.ts`:

```typescript
  const higherCount = await prisma.member.count({ where: { elo: { gt: elo }, mergedIntoId: null } });
```

`apps/discord-bot/src/lib/get-member-by-discord-id.ts`는 **고치지 않는다** — `discordUserId`로 찾는데 불변식 1에 의해 묘비는 그 값을 가질 수 없다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run apps/dashboard/lib/queries/members.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 확인 후 커밋**

Run: `npx vitest run && npx tsc --noEmit -p apps/dashboard`
Expected: 전부 통과.

```bash
git add apps/dashboard/lib/queries apps/dashboard/components/AppShell.tsx apps/discord-bot/src/lib/get-leaderboard.ts apps/discord-bot/src/lib/get-member-rank.ts
git commit -m "fix(queries): exclude absorbed members from every member listing"
```

---

### Task 5: 카톡 임포트가 과거 닉네임을 따라가게 한다

**Files:**
- Modify: `apps/dashboard/lib/kakao-import/process-export.ts`
- Modify: `apps/dashboard/lib/kakao-import/process-export.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Member.mergedIntoId`.
- Produces: 동작 변경만. `processKakaoExport`의 시그니처와 반환 타입 `{ newMembers, activityUpdates, skippedAsAlreadyProcessed }`는 그대로다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/kakao-import/process-export.test.ts`의 `describe` 블록 안에 추가한다. 이 파일은 헬퍼 없이 내보내기 텍스트를 문자열 배열로 직접 만들고 있으므로(`FIRST_UPLOAD` 참조) 같은 형태를 쓴다.

```typescript
  it("credits activity to the survivor when the mention hits a past nickname", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", kakaoNickname: "유대혁/95/새닉#KR1", realName: "유대혁" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/옛닉#KR1", mergedIntoId: survivor.id },
    });

    const upload = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-09-01 10:00:00",
      "--------------- 2026년 9월 1일 화요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:00] @유대혁/95/옛닉#KR1",
    ].join("\n");

    const result = await processKakaoExport(prisma, upload);

    expect(result.newMembers).toBe(0);
    expect(result.activityUpdates).toBe(1);

    // 활동은 생존자에게 올라가고, 멘션 로그는 히트한 묘비에 그대로 달린다 —
    // 연결을 끊으면 로그도 함께 돌아가야 하기 때문이다.
    const after = await prisma.member.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(after.lastActiveAt).not.toBeNull();
    expect(await prisma.mentionLog.count({ where: { memberId: tombstone.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: survivor.id } })).toBe(0);
    // 새 회원이 생기면 안 된다 — 묘비를 못 찾으면 여기서 3이 된다.
    expect(await prisma.member.count()).toBe(2);
  });
```

멘션한 사람(`김민준/94/늑 대#1003`)은 발신자일 뿐 활동 신호가 아니므로 회원으로 만들어지지 않는다 — 기존 테스트가 이미 그 전제로 쓰여 있다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/kakao-import/process-export.test.ts`
Expected: FAIL — 생존자의 `lastActiveAt`이 `null`이고 회원 수가 3이 된다(묘비를 못 찾아 새 회원을 만든다).

**주의:** 여기서 실패하지 않는다면 조회가 이미 묘비를 찾고 있다는 뜻이다. 그래도 `lastActiveAt`이 묘비에 올라가므로 단언은 실패해야 한다.

- [ ] **Step 3: 매칭이 묘비를 따라가게 한다**

`apps/dashboard/lib/kakao-import/process-export.ts`의 `if (existing)` 분기를 다음으로 바꾼다.

```typescript
      if (existing) {
        // 묘비(과거 닉네임)에 히트했으면 활동은 생존자에게 올린다. 닉네임을 바꾼
        // 회원의 활동이 끊기지 않게 하는 지점이다. 멘션 로그는 히트한 행에 그대로
        // 달아, 나중에 연결을 끊으면 로그도 함께 돌아가게 한다.
        // realName은 건드리지 않는다 — 사람이 고쳐둔 값을 재업로드가 되돌리면 안 된다.
        const activeId = existing.mergedIntoId ?? existing.id;
        await tx.member.update({ where: { id: activeId }, data: { lastActiveAt: mention.mentionedAt } });
        memberId = existing.id;
        activityUpdates++;
      } else {
```

`findFirst`의 `where`는 그대로 둔다 — 묘비를 **제외하지 않아야** 과거 닉네임에 히트한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run apps/dashboard/lib/kakao-import/process-export.test.ts`
Expected: PASS — 기존 케이스도 전부 통과해야 한다(묘비가 없으면 `existing.mergedIntoId`가 `null`이라 동작이 이전과 같다).

- [ ] **Step 5: 커밋**

Run: `npx vitest run`
Expected: 전부 통과.

```bash
git add apps/dashboard/lib/kakao-import/process-export.ts apps/dashboard/lib/kakao-import/process-export.test.ts
git commit -m "feat(kakao-import): credit activity to the survivor when a past nickname is mentioned"
```

---

### Task 6: 정규화 스크립트를 묘비 방식으로 바꾼다

**Files:**
- Modify: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`
- Modify: `apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`
- Modify: `apps/dashboard/scripts/normalize-kakao-nicknames.ts`

**Interfaces:**
- Consumes: Task 2의 `Member.mergedIntoId`.
- Produces: `NormalizeResult`는 그대로 `{ normalized, merged, realNamesFilled, mergedPairs }`이고, `MergedPair`의 `movedMentionLogs`/`movedGameParticipants`가 `loserMentionLogs`/`loserGameParticipants`로 바뀐다 — 이제 옮기는 게 아니라 묘비에 남는 수이기 때문이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`에서 기존 케이스 중 "패자 행이 삭제된다"거나 "활동기록이 생존자로 옮겨진다"를 단언하는 부분을 묘비 기준으로 고치고, 아래 케이스를 추가한다.

```typescript
  it("turns the loser into a tombstone instead of deleting it", async () => {
    const first = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    const second = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });
    await prisma.mentionLog.create({
      data: { memberId: second.id, mentionedAt: new Date(2026, 7, 2), rawMessage: "@유대혁" },
    });

    const result = await normalizeKakaoNicknames(prisma);

    expect(result.merged).toBe(1);
    const loser = await prisma.member.findUnique({ where: { id: second.id } });
    expect(loser).not.toBeNull();
    expect(loser?.mergedIntoId).toBe(first.id);
    // 활동기록은 옮기지 않고 묘비에 남는다.
    expect(await prisma.mentionLog.count({ where: { memberId: second.id } })).toBe(1);
    expect(await prisma.mentionLog.count({ where: { memberId: first.id } })).toBe(0);
    expect(result.mergedPairs[0].loserMentionLogs).toBe(1);
  });

  it("does not re-merge a tombstone on a second run", async () => {
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", createdAt: new Date(2026, 7, 1) },
    });
    await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1 (8시 도착)", createdAt: new Date(2026, 7, 2) },
    });

    await normalizeKakaoNicknames(prisma);
    const second = await normalizeKakaoNicknames(prisma);

    expect(second).toEqual({ normalized: 0, merged: 0, realNamesFilled: 0, mergedPairs: [] });
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`
Expected: FAIL — 패자 행이 삭제돼 `loser`가 `null`이고, `loserMentionLogs` 필드가 없다.

- [ ] **Step 3: 구현 수정**

`apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts`에서 네 곳을 고친다.

1. `MergedPair` 필드 이름:

```typescript
export interface MergedPair {
  survivorId: string;
  survivorNickname: string;
  loserId: string;
  loserNickname: string;
  loserMentionLogs: number;
  loserGameParticipants: number;
}
```

2. 그룹핑 대상에서 묘비를 뺀다 — 이미 흡수된 행을 다시 병합하면 안 된다:

```typescript
      const members = await tx.member.findMany({
        where: { mergedIntoId: null, kakaoNickname: { not: null } },
        orderBy: { createdAt: "asc" },
      });
```

3. 패자 처리 루프에서 삭제·이동을 묘비 표시와 개수 세기로 바꾼다:

```typescript
        for (const loser of losers) {
          // 활동기록을 옮기지 않고 묘비에 남긴다 — 연결을 끊으면 기록도 함께
          // 돌아가야 하고, 그래야 되돌리기가 mergedIntoId 한 줄로 끝난다.
          const loserMentionLogs = await tx.mentionLog.count({ where: { memberId: loser.id } });
          const loserGameParticipants = await tx.gameParticipant.count({ where: { memberId: loser.id } });
          await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });
          merged++;
          mergedPairs.push({
            survivorId: survivor.id,
            survivorNickname: nickname,
            loserId: loser.id,
            loserNickname: loser.kakaoNickname!,
            loserMentionLogs,
            loserGameParticipants,
          });
        }
```

4. 실명 채우기 대상에서도 묘비를 뺀다:

```typescript
      const blankRealNames = await tx.member.findMany({
        where: { mergedIntoId: null, realName: null, kakaoNickname: { not: null } },
      });
```

- [ ] **Step 4: CLI 출력의 필드 이름을 맞춘다**

`apps/dashboard/scripts/normalize-kakao-nicknames.ts`의 쌍별 출력에서 두 번째 줄을 바꾼다. `->`의 의미도 "옮겼다"가 아니라 "흡수됐다"로 바뀌었으므로 라벨을 함께 손본다.

바꾸기 전:

```typescript
      ` [mentionLogs=${pair.movedMentionLogs}, gameParticipants=${pair.movedGameParticipants}]`);
```

바꾼 뒤:

```typescript
      ` [묘비에 남은 mentionLogs=${pair.loserMentionLogs}, gameParticipants=${pair.loserGameParticipants}]`);
```

`before`/`after`의 `members` 카운트도 이제 묘비를 포함하므로, 스크립트가 활성 회원 수를 따로 보여주게 한다. `before`와 `after` 객체 각각에 한 줄씩 넣는다.

```typescript
    activeMembers: await prisma.member.count({ where: { mergedIntoId: null } }),
```

- [ ] **Step 5: 테스트 통과 확인 후 커밋**

Run: `npx vitest run apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts`
Expected: PASS

Run: `npx vitest run && npx tsc --noEmit -p apps/dashboard`
Expected: 전부 통과.

```bash
git add apps/dashboard/lib/mutations/normalize-kakao-nicknames.ts apps/dashboard/lib/mutations/normalize-kakao-nicknames.test.ts apps/dashboard/scripts/normalize-kakao-nicknames.ts
git commit -m "refactor(members): normalize by tombstoning duplicates instead of deleting them"
```

---

### Task 7: `deleteMember`와 `saveGameResult`를 묘비에 맞춘다

같은 성격의 작은 수정 두 건이다. 하나는 회원을 지울 때 묘비까지 지우는 것, 하나는 "연결됨" 판정이 실제로 채워지는 필드를 보게 하는 것이다.

**Files:**
- Modify: `apps/dashboard/lib/mutations/delete-member.ts`
- Modify: `apps/dashboard/lib/mutations/delete-member.test.ts`
- Modify: `apps/dashboard/lib/mutations/save-game-result.ts`
- Modify: `apps/dashboard/lib/mutations/save-game-result.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Member.mergedIntoId`.
- Produces: `deleteMember`의 반환 타입 `{ mentionLogs, gameParticipants }`는 그대로이며, 묘비의 기록까지 합산한 값이 된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/mutations/delete-member.test.ts`에 추가:

```typescript
  it("deletes the tombstones the member absorbed, and their records", async () => {
    const survivor = await prisma.member.create({ data: { discordUserId: "d-1" } });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });
    await prisma.mentionLog.create({
      data: { memberId: tombstone.id, mentionedAt: new Date(2026, 7, 1), rawMessage: "@옛닉" },
    });

    const result = await deleteMember(prisma, survivor.id);

    expect(result.mentionLogs).toBe(1);
    expect(await prisma.member.findUnique({ where: { id: tombstone.id } })).toBeNull();
    expect(await prisma.member.findUnique({ where: { id: survivor.id } })).toBeNull();
  });
```

`apps/dashboard/lib/mutations/save-game-result.test.ts`에 추가. 기존 케이스가 참가자를 만드는 방식을 그대로 따르되, `kakaoUserId` 대신 `kakaoNickname`으로 연결된 회원이 참가할 수 있어야 한다.

```typescript
  it("accepts a member linked by discord id and kakao nickname", async () => {
    // kakaoUserId를 채우는 경로가 시스템에 없다. 카톡 봇이 폐기되면서 사라졌고,
    // 연결은 kakaoNickname으로 이뤄진다. 그것을 요구하면 아무도 경기에 못 들어간다.
    const members = await Promise.all(
      Array.from({ length: 2 }, (_, i) =>
        prisma.member.create({
          data: { discordUserId: `d-${i}`, discordHandle: `h-${i}`, kakaoNickname: `닉-${i}` },
        })
      )
    );

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(2026, 7, 1),
        winner: "BLUE",
        blueMemberIds: [members[0].id],
        redMemberIds: [members[1].id],
      })
    ).resolves.toBeDefined();
  });

  it("refuses an absorbed member as a participant", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-a", kakaoNickname: "닉-a" },
    });
    const other = await prisma.member.create({
      data: { discordUserId: "d-b", kakaoNickname: "닉-b" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id },
    });

    await expect(
      saveGameResult(prisma, {
        playedAt: new Date(2026, 7, 1),
        winner: "BLUE",
        blueMemberIds: [tombstone.id],
        redMemberIds: [other.id],
      })
    ).rejects.toThrow();
  });
```

`saveGameResult`의 인자 타입은 `SaveGameResultInput = { playedAt: Date; blueMemberIds: string[]; redMemberIds: string[]; winner: "BLUE" | "RED" }`이다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/mutations/delete-member.test.ts apps/dashboard/lib/mutations/save-game-result.test.ts`
Expected: FAIL — 묘비가 남아 FK 위반이 나거나, `kakaoUserId`가 없어 참가가 거부된다.

- [ ] **Step 3: `deleteMember` 수정**

`apps/dashboard/lib/mutations/delete-member.ts`의 트랜잭션 본문을 다음으로 바꾼다.

```typescript
  return prisma.$transaction(async (tx) => {
    await tx.member.findUniqueOrThrow({ where: { id: memberId } });

    // 이 회원이 흡수한 묘비들도 함께 지운다. 남겨두면 mergedIntoId가 고아가 된다.
    const tombstones = await tx.member.findMany({ where: { mergedIntoId: memberId }, select: { id: true } });
    const ids = [memberId, ...tombstones.map((t) => t.id)];

    // Neither relation is ON DELETE CASCADE, so the children have to go first.
    // The GameResult rows themselves stay: a past game keeps the participants
    // it still has, and its recorded elo deltas are never recalculated.
    const gameParticipants = await tx.gameParticipant.deleteMany({ where: { memberId: { in: ids } } });
    const mentionLogs = await tx.mentionLog.deleteMany({ where: { memberId: { in: ids } } });
    await tx.member.deleteMany({ where: { id: { in: ids } } });

    return { mentionLogs: mentionLogs.count, gameParticipants: gameParticipants.count };
  });
```

- [ ] **Step 4: `saveGameResult` 수정**

`apps/dashboard/lib/mutations/save-game-result.ts`의 참가자 검사 루프를 바꾼다.

```typescript
    for (const member of members) {
      if (member.mergedIntoId !== null) {
        throw new Error(`Participant ${member.id} was absorbed into another member and cannot play`);
      }
      // kakaoUserId는 이 시스템에서 채워지는 경로가 없다(카톡 봇 폐기). 연결은
      // kakaoNickname으로 이뤄지므로 그것을 연결의 근거로 본다.
      if (!member.discordUserId || !member.kakaoNickname) {
        throw new Error(`Participant ${member.id} must be fully linked to play in a match`);
      }
    }
```

- [ ] **Step 5: 테스트 통과 확인 후 커밋**

Run: `npx vitest run apps/dashboard/lib/mutations/delete-member.test.ts apps/dashboard/lib/mutations/save-game-result.test.ts`
Expected: PASS

Run: `npx vitest run`
Expected: 전부 통과.

```bash
git add apps/dashboard/lib/mutations/delete-member.ts apps/dashboard/lib/mutations/delete-member.test.ts apps/dashboard/lib/mutations/save-game-result.ts apps/dashboard/lib/mutations/save-game-result.test.ts
git commit -m "fix(members): delete absorbed tombstones and link games by kakao nickname"
```

---

### Task 8: 후보 제안 쿼리와 연결/해제 서버 액션

**Files:**
- Create: `apps/dashboard/lib/queries/link-candidates.ts`
- Create: `apps/dashboard/lib/queries/link-candidates.test.ts`
- Modify: `apps/dashboard/app/link-accounts/actions.ts`
- Delete: `apps/dashboard/lib/mutations/link-members.ts`
- Delete: `apps/dashboard/lib/mutations/link-members.test.ts`
- Delete: `packages/core/src/merge-members.ts`
- Delete: `packages/core/src/merge-members.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `scoreAccountMatch` / `isSoleCandidate` (Task 1), `absorbMember` / `releaseMember` (Task 3), `requireAdmin` (기존).
- Produces: `getKakaoAccountsWithCandidates(): Promise<KakaoAccountWithCandidates[]>`, `getMembersWithAliases(): Promise<MemberWithAliases[]>`, `absorbMemberAction(loserId: string, survivorId: string): Promise<{ error: string | null }>`, `releaseMemberAction(tombstoneId: string): Promise<{ error: string | null }>`. Task 9(UI)가 쓴다. `linkMembersAction`과 `linkMembers`, `mergeMembers`는 사라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/queries/link-candidates.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getKakaoAccountsWithCandidates, getMembersWithAliases } from "./link-candidates";

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

describe("getKakaoAccountsWithCandidates", () => {
  it("ranks the matching discord account first and marks it sole", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({
      data: { discordUserId: "d-2", discordHandle: "na_yeoni", discordDisplayName: "김나연/주디#주토피아/미드정글" },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1", realName: "유대혁" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.kakaoNickname).toBe("유대혁/95/유대혁#KR1");
    expect(account.candidates[0].handle).toBe("daehyeok_");
    expect(account.candidates[0].reasons).toEqual(["실명일치", "게임닉일치"]);
    expect(account.candidates[0].isSole).toBe(true);
  });

  it("offers an already-linked member as a candidate for a renamed nickname", async () => {
    // 닉네임을 바꾼 사람은 "미연결 디스코드"가 아니라 "이미 연결된 회원"에 붙어야 한다.
    await prisma.member.create({
      data: {
        discordUserId: "d-1",
        discordHandle: "daehyeok_",
        discordDisplayName: "유대혁/95/유대혁#KR1/sup",
        kakaoNickname: "유대혁/95/유대혁#KR1",
      },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR2", realName: "유대혁" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.candidates[0].handle).toBe("daehyeok_");
    expect(account.candidates[0].kind).toBe("linked");
  });

  it("leaves the candidate list empty when nothing scores", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "someone", discordDisplayName: "전혀다른사람" },
    });
    await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    const [account] = await getKakaoAccountsWithCandidates();

    expect(account.candidates).toEqual([]);
  });

  it("skips absorbed accounts on both sides", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", discordDisplayName: "유대혁/95/유대혁#KR1/sup" },
    });
    await prisma.member.create({ data: { kakaoNickname: "옛닉", mergedIntoId: survivor.id } });

    expect(await getKakaoAccountsWithCandidates()).toEqual([]);
  });
});

describe("getMembersWithAliases", () => {
  it("lists each active member's absorbed nicknames", async () => {
    const survivor = await prisma.member.create({
      data: { discordUserId: "d-1", discordHandle: "daehyeok_", realName: "유대혁" },
    });
    const tombstone = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/옛닉#KR1", mergedIntoId: survivor.id },
    });
    await prisma.member.create({ data: { discordUserId: "d-2", discordHandle: "alone" } });

    const rows = await getMembersWithAliases();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(survivor.id);
    expect(rows[0].aliases).toEqual([{ id: tombstone.id, kakaoNickname: "유대혁/95/옛닉#KR1" }]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/dashboard/lib/queries/link-candidates.test.ts`
Expected: FAIL — `Failed to load url ./link-candidates`

- [ ] **Step 3: 쿼리 구현**

`apps/dashboard/lib/queries/link-candidates.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { isSoleCandidate, scoreAccountMatch } from "@lolpamin/core";

/** 한 카톡 계정에 붙일 수 있는 상대 후보. */
export interface LinkCandidate {
  memberId: string;
  handle: string;
  displayName: string;
  /** discord-only는 아직 카톡이 없는 계정, linked는 이미 연결된 회원(=닉네임 변경 경로). */
  kind: "discord-only" | "linked";
  score: number;
  reasons: string[];
  isSole: boolean;
}

export interface KakaoAccountWithCandidates {
  id: string;
  kakaoNickname: string;
  realName: string;
  candidates: LinkCandidate[];
}

export interface MemberAlias {
  id: string;
  kakaoNickname: string;
}

export interface MemberWithAliases {
  id: string;
  label: string;
  aliases: MemberAlias[];
}

/** 화면에 보여줄 후보 수. 점수가 붙은 후보가 이보다 많아도 상위 몇 개만 낸다. */
const MAX_CANDIDATES = 5;

export async function getKakaoAccountsWithCandidates(): Promise<KakaoAccountWithCandidates[]> {
  const [kakaoAccounts, discordMembers] = await Promise.all([
    prisma.member.findMany({
      where: { mergedIntoId: null, discordUserId: null, kakaoNickname: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.member.findMany({
      where: { mergedIntoId: null, discordUserId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return kakaoAccounts.map((account) => {
    const scored = discordMembers
      .map((d) => {
        // 표시 이름이 없으면 핸들로라도 대본다. 핸들은 대개 매칭에 쓸모없지만,
        // 가끔 "김복건/96/뚜비뚜밥#뚜비얌"처럼 쓰는 사람이 있다.
        const displayName = d.discordDisplayName ?? d.discordHandle ?? "";
        const { score, reasons } = scoreAccountMatch(account.kakaoNickname!, displayName);
        return {
          memberId: d.id,
          handle: d.discordHandle ?? d.discordUserId!,
          displayName,
          kind: (d.kakaoNickname === null ? "discord-only" : "linked") as LinkCandidate["kind"],
          score,
          reasons,
          isSole: false,
        };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));

    const candidates = scored.slice(0, MAX_CANDIDATES);
    if (candidates.length > 0) {
      candidates[0].isSole = isSoleCandidate(candidates[0].score, candidates[1]?.score ?? 0);
    }

    return {
      id: account.id,
      kakaoNickname: account.kakaoNickname!,
      realName: account.realName ?? "-",
      candidates,
    };
  });
}

export async function getMembersWithAliases(): Promise<MemberWithAliases[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, absorbed: { some: {} } },
    include: { absorbed: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    label: m.realName ?? m.discordHandle ?? m.kakaoNickname ?? m.id,
    aliases: m.absorbed.map((a) => ({ id: a.id, kakaoNickname: a.kakaoNickname ?? "(닉네임 없음)" })),
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run apps/dashboard/lib/queries/link-candidates.test.ts`
Expected: PASS (5개)

- [ ] **Step 5: 서버 액션 교체**

`apps/dashboard/app/link-accounts/actions.ts`에서 `linkMembersAction`을 지우고 두 액션을 넣는다. `linkMembers` 임포트도 지운다.

```typescript
import { absorbMember } from "@/lib/mutations/absorb-member";
import { releaseMember } from "@/lib/mutations/release-member";
```

```typescript
export async function absorbMemberAction(loserId: string, survivorId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!loserId || !survivorId) {
    return { error: "연결할 카톡 계정과 상대를 각각 하나씩 골라주세요." };
  }

  try {
    await absorbMember(prisma, loserId, survivorId);
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message : "연결하지 못했습니다." };
  }

  revalidatePath("/link-accounts");
  revalidatePath("/members");
  return { error: null };
}

export async function releaseMemberAction(tombstoneId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!tombstoneId) {
    return { error: "끊을 별칭을 골라주세요." };
  }

  try {
    await releaseMember(prisma, tombstoneId);
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message : "연결을 끊지 못했습니다." };
  }

  revalidatePath("/link-accounts");
  revalidatePath("/members");
  return { error: null };
}
```

- [ ] **Step 6: 죽은 코드 삭제**

```bash
git rm apps/dashboard/lib/mutations/link-members.ts apps/dashboard/lib/mutations/link-members.test.ts packages/core/src/merge-members.ts packages/core/src/merge-members.test.ts
```

`packages/core/src/index.ts`에서 `export * from "./merge-members";` 줄을 지운다.

`mergeMembers`를 다른 곳에서 쓰지 않는지 확인한다.

Run: `grep -rn "mergeMembers\|linkMembers" --include=*.ts --include=*.tsx apps packages | grep -v node_modules`
Expected: 결과 없음. 남아 있으면 그 자리를 `absorbMember`로 바꾼다 — Task 9에서 UI가 아직 `linkMembersAction`을 부르고 있다면 그건 Task 9에서 함께 고친다. 이 태스크에서는 타입 오류가 남을 수 있으므로 Step 7의 타입체크는 `AccountMappingPanel.tsx`의 오류만 남는 상태를 허용한다.

- [ ] **Step 7: 테스트 통과 확인 후 커밋**

Run: `npx vitest run`
Expected: 전부 통과. `merge-members.test.ts`와 `link-members.test.ts`가 사라지면서 테스트 파일 수가 둘 줄어든다.

```bash
git add -A packages/core/src apps/dashboard/lib/queries/link-candidates.ts apps/dashboard/lib/queries/link-candidates.test.ts apps/dashboard/app/link-accounts/actions.ts apps/dashboard/lib/mutations
git commit -m "feat(link-accounts): suggest link candidates and replace linking with absorb/release"
```

---

### Task 9: `/link-accounts` 화면

**Files:**
- Modify: `apps/dashboard/components/AccountMappingPanel.tsx`
- Modify: `apps/dashboard/app/link-accounts/page.tsx`

**Interfaces:**
- Consumes: `getKakaoAccountsWithCandidates`, `getMembersWithAliases`, `absorbMemberAction`, `releaseMemberAction` (Task 8), `getPendingDiscordAccounts` (기존), `importDiscordMembersAction` (기존).
- Produces: 화면만. 새 export 없음.

- [ ] **Step 1: 페이지가 새 데이터를 넘기게 한다**

`apps/dashboard/app/link-accounts/page.tsx`:

```typescript
import { AppShell } from "@/components/AppShell";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
import { getPendingDiscordAccounts } from "@/lib/queries/pending-accounts";
import { getKakaoAccountsWithCandidates, getMembersWithAliases } from "@/lib/queries/link-candidates";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function LinkAccountsPage() {
  const [discordAccounts, kakaoAccounts, membersWithAliases, currentAdmin] = await Promise.all([
    getPendingDiscordAccounts(),
    getKakaoAccountsWithCandidates(),
    getMembersWithAliases(),
    getCurrentAdmin(),
  ]);

  return (
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
      <div className="px-7 pb-10 pt-6">
        <AccountMappingPanel
          discordAccounts={discordAccounts}
          kakaoAccounts={kakaoAccounts}
          membersWithAliases={membersWithAliases}
          isAdmin={currentAdmin !== null}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: 패널을 후보 기반으로 바꾼다**

`apps/dashboard/components/AccountMappingPanel.tsx`를 수정한다. 기존 구조(3열 그리드, 「디스코드 회원 가져오기」 버튼, 관리자 여부에 따른 편집 차단)는 유지하고, 오른쪽 카톡 목록의 선택 동작과 가운데 열의 내용을 바꾼 뒤 아래에 해제 섹션을 붙인다. Tailwind 클래스는 파일에 이미 쓰이는 색·크기 값을 그대로 재사용한다.

바뀌는 부분의 핵심:

```tsx
import type { KakaoAccountWithCandidates, MemberWithAliases } from "@/lib/queries/link-candidates";
import { absorbMemberAction, releaseMemberAction, importDiscordMembersAction } from "@/app/link-accounts/actions";
```

props와 상태:

```tsx
export function AccountMappingPanel({
  discordAccounts,
  kakaoAccounts,
  membersWithAliases,
  isAdmin,
}: {
  discordAccounts: PendingDiscordAccount[];
  kakaoAccounts: KakaoAccountWithCandidates[];
  membersWithAliases: MemberWithAliases[];
  isAdmin: boolean;
}) {
  const [selectedKakaoId, setSelectedKakaoId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const selectedKakao = kakaoAccounts.find((k) => k.id === selectedKakaoId) ?? null;
```

카톡 항목을 고르면 후보 선택이 초기화되어야 한다:

```tsx
  function selectKakao(id: string) {
    const next = selectedKakaoId === id ? null : id;
    setSelectedKakaoId(next);
    setSelectedCandidateId(null);
    setStatus(null);
  }
```

연결과 해제:

```tsx
  async function handleAbsorb() {
    if (!selectedKakaoId || !selectedCandidateId) return;
    setIsPending(true);
    setStatus(null);
    try {
      const { error } = await absorbMemberAction(selectedKakaoId, selectedCandidateId);
      setStatus(error ?? "연결 완료");
      if (!error) {
        setSelectedKakaoId(null);
        setSelectedCandidateId(null);
      }
    } finally {
      setIsPending(false);
    }
  }

  async function handleRelease(aliasId: string) {
    setIsPending(true);
    setStatus(null);
    try {
      const { error } = await releaseMemberAction(aliasId);
      setStatus(error ?? "연결을 끊었습니다");
    } finally {
      setIsPending(false);
    }
  }
```

가운데 열은 선택한 카톡 계정의 후보 목록을 렌더한다:

```tsx
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] p-4">
          {selectedKakao === null ? (
            <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
              오른쪽에서 카카오톡 계정을 하나 고르세요
            </div>
          ) : selectedKakao.candidates.length === 0 ? (
            <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
              닮은 계정을 찾지 못했습니다. 왼쪽 목록에서 직접 고르세요.
            </div>
          ) : (
            selectedKakao.candidates.map((c) => (
              <button
                key={c.memberId}
                onClick={() => setSelectedCandidateId(selectedCandidateId === c.memberId ? null : c.memberId)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedCandidateId === c.memberId
                    ? "border-[#4472C4] bg-[#4472C4]/[.14]"
                    : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                <span className="text-[12px] font-semibold">
                  {c.displayName || c.handle}
                  {c.isSole && <span className="ml-1.5 text-[10px] text-[#9BD173]">유력</span>}
                </span>
                <span className="font-mono text-[10px] text-[#7A8496]">
                  {c.handle} · {c.reasons.join(" · ")}
                  {c.kind === "linked" && " · 이미 연결된 회원"}
                </span>
              </button>
            ))
          )}
          {isAdmin ? (
            <button
              onClick={handleAbsorb}
              disabled={!selectedKakaoId || !selectedCandidateId || isPending}
              className={`w-full rounded-lg py-2.5 text-[12.5px] font-bold ${
                selectedKakaoId && selectedCandidateId && !isPending
                  ? "cursor-pointer bg-[#4472C4] text-white"
                  : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
              }`}
            >
              ↔ 선택 계정 연결
            </button>
          ) : (
            <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[11.5px] text-[#8A94A6]">
              변경하려면 관리자 로그인이 필요합니다.
            </div>
          )}
          {status && (
            <div className="w-full rounded-lg border border-white/[.06] bg-[#0F131B] p-2.5 text-[10.5px] leading-relaxed text-[#8A94A6]">
              {status}
            </div>
          )}
        </div>
```

왼쪽 디스코드 목록은 참고용 표시로 남긴다 — 후보에 안 뜬 상대를 직접 고를 수 있어야 하므로, 항목을 누르면 `setSelectedCandidateId`가 되도록 `onClick`을 바꾼다.

오른쪽 카톡 목록의 각 항목은 `k.realName`과 `k.kakaoNickname`을 보여주고 `onClick={() => selectKakao(k.id)}`을 부른다(기존의 `nicknameTag` 표시를 `kakaoNickname`으로 바꾼다).

그리드 아래에 해제 섹션을 새로 붙인다:

```tsx
      {membersWithAliases.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
            <span className="text-[12.5px] font-bold">연결된 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{membersWithAliases.length}</span>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {membersWithAliases.map((m) => (
              <div key={m.id} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold">{m.label}</span>
                {m.aliases.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/[.05] bg-[#1A2130] px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-[#8A94A6]">{a.kakaoNickname}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRelease(a.id)}
                        disabled={isPending}
                        className="rounded-md border border-white/[.08] px-2 py-1 text-[10.5px] text-[#C6553F] disabled:cursor-not-allowed disabled:text-[#5C6577]"
                      >
                        끊기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
```

바깥 `<section>`의 클래스에 세로 간격이 이미 있으므로(`flex flex-col gap-3`) 추가 래퍼는 필요 없다.

- [ ] **Step 3: 임포트 요약에 "확인 필요"를 덧붙인다**

`handleImportDiscord`의 성공 문구를 바꾼다.

```tsx
      setImportStatus(
        error ??
          `가져오기 완료 · 신규 ${result!.created}명 · 갱신 ${result!.updated}명 · 봇 제외 ${result!.skippedBots}개`
      );
```

`apps/dashboard/components/KakaoImportForm.tsx`의 결과 요약에서 "신규 회원" 타일 아래에 한 줄을 덧붙인다. 새로 만들어진 회원은 곧 처음 보는 닉네임이고, 관리자가 `/link-accounts`에서 확인해야 할 대상이다.

```tsx
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[10.5px] text-[#7A8496]">신규 회원</div>
            <div className="font-mono text-[18px] font-bold text-[#8FB4F5]">{result.newMembers}</div>
            {result.newMembers > 0 && (
              <div className="mt-1 text-[10px] text-[#C9A227]">계정 연결에서 확인 필요</div>
            )}
          </div>
```

- [ ] **Step 4: 타입체크와 빌드**

Run: `npx tsc --noEmit -p apps/dashboard`
Expected: 오류 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공, 모든 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 5: 전체 스위트 확인 후 커밋**

Run: `npx vitest run`
Expected: 전부 통과.

```bash
git add apps/dashboard/components/AccountMappingPanel.tsx apps/dashboard/app/link-accounts/page.tsx apps/dashboard/app/kakao-import
git commit -m "feat(link-accounts): show ranked link candidates and let admins unlink"
```

---

### Task 10: 로컬 검증과 배포

**Files:** 없음 — 검증과 배포만 한다.

**Interfaces:** 없음.

- [ ] **Step 1: 전체 테스트와 빌드**

Run: `npx vitest run`
Expected: 전부 통과.

Run: `npm run build --workspace=dashboard`
Expected: 성공, 모든 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 2: 개발 DB에 마이그레이션이 적용됐는지 확인**

Run: `docker exec -i dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin -c "\d \"Member\"" | grep -i "mergedIntoId\|discordDisplayName"`
Expected: 두 컬럼이 보인다.

- [ ] **Step 3: 로컬 화면에서 확인**

Run: `DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin" npm run dev --workspace=dashboard`

`/link-accounts`에서 확인한다: 「디스코드 회원 가져오기」를 누르면 회원이 들어오는지, 카톡 계정을 고르면 후보가 점수순으로 뜨고 `유력` 표시와 근거(`실명일치 · 게임닉일치`)가 보이는지, 연결하면 카톡 항목이 목록에서 사라지고 「연결된 계정」에 별칭으로 나타나는지, 「끊기」를 누르면 다시 미연결 목록으로 돌아오는지.

`/members`에서 확인한다: 흡수된 행이 목록에 안 보이는지, 회원 수가 그만큼 줄었는지.

확인 후 개발 서버를 종료한다.

- [ ] **Step 4: 서버에 배포**

먼저 프로덕션 DB를 백업한다 — 마이그레이션은 되돌리기 어렵다.

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U lolpamin -d lolpamin -Fc > ~/lolpamin-before-merge-column-$(date +%F-%H%M%S).dump'
```

리포 루트에서 (`OCI_*` 값은 `.env`에 있다):

```bash
git archive HEAD | ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'tar x -C ~/lolpamin'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml build dashboard'
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml up -d'
```

이 서버는 `ubuntu` 계정이 docker 그룹에 없어 모든 docker 명령에 `sudo`가 필요하다. 빌드는 vCPU 1개라 수 분 걸린다.

- [ ] **Step 5: 프로덕션 DB에 마이그레이션 적용**

```bash
ssh -i "D:/GitHub/lolpamin/ssh-key-2026-07-09.key" -p 22 ubuntu@168.107.53.72 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml exec -T dashboard npx prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma'
```

Expected: `All migrations have been successfully applied.`

경로가 맞지 않으면 컨테이너 안에서 `find / -name schema.prisma -not -path "*/node_modules/*"`로 확인한 뒤 그 경로를 쓴다.

- [ ] **Step 6: 배포된 화면 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "http://168.107.53.72:3200/link-accounts"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "http://168.107.53.72:3200/members?sort=realName&dir=asc"
```

Expected: 둘 다 `200`.

브라우저에서 `http://168.107.53.72:3200/link-accounts`에 로그인해 가져오기 → 후보 확인 → 연결 → 끊기를 한 번씩 해본다.
