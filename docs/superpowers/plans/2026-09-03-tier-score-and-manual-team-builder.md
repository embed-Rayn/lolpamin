# 티어 점수와 수동 팀짜기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원마다 솔로랭크 티어를 저장하고 참조표로 점수를 매겨, 「내전 관리」 2.3의 새 화면에서 TOP/JG/MID/AD/SUP 다섯 자리에 양 팀을 앉히고 팀별 점수 합계를 보며 손으로 균형을 맞춘다.

**Architecture:** 티어는 `Member.tier` enum 한 칸에 저장하고 점수는 저장하지 않는다 — `packages/core`의 순수 참조표에서 매번 계산한다. 티어와 Riot ID를 고치는 셀 컴포넌트 두 개를 만들어 회원 대시보드(1.1)와 팀짜기(2.3)가 같은 것을 쓴다. 팀 구성 자체는 어디에도 저장하지 않고 브라우저 상태로만 존재한다.

**Tech Stack:** Prisma 5 / PostgreSQL 16, Next.js 14 App Router (서버 액션), vitest (core는 순수 단위, dashboard는 실제 Postgres 테스트 DB), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-03-tier-score-and-manual-team-builder-design.md`

## Global Constraints

- **UI 문구·라벨은 한글, 코드·식별자·주석·커밋 메시지는 영어.** (프로젝트 규약)
- **대화 응답은 한글.**
- **도메인 로직은 `packages/core`에 순수 함수 + 단위 테스트로.** DB를 건드리는 로직은 `apps/dashboard/lib/{queries,mutations}/`에 두고 `prisma`를 첫 인자로 받는다(테스트가 테스트 클라이언트를 주입할 수 있도록).
- **DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다.** 가드가 없으면 Prisma가 조용히 `DATABASE_URL`로 떨어져 `resetDatabase()`가 개발 데이터를 지운다.
- **모든 뮤테이션 서버 액션은 데이터에 손대기 전에 `await requireAdmin()`을 호출한다.** `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 강제한다.
- **DB를 읽는 페이지는 `export const dynamic = "force-dynamic"`을 선언한다.** `AppShell` 자체가 사이드바 배지 때문에 DB를 읽으므로 모든 페이지에 해당한다.
- **티어 점수표는 스펙의 값 그대로다:**

  ```
  마스터 1000+ 30   마스터 800~1000 29   마스터 600~800 28
  마스터 400~600 27  마스터 200~400 26    마스터 0~200 25
  다1 24  다2 23  다3 22  다4 21      에1 20  에2 19  에3 18  에4 17
  플1 16  플2 15  플3 14  플4 13      골1 12  골2 11  골3 10  골4  9
  실1  8  실2  7  실3  6  실4  5      브1  4  브2  3  브3  2  브4  1
  아이언 0   언랭 0
  ```

- **점수가 0인 회원은 화면의 점수 칸을 빈칸으로 둔다.** 0을 찍으면 "0점짜리 실력"으로 읽히지만 실제 의미는 "점수를 매기지 않는 구간"이다.
- **티어 점수는 MMR과 섞지 않는다.** 두 값은 독립이다.

## 스펙과 달라지는 점 (의도된 것)

구현하며 스펙보다 좁히거나 다르게 잡은 곳. 실행자는 이대로 만들면 된다.

1. **티어 셀은 「클릭하면 열리는」 편집기가 아니라 항상 보이는 `<select>`다.** 네이티브
   `<select>`는 그 자체가 한 번의 클릭으로 열린다. 실명 셀처럼 「보기 → 클릭 → 편집기」
   두 단계를 만들면 클릭이 하나 더 늘 뿐이다.
2. **티어·Riot ID 저장 후 `/inactive`는 revalidate하지 않는다.** 스펙에 적혀 있지만
   미활동 리포트는 티어도 Riot ID도 보여주지 않는다. `/members`와 `/team-builder`만 갱신한다.
3. **팀짜기의 각 칸은 두 줄이다** — 위는 회원을 고르는 `<select>`(표시 이름), 아래는
   그 회원의 Riot ID(운영진이면 편집 가능). 한 칸에 「고르기」와 「고치기」를 동시에
   넣을 수 없어서다. 예시 표의 Riot ID 열은 아래 줄에 그대로 나타난다.
4. **`MemberRow.riotId`와 `LinkedMemberOption.riotId`는 `string | null`이다.** 기존
   `MemberRow`의 다른 문자열 칸들이 쓰는 `"-"` 센티넬을 따르지 않는다. 새 필드에까지
   센티넬을 늘릴 이유가 없고, 화면에서 `?? "-"` 한 번이면 같은 결과다.

---

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `packages/db/prisma/migrations/<ts>_add_member_tier/migration.sql` | enum·컬럼 생성 (Prisma가 만든다) |
| `packages/core/src/tier.ts` | 티어 → 점수·라벨·드롭다운 항목 (순수) |
| `packages/core/src/tier.test.ts` | 위의 단위 테스트 |
| `apps/dashboard/lib/mutations/update-member-tier.ts` | 티어 저장 |
| `apps/dashboard/lib/mutations/update-member-tier.test.ts` | 통합 테스트 |
| `apps/dashboard/lib/mutations/update-member-riot-id.ts` | Riot ID 저장 |
| `apps/dashboard/lib/mutations/update-member-riot-id.test.ts` | 통합 테스트 |
| `apps/dashboard/components/MemberTierCell.tsx` | 티어 드롭다운 셀 (두 화면 공용) |
| `apps/dashboard/components/MemberRiotIdCell.tsx` | Riot ID 텍스트 셀 (두 화면 공용) |
| `apps/dashboard/app/team-builder/page.tsx` | 2.3 서버 컴포넌트 |
| `apps/dashboard/components/TeamBuilder.tsx` | 팀짜기 표 (클라이언트) |

**수정**

| 파일 | 무엇을 |
|---|---|
| `packages/db/prisma/schema.prisma` | `enum MemberTier` + `Member.tier` |
| `packages/core/package.json` | `@lolpamin/db` 의존 추가 |
| `packages/core/src/index.ts` | `./tier` 재수출 |
| `apps/dashboard/app/members/actions.ts` | 서버 액션 두 개 |
| `apps/dashboard/lib/queries/members.ts` | `MemberRow`에 `tier`·`riotId`, `MemberSort`에 `"tier"`, 점수 순 정렬 |
| `apps/dashboard/lib/queries/members.test.ts` | 티어 정렬 테스트 |
| `apps/dashboard/components/MemberTable.tsx` | 두 칸 추가, 그리드 8칸, 티어 정렬 링크 |
| `apps/dashboard/lib/queries/linked-members.ts` | `LinkedMemberOption`에 `tier`·`riotId` |
| `apps/dashboard/lib/queries/linked-members.test.ts` | 두 필드 테스트 |
| `apps/dashboard/components/AppShell.tsx` | `activeNav`에 `"team-builder"`, 내전 관리 그룹에 항목 |

---

## Task 1: 티어 enum과 점수표

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/tier.ts`
- Test: `packages/core/src/tier.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - Prisma enum `MemberTier` — 32개 값, 점수 내림차순 선언
  - `Member.tier: MemberTier @default(UNRANKED)`
  - `TIER_SCORES: Record<MemberTier, number>`
  - `TIER_LABELS: Record<MemberTier, string>`
  - `tierScore(tier: MemberTier): number`
  - `tierLabel(tier: MemberTier): string`
  - `interface TierOption { value: MemberTier; label: string; score: number }`
  - `TIER_OPTIONS: readonly TierOption[]` — 점수 내림차순 32개

- [ ] **Step 1: 스키마에 enum과 컬럼을 추가한다**

`packages/db/prisma/schema.prisma`의 `enum Team { ... }` 블록 **다음에** 붙인다:

```prisma
// 솔로랭크 티어. 마스터 위쪽은 티어 이름이 아니라 LP 구간으로 자른다 — 그랜드마스터와
// 챌린저는 별도 티어가 아니라 마스터 LP의 상위 구간이라, LP로 자르면 자동으로 덮인다.
// 선언 순서는 점수 내림차순이다(packages/core/src/tier.ts의 TIER_SCORES와 같은 순서).
// 아이언을 1~4로 쪼개지 않는 것은 전부 0점이라서다.
enum MemberTier {
  MASTER_1000_PLUS
  MASTER_800_1000
  MASTER_600_800
  MASTER_400_600
  MASTER_200_400
  MASTER_0_200
  DIAMOND_1
  DIAMOND_2
  DIAMOND_3
  DIAMOND_4
  EMERALD_1
  EMERALD_2
  EMERALD_3
  EMERALD_4
  PLATINUM_1
  PLATINUM_2
  PLATINUM_3
  PLATINUM_4
  GOLD_1
  GOLD_2
  GOLD_3
  GOLD_4
  SILVER_1
  SILVER_2
  SILVER_3
  SILVER_4
  BRONZE_1
  BRONZE_2
  BRONZE_3
  BRONZE_4
  IRON
  UNRANKED
}
```

그리고 `model Member`의 `riotId String?` 줄 **다음에** 한 줄을 더한다:

```prisma
  // 「티어를 모른다」와 「언랭이다」는 점수가 0으로 같고 화면 문구도 같다. nullable로
  // 두면 아무것도 얻지 못하면서 null 분기만 늘어난다.
  tier               MemberTier @default(UNRANKED)
```

- [ ] **Step 2: 마이그레이션을 만들고 클라이언트를 다시 생성한다**

Docker Desktop이 PATH에 없다. Postgres(호스트 5434)가 떠 있지 않으면 PowerShell에서
`$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"` 후
`docker compose up -d`로 먼저 띄운다.

```bash
npm run migrate --workspace=@lolpamin/db -- --name add_member_tier
npm run generate --workspace=@lolpamin/db
```

기대: `packages/db/prisma/migrations/<타임스탬프>_add_member_tier/migration.sql`이 생기고
`CREATE TYPE "MemberTier"`와 `ALTER TABLE "Member" ADD COLUMN "tier" "MemberTier" NOT NULL DEFAULT 'UNRANKED'`가 들어 있다.

- [ ] **Step 3: 테스트 DB에도 같은 마이그레이션을 적용한다**

`prisma migrate dev`는 `packages/db/.env`의 `DATABASE_URL`(개발 DB)에만 적용된다.
통합 테스트가 쓰는 `DATABASE_URL_TEST` 쪽에도 넣어야 뒤 태스크가 통과한다. Prisma의
dotenv는 이미 설정된 프로세스 환경변수를 덮어쓰지 않으므로 아래처럼 덮어쓰면 된다
(PowerShell, 저장소 루트 `.env`의 `DATABASE_URL_TEST` 값을 그대로 넣는다):

```powershell
cd packages/db
$env:DATABASE_URL = "<루트 .env의 DATABASE_URL_TEST 값>"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
cd ../..
```

기대: `Applied 1 migration` 또는 `No pending migrations`.

- [ ] **Step 4: core가 db 타입을 볼 수 있게 한다**

`packages/core/package.json`에 `dependencies`를 더한다. `devDependencies` **앞에** 넣는다:

```json
  "dependencies": {
    "@lolpamin/db": "*"
  },
```

그리고 워크스페이스 심볼릭 링크를 만든다:

```bash
npm install
```

`packages/core`는 `MemberTier`를 `import type`으로만 가져오므로 런타임 의존은 생기지 않는다
(타입 임포트는 컴파일에서 지워진다). 값이 같은 티어 목록을 두 군데 적어놓고 어긋나지
않기를 바라는 대신, 한 곳에서 가져와 컴파일러가 대조하게 하려는 것이다.

- [ ] **Step 5: 실패하는 테스트를 쓴다**

`packages/core/src/tier.test.ts`:

```ts
import type { MemberTier } from "@lolpamin/db";
import { describe, expect, it } from "vitest";
import { TIER_OPTIONS, TIER_SCORES, tierLabel, tierScore } from "./tier";

// 다1(24)부터 브4(1)까지 24칸이 1점 간격이어야 한다. 표를 옮겨 적다 한 칸을 빠뜨리거나
// 두 칸에 같은 점수를 주면 여기서 잡힌다.
const LADDER: MemberTier[] = [
  "DIAMOND_1", "DIAMOND_2", "DIAMOND_3", "DIAMOND_4",
  "EMERALD_1", "EMERALD_2", "EMERALD_3", "EMERALD_4",
  "PLATINUM_1", "PLATINUM_2", "PLATINUM_3", "PLATINUM_4",
  "GOLD_1", "GOLD_2", "GOLD_3", "GOLD_4",
  "SILVER_1", "SILVER_2", "SILVER_3", "SILVER_4",
  "BRONZE_1", "BRONZE_2", "BRONZE_3", "BRONZE_4",
];

describe("tierScore", () => {
  it("runs from diamond 1 down to bronze 4 one point at a time", () => {
    expect(LADDER.map(tierScore)).toEqual([
      24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13,
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it("stacks the master LP bands above diamond 1", () => {
    expect(tierScore("MASTER_0_200")).toBe(25);
    expect(tierScore("MASTER_200_400")).toBe(26);
    expect(tierScore("MASTER_400_600")).toBe(27);
    expect(tierScore("MASTER_600_800")).toBe(28);
    expect(tierScore("MASTER_800_1000")).toBe(29);
    expect(tierScore("MASTER_1000_PLUS")).toBe(30);
  });

  it("scores iron and unranked at zero", () => {
    expect(tierScore("IRON")).toBe(0);
    expect(tierScore("UNRANKED")).toBe(0);
  });
});

describe("tierLabel", () => {
  it("names the divisions the way the group writes them", () => {
    expect(tierLabel("DIAMOND_1")).toBe("다1");
    expect(tierLabel("EMERALD_2")).toBe("에2");
    expect(tierLabel("GOLD_4")).toBe("골4");
    expect(tierLabel("MASTER_400_600")).toBe("마스터 400~600");
    expect(tierLabel("MASTER_1000_PLUS")).toBe("마스터 1000+");
    expect(tierLabel("UNRANKED")).toBe("언랭");
  });
});

describe("TIER_OPTIONS", () => {
  it("carries every tier exactly once", () => {
    expect(TIER_OPTIONS).toHaveLength(32);
    expect([...TIER_OPTIONS.map((o) => o.value)].sort()).toEqual(
      (Object.keys(TIER_SCORES) as MemberTier[]).sort(),
    );
  });

  it("runs from the highest score to the lowest", () => {
    const scores = TIER_OPTIONS.map((o) => o.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(30);
    expect(scores[scores.length - 1]).toBe(0);
  });

  it("labels every tier", () => {
    for (const option of TIER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.score).toBe(tierScore(option.value));
    }
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
cd packages/core && npx vitest run src/tier.test.ts
```
기대: FAIL — `Failed to resolve import "./tier"`.

- [ ] **Step 7: 점수표를 구현한다**

`packages/core/src/tier.ts`:

```ts
import type { MemberTier } from "@lolpamin/db";

// 스펙(2026-09-03-tier-score-and-manual-team-builder-design.md)의 참조표 그대로다.
// 선언 순서가 점수 내림차순이고, TIER_OPTIONS가 이 순서를 그대로 쓴다.
//
// 점수를 DB에 저장하지 않고 여기서 매번 계산하는 이유: 저장하면 이 표를 고쳤을 때 이미
// 저장된 값이 옛 표에 묶인다.
export const TIER_SCORES: Record<MemberTier, number> = {
  MASTER_1000_PLUS: 30,
  MASTER_800_1000: 29,
  MASTER_600_800: 28,
  MASTER_400_600: 27,
  MASTER_200_400: 26,
  MASTER_0_200: 25,
  DIAMOND_1: 24,
  DIAMOND_2: 23,
  DIAMOND_3: 22,
  DIAMOND_4: 21,
  EMERALD_1: 20,
  EMERALD_2: 19,
  EMERALD_3: 18,
  EMERALD_4: 17,
  PLATINUM_1: 16,
  PLATINUM_2: 15,
  PLATINUM_3: 14,
  PLATINUM_4: 13,
  GOLD_1: 12,
  GOLD_2: 11,
  GOLD_3: 10,
  GOLD_4: 9,
  SILVER_1: 8,
  SILVER_2: 7,
  SILVER_3: 6,
  SILVER_4: 5,
  BRONZE_1: 4,
  BRONZE_2: 3,
  BRONZE_3: 2,
  BRONZE_4: 1,
  // 브4가 1점이므로 그 아래는 구분하지 않는다.
  IRON: 0,
  UNRANKED: 0,
};

// 모임이 실제로 쓰는 표기다 — "다1", "에2". 마스터 구간은 LP 범위를 그대로 읽는다.
export const TIER_LABELS: Record<MemberTier, string> = {
  MASTER_1000_PLUS: "마스터 1000+",
  MASTER_800_1000: "마스터 800~1000",
  MASTER_600_800: "마스터 600~800",
  MASTER_400_600: "마스터 400~600",
  MASTER_200_400: "마스터 200~400",
  MASTER_0_200: "마스터 0~200",
  DIAMOND_1: "다1",
  DIAMOND_2: "다2",
  DIAMOND_3: "다3",
  DIAMOND_4: "다4",
  EMERALD_1: "에1",
  EMERALD_2: "에2",
  EMERALD_3: "에3",
  EMERALD_4: "에4",
  PLATINUM_1: "플1",
  PLATINUM_2: "플2",
  PLATINUM_3: "플3",
  PLATINUM_4: "플4",
  GOLD_1: "골1",
  GOLD_2: "골2",
  GOLD_3: "골3",
  GOLD_4: "골4",
  SILVER_1: "실1",
  SILVER_2: "실2",
  SILVER_3: "실3",
  SILVER_4: "실4",
  BRONZE_1: "브1",
  BRONZE_2: "브2",
  BRONZE_3: "브3",
  BRONZE_4: "브4",
  IRON: "아이언",
  UNRANKED: "언랭",
};

export function tierScore(tier: MemberTier): number {
  return TIER_SCORES[tier];
}

export function tierLabel(tier: MemberTier): string {
  return TIER_LABELS[tier];
}

export interface TierOption {
  value: MemberTier;
  label: string;
  score: number;
}

// 드롭다운 항목. TIER_SCORES의 키 순서(= 점수 내림차순)를 그대로 쓴다 — 자바스크립트
// 객체는 문자열 키의 삽입 순서를 보존하므로 따로 정렬할 필요가 없다.
export const TIER_OPTIONS: readonly TierOption[] = (Object.keys(TIER_SCORES) as MemberTier[]).map(
  (value) => ({ value, label: TIER_LABELS[value], score: TIER_SCORES[value] }),
);
```

- [ ] **Step 8: 재수출한다**

`packages/core/src/index.ts` 맨 끝에 한 줄을 더한다:

```ts
export * from "./tier";
```

- [ ] **Step 9: 통과를 확인한다**

```bash
cd packages/core && npx vitest run src/tier.test.ts
```
기대: 7 passed.

- [ ] **Step 10: 커밋한다**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/core/package.json packages/core/src/tier.ts packages/core/src/tier.test.ts packages/core/src/index.ts package-lock.json
git commit -m "feat(tier): add the solo queue tier column and its score table"
```

---

## Task 2: 티어·Riot ID 저장

**Files:**
- Create: `apps/dashboard/lib/mutations/update-member-tier.ts`
- Create: `apps/dashboard/lib/mutations/update-member-riot-id.ts`
- Modify: `apps/dashboard/app/members/actions.ts`
- Test: `apps/dashboard/lib/mutations/update-member-tier.test.ts`, `apps/dashboard/lib/mutations/update-member-riot-id.test.ts`

**Interfaces:**
- Consumes: `MemberTier` (Task 1), `TIER_SCORES` (Task 1, 액션의 값 검사용)
- Produces:
  - `updateMemberTier(prisma: PrismaClient, memberId: string, tier: MemberTier): Promise<void>`
  - `updateMemberRiotId(prisma: PrismaClient, memberId: string, riotId: string): Promise<void>`
  - `updateMemberTierAction(memberId: string, tier: MemberTier): Promise<{ error: string | null }>`
  - `updateMemberRiotIdAction(memberId: string, riotId: string): Promise<{ error: string | null }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/mutations/update-member-tier.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberTier } from "./update-member-tier";

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

describe("updateMemberTier", () => {
  it("starts every member at unranked", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });
    expect(member.tier).toBe("UNRANKED");
  });

  it("stores the chosen tier", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberTier(prisma, member.id, "EMERALD_2");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tier).toBe("EMERALD_2");
  });

  it("can be moved back down to unranked", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", tier: "DIAMOND_1" },
    });

    await updateMemberTier(prisma, member.id, "UNRANKED");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tier).toBe("UNRANKED");
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberTier(prisma, "00000000-0000-0000-0000-000000000000", "GOLD_3"),
    ).rejects.toThrow();
  });
});
```

`apps/dashboard/lib/mutations/update-member-riot-id.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { updateMemberRiotId } from "./update-member-riot-id";

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

describe("updateMemberRiotId", () => {
  it("stores the trimmed value", async () => {
    const member = await prisma.member.create({ data: { kakaoNickname: "유대혁/95/유대혁#KR1" } });

    await updateMemberRiotId(prisma, member.id, "  늑 구#1003  ");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBe("늑 구#1003");
  });

  it("keeps spaces and hangul inside the id", async () => {
    // 실제 값이 이렇게 생겼다. 형식 검증을 하지 않는 이유이기도 하다.
    const member = await prisma.member.create({ data: { kakaoNickname: "주디/97/judy#KR1" } });

    await updateMemberRiotId(prisma, member.id, "주디#주토피아");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBe("주디#주토피아");
  });

  it("clears the value when given only whitespace", async () => {
    const member = await prisma.member.create({
      data: { kakaoNickname: "유대혁/95/유대혁#KR1", riotId: "늑 구#1003" },
    });

    await updateMemberRiotId(prisma, member.id, "   ");

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.riotId).toBeNull();
  });

  it("throws when the member does not exist", async () => {
    await expect(
      updateMemberRiotId(prisma, "00000000-0000-0000-0000-000000000000", "늑 구#1003"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/update-member-tier.test.ts lib/mutations/update-member-riot-id.test.ts
```
기대: FAIL — 두 파일 모두 `Failed to resolve import`.

- [ ] **Step 3: 두 뮤테이션을 구현한다**

`apps/dashboard/lib/mutations/update-member-tier.ts`:

```ts
import type { MemberTier, PrismaClient } from "@lolpamin/db";

/** 회원의 솔로랭크 티어를 저장한다. 점수는 저장하지 않는다 — 티어에서 계산한다. */
export async function updateMemberTier(
  prisma: PrismaClient,
  memberId: string,
  tier: MemberTier,
): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { tier } });
}
```

`apps/dashboard/lib/mutations/update-member-riot-id.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";

/**
 * 회원의 Riot ID를 저장한다. 빈 값은 null로 지운다 — updateMemberRealName과 같은 방침이다.
 *
 * 형식 검증은 하지 않는다. 실제 값이 "늑 구#1003", "주디#주토피아"처럼 공백과 한글을
 * 담고 있고, 라이엇의 실제 규칙보다 우리가 아는 규칙이 좁을 위험이 더 크다.
 */
export async function updateMemberRiotId(
  prisma: PrismaClient,
  memberId: string,
  riotId: string,
): Promise<void> {
  const trimmed = riotId.trim();
  await prisma.member.update({
    where: { id: memberId },
    data: { riotId: trimmed.length > 0 ? trimmed : null },
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/mutations/update-member-tier.test.ts lib/mutations/update-member-riot-id.test.ts
```
기대: 8 passed.

- [ ] **Step 5: 서버 액션 두 개를 더한다**

`apps/dashboard/app/members/actions.ts`의 import 블록에 세 줄을 더한다:

```ts
import type { MemberTier } from "@lolpamin/db";
import { TIER_SCORES } from "@lolpamin/core";
import { updateMemberTier } from "@/lib/mutations/update-member-tier";
import { updateMemberRiotId } from "@/lib/mutations/update-member-riot-id";
```

그리고 파일 맨 끝에 붙인다:

```ts
export async function updateMemberTierAction(
  memberId: string,
  tier: MemberTier,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // 클라이언트가 보낸 문자열이므로 enum 값인지 여기서 확인한다. Prisma도 거부하지만
  // 그쪽 예외는 영어 스택이 섞인 긴 문자열이라 관리자 화면에 띄울 것이 못 된다.
  if (!(tier in TIER_SCORES)) {
    return { error: "알 수 없는 티어입니다." };
  }

  try {
    await updateMemberTier(prisma, memberId, tier);
  } catch {
    return { error: "티어를 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/team-builder");
  return { error: null };
}

export async function updateMemberRiotIdAction(
  memberId: string,
  riotId: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await updateMemberRiotId(prisma, memberId, riotId);
  } catch {
    return { error: "Riot ID를 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/team-builder");
  return { error: null };
}
```

- [ ] **Step 6: 전체 대시보드 테스트를 돌린다**

```bash
npm run test --workspace=dashboard
```
기대: 전부 PASS. `action-guards.test.ts`가 새 액션 두 개도 `requireAdmin()`으로 시작하는지 검사하고 통과해야 한다.

- [ ] **Step 7: 커밋한다**

```bash
git add apps/dashboard/lib/mutations/update-member-tier.ts apps/dashboard/lib/mutations/update-member-tier.test.ts apps/dashboard/lib/mutations/update-member-riot-id.ts apps/dashboard/lib/mutations/update-member-riot-id.test.ts apps/dashboard/app/members/actions.ts
git commit -m "feat(tier): let an admin save a member's tier and riot id"
```

---

## Task 3: 티어·Riot ID 편집 셀

**Files:**
- Create: `apps/dashboard/components/MemberTierCell.tsx`
- Create: `apps/dashboard/components/MemberRiotIdCell.tsx`

**Interfaces:**
- Consumes: `TIER_OPTIONS`, `tierLabel`, `tierScore` (Task 1), `updateMemberTierAction`, `updateMemberRiotIdAction` (Task 2)
- Produces:
  - `MemberTierCell({ memberId, tier, isAdmin }: { memberId: string; tier: MemberTier; isAdmin: boolean })`
  - `MemberRiotIdCell({ memberId, riotId, isAdmin }: { memberId: string; riotId: string | null; isAdmin: boolean })`

두 컴포넌트 모두 회원 대시보드(1.1)와 팀짜기(2.3)에서 같이 쓴다.

- [ ] **Step 1: 티어 셀을 만든다**

`apps/dashboard/components/MemberTierCell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberTier } from "@lolpamin/db";
import { TIER_OPTIONS, tierLabel, tierScore } from "@lolpamin/core";
import { updateMemberTierAction } from "@/app/members/actions";

export function MemberTierCell({
  memberId,
  tier,
  isAdmin,
}: {
  memberId: string;
  tier: MemberTier;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 점수 0(아이언·언랭)은 "점수를 매기지 않는 구간"이라 흐리게 둔다.
  const muted = tierScore(tier) === 0;

  if (!isAdmin) {
    return <div className={`truncate ${muted ? "text-[#5C6577]" : "text-[#C7D0DF]"}`}>{tierLabel(tier)}</div>;
  }

  function save(next: MemberTier) {
    if (next === tier) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberTierAction(memberId, next);
      setError(actionError);
      router.refresh();
    });
  }

  // 실명 셀과 달리 "클릭해서 편집기 열기" 단계를 두지 않는다. 네이티브 select는 그
  // 자체가 한 번의 클릭으로 열리므로, 단계를 하나 더 두면 클릭만 늘어난다.
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={tier}
        disabled={isPending}
        onChange={(e) => save(e.target.value as MemberTier)}
        title="티어 수정"
        className={`w-full min-w-0 cursor-pointer rounded-md border border-white/[.09] bg-[#0F131B] px-1.5 py-1 text-[13.5px] outline-none focus:border-[#4472C4] disabled:opacity-40 ${
          muted ? "text-[#5C6577]" : "text-[#E6EAF2]"
        }`}
      >
        {TIER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="flex-none text-[12px] text-[#EE8B8B]">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Riot ID 셀을 만든다**

`MemberRealNameCell`의 클릭 편집 패턴을 그대로 따른다 — 편집을 열 때 현재 prop에서 값을
다시 잡고, 값이 그대로면 저장하지 않는다.

`apps/dashboard/components/MemberRiotIdCell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRiotIdAction } from "@/app/members/actions";

export function MemberRiotIdCell({
  memberId,
  riotId,
  isAdmin,
}: {
  memberId: string;
  riotId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(riotId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = riotId ?? "-";

  if (!isAdmin) {
    return (
      <div className={`truncate font-mono text-[13.5px] ${riotId === null ? "text-[#5C6577]" : "text-[#9BD173]"}`}>
        {label}
      </div>
    );
  }

  function save() {
    setIsEditing(false);
    if (value === (riotId ?? "")) {
      // 값이 바뀌지 않았다 — 편집만 종료한다. 셀을 열었다 닫기만 해도 마운트 당시의
      // stale 값이 최신 값을 덮어쓰는 걸 막는다.
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberRiotIdAction(memberId, value);
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
            setValue(riotId ?? "");
            setIsEditing(false);
          }
        }}
        placeholder="이름#태그"
        className="w-full rounded-md border border-[#4472C4]/50 bg-[#0F131B] px-1.5 py-1 font-mono text-[13.5px] text-[#E6EAF2] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        // 편집을 시작할 때마다 현재 prop에서 값을 다시 잡는다. 편집을 열어 둔 사이에
        // 다른 관리자가 값을 바꿨다면 그쪽이 최신이다.
        setValue(riotId ?? "");
        setIsEditing(true);
      }}
      title="클릭해서 Riot ID 수정"
      disabled={isPending}
      className={`truncate text-left font-mono text-[13.5px] hover:underline ${
        riotId === null ? "text-[#5C6577]" : "text-[#9BD173]"
      }`}
    >
      {isPending ? "저장 중..." : label}
      {error && <span className="ml-1 text-[12px] text-[#EE8B8B]">{error}</span>}
    </button>
  );
}
```

- [ ] **Step 3: 타입이 맞는지 확인한다**

두 컴포넌트는 아직 어디에서도 쓰이지 않으므로 화면으로 확인할 수 없다. 타입만 본다:

```bash
npm run build --workspace=dashboard
```
기대: 성공. (`next build`가 타입체크를 겸한다 — 별도 lint 단계는 없다.)

- [ ] **Step 4: 커밋한다**

```bash
git add apps/dashboard/components/MemberTierCell.tsx apps/dashboard/components/MemberRiotIdCell.tsx
git commit -m "feat(tier): add the shared tier and riot id editing cells"
```

---

## Task 4: 회원 대시보드에 두 칸을 붙인다

**Files:**
- Modify: `apps/dashboard/lib/queries/members.ts`
- Modify: `apps/dashboard/components/MemberTable.tsx`
- Test: `apps/dashboard/lib/queries/members.test.ts`

**Interfaces:**
- Consumes: `tierScore` (Task 1), `MemberTierCell`, `MemberRiotIdCell` (Task 3)
- Produces:
  - `MemberRow`에 `tier: MemberTier`, `riotId: string | null`
  - `MemberSort = "mmr" | "realName" | "kakaoNickname" | "tier"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/queries/members.test.ts`의 맨 끝에 붙인다:

```ts
describe("tier and riot id", () => {
  it("carries both onto the row", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({
      data: { realName: "유대혁", kakaoNickname: "유대혁/95/유대혁#KR1", tier: "EMERALD_2", riotId: "늑 구#1003" },
    });

    const { rows } = await getMemberListData("all", "");

    expect(rows[0].tier).toBe("EMERALD_2");
    expect(rows[0].riotId).toBe("늑 구#1003");
  });

  it("defaults to unranked with no riot id", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({ data: { realName: "박시형", kakaoNickname: "박시형/97/시형#KR1" } });

    const { rows } = await getMemberListData("all", "");

    expect(rows[0].tier).toBe("UNRANKED");
    expect(rows[0].riotId).toBeNull();
  });

  it("sorts by score, not by the order the enum happens to be declared in", async () => {
    await resetDatabase(prisma);
    await prisma.member.create({ data: { realName: "골드", kakaoNickname: "골드/95/g#1", tier: "GOLD_3" } });
    await prisma.member.create({ data: { realName: "마스터", kakaoNickname: "마스터/95/m#1", tier: "MASTER_400_600" } });
    await prisma.member.create({ data: { realName: "언랭", kakaoNickname: "언랭/95/u#1" } });

    const desc = await getMemberListData("all", "", "tier", "desc");
    expect(desc.rows.map((r) => r.realName)).toEqual(["마스터", "골드", "언랭"]);

    const asc = await getMemberListData("all", "", "tier", "asc");
    expect(asc.rows.map((r) => r.realName)).toEqual(["언랭", "골드", "마스터"]);
  });

  it("accepts tier as a sort key", () => {
    expect(parseMemberSort("tier")).toBe("tier");
  });
});
```

이 파일은 `beforeEach`에서 회원 셋을 미리 만들어 두므로, 정렬을 확인하는 테스트는 자기
데이터만 남기려고 `resetDatabase`를 다시 부른다.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/members.test.ts
```
기대: 새 네 테스트가 FAIL (`rows[0].tier`가 undefined, `parseMemberSort("tier")`가 `"mmr"`).

- [ ] **Step 3: 질의를 고친다**

`apps/dashboard/lib/queries/members.ts` 맨 위 import에 두 줄을 더한다:

```ts
import type { Member, MemberTier, Prisma } from "@lolpamin/db";
import { tierScore } from "@lolpamin/core";
```

(기존 `import type { Member, Prisma } from "@lolpamin/db";`를 위 첫 줄로 바꾸는 것이다.)

`MemberSort` 선언 두 곳을 고친다:

```ts
export type MemberSort = "mmr" | "realName" | "kakaoNickname" | "tier";
export type SortDirection = "asc" | "desc";

const MEMBER_SORTS: MemberSort[] = ["mmr", "realName", "kakaoNickname", "tier"];
```

`orderByFor`에 티어 갈래를 더한다:

```ts
function orderByFor(sort: MemberSort, dir: SortDirection): Prisma.MemberOrderByWithRelationInput[] {
  if (sort === "mmr") return [{ mmr: dir }, { id: "asc" }];
  if (sort === "realName") return [{ realName: { sort: dir, nulls: "last" } }, { id: "asc" }];
  // 티어는 점수 순으로 정렬해야 하는데 Postgres는 enum을 선언 순서로 정렬한다. 지금은
  // 두 순서가 우연히 같지만 그 우연에 기대면 enum 순서를 바꾸는 순간 정렬이 조용히
  // 틀어진다. 여기서는 순서를 고정만 하고, 실제 정렬은 조회 뒤 sortByTierScore가 한다.
  if (sort === "tier") return [{ id: "asc" }];
  return [{ kakaoNickname: { sort: dir, nulls: "last" } }, { id: "asc" }];
}

function sortByTierScore(rows: MemberRow[], dir: SortDirection): MemberRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const byScore = (tierScore(a.tier) - tierScore(b.tier)) * sign;
    // 동점(아이언·언랭, 그리고 같은 티어)일 때 순서를 고정한다 — 다른 정렬 기준들이
    // id를 2차 키로 쓰는 것과 같다.
    return byScore !== 0 ? byScore : a.id.localeCompare(b.id);
  });
}
```

`MemberRow`에 두 필드를 더한다 (`mmr: number;` 줄 다음):

```ts
  tier: MemberTier;
  riotId: string | null;
```

`toRow`의 반환 객체에 두 줄을 더한다 (`mmr: m.mmr,` 다음):

```ts
    tier: m.tier,
    riotId: m.riotId,
```

`getMemberListData`의 마지막 두 줄을 바꾼다:

```ts
  const rows = allMembers
    .map((m) => ({ m, row: toRow(m, now) }))
    .filter(({ m, row }) => {
      if (filter === "linked" && !(row.hasDiscord && row.hasKakao)) return false;
      if (filter === "kakaoOnly" && (row.hasDiscord || !row.hasKakao)) return false;
      if (filter === "discordOnly" && (!row.hasDiscord || row.hasKakao)) return false;
      if (filter === "inactive" && (row.daysSinceActive === null || row.daysSinceActive < 14)) return false;
      return matchesQuery(m, row);
    })
    .map(({ row }) => row);

  const sortedRows = sort === "tier" ? sortByTierScore(rows, dir) : rows;

  return { totalCount, halfCount, unassignedCount, averageMmr, rows: sortedRows };
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/members.test.ts
```
기대: 전부 PASS.

- [ ] **Step 5: 표에 두 칸을 붙인다**

`apps/dashboard/components/MemberTable.tsx`의 import에 두 줄을 더한다:

```ts
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberRiotIdCell } from "@/components/MemberRiotIdCell";
```

그리드 문자열을 헤더와 행 **두 곳 모두** 바꾼다. 차례는 실명 · 카톡 닉네임 · 디코 닉네임 ·
티어 · Riot ID · MMR · 마지막 활동 · 관리다:

```
grid-cols-[1fr_1fr_1fr_92px_1fr_88px_128px_80px]
```

헤더의 `<div>디코 닉네임</div>` **다음에** 두 칸을 끼운다:

```tsx
        <Link href={sortHref("tier")} className="hover:text-[#B7C0D0]">
          티어{sortMark("tier")}
        </Link>
        <div>Riot ID</div>
```

행의 디코 닉네임 `<div>` **다음에** 두 칸을 끼운다:

```tsx
          <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
          <MemberRiotIdCell memberId={m.id} riotId={m.riotId} isAdmin={isAdmin} />
```

- [ ] **Step 6: 빌드와 전체 테스트를 확인한다**

```bash
npm run build --workspace=dashboard
npm test
```
기대: 빌드 성공, 모든 워크스페이스 PASS.

- [ ] **Step 7: 실제 화면에서 확인한다**

```bash
npm run dev --workspace=dashboard
```

`http://localhost:3000/members`에서:
1. 로그인 전 — 티어는 「언랭」 텍스트, Riot ID는 「-」로 보이고 편집할 수 없다.
2. 로그인 후 — 티어가 드롭다운이 된다. 하나를 고르면 저장되고 새로고침 없이 반영된다.
3. Riot ID 칸을 클릭해 `늑 구#1003`을 넣고 Enter — 저장된다. 다시 열어 비우면 「-」로 돌아간다.
4. 「티어」 헤더를 눌러 정렬 — 마스터가 위, 언랭이 아래. 다시 누르면 뒤집힌다.

- [ ] **Step 8: 커밋한다**

```bash
git add apps/dashboard/lib/queries/members.ts apps/dashboard/lib/queries/members.test.ts apps/dashboard/components/MemberTable.tsx
git commit -m "feat(tier): show and sort tier and riot id on the member dashboard"
```

---

## Task 5: 팀짜기 후보 명단에 티어를 싣는다

**Files:**
- Modify: `apps/dashboard/lib/queries/linked-members.ts`
- Test: `apps/dashboard/lib/queries/linked-members.test.ts`

**Interfaces:**
- Consumes: `MemberTier` (Task 1)
- Produces: `LinkedMemberOption`에 `tier: MemberTier`, `riotId: string | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/dashboard/lib/queries/linked-members.test.ts`의 맨 끝(가장 바깥 `describe` 안)에 붙인다.
이 파일이 이미 쓰는 회원 생성 방식(디스코드와 카톡이 모두 붙은 회원만 명단에 들어온다)을
그대로 따른다:

```ts
  it("carries the tier and the riot id", async () => {
    await prisma.member.create({
      data: {
        realName: "유대혁",
        discordUserId: "d-tier",
        discordHandle: "daehyeok_",
        kakaoNickname: "유대혁/95/유대혁#KR1",
        tier: "EMERALD_2",
        riotId: "늑 구#1003",
      },
    });

    const pool = await getLinkedMembers();

    const row = pool.find((p) => p.name === "유대혁");
    expect(row?.tier).toBe("EMERALD_2");
    expect(row?.riotId).toBe("늑 구#1003");
  });

  it("defaults an untouched member to unranked with no riot id", async () => {
    await prisma.member.create({
      data: {
        realName: "박시형",
        discordUserId: "d-plain",
        discordHandle: "sihyeong",
        kakaoNickname: "박시형/97/시형#KR1",
      },
    });

    const pool = await getLinkedMembers();

    const row = pool.find((p) => p.name === "박시형");
    expect(row?.tier).toBe("UNRANKED");
    expect(row?.riotId).toBeNull();
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/linked-members.test.ts
```
기대: 새 두 테스트가 FAIL — `row?.tier`가 undefined.

- [ ] **Step 3: 질의를 고친다**

`apps/dashboard/lib/queries/linked-members.ts` 맨 위에 타입 임포트를 더한다:

```ts
import type { MemberTier } from "@lolpamin/db";
```

`LinkedMemberOption`에 두 필드를 더한다 (`mmr: number;` 줄 다음):

```ts
  // 팀짜기 화면이 쓰는 값. 점수는 저장하지 않고 tierScore로 계산한다.
  tier: MemberTier;
  riotId: string | null;
```

마지막 `return members.map(...)`에 두 줄을 더한다 (`mmr: m.mmr,` 다음):

```ts
    tier: m.tier,
    riotId: m.riotId,
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd apps/dashboard && npx vitest run lib/queries/linked-members.test.ts
```
기대: 전부 PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/dashboard/lib/queries/linked-members.ts apps/dashboard/lib/queries/linked-members.test.ts
git commit -m "feat(tier): carry tier and riot id into the match pool"
```

---

## Task 6: 2.3 수동 팀짜기 화면

**Files:**
- Create: `apps/dashboard/components/TeamBuilder.tsx`
- Create: `apps/dashboard/app/team-builder/page.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `LinkedMemberOption` with `tier`·`riotId` (Task 5), `tierScore`·`tierLabel` (Task 1), `MemberTierCell`·`MemberRiotIdCell` (Task 3), `getLinkedMembers()`, `getCurrentAdmin()`
- Produces: `TeamBuilder({ pool, isAdmin }: { pool: LinkedMemberOption[]; isAdmin: boolean })`, `/team-builder` 라우트, `AppShell` `activeNav`의 `"team-builder"`

- [ ] **Step 1: 사이드바에 자리를 만든다**

`apps/dashboard/components/AppShell.tsx`의 `activeNav` 유니온에 한 줄을 더한다
(`| "matches"` 다음):

```ts
    | "team-builder"
```

그리고 「내전 관리」 그룹의 `items` 배열 끝에 한 줄을 더한다:

```ts
        { key: "team-builder", href: "/team-builder", label: "수동 팀짜기" },
```

결과적으로 그 그룹은 2.1 경기 기록 · 2.2 게임결과 입력 · 2.3 수동 팀짜기가 된다.
사이드바 번호는 위치에서 계산되므로 손댈 것이 없다.

- [ ] **Step 2: 팀짜기 컴포넌트를 만든다**

`apps/dashboard/components/TeamBuilder.tsx`:

```tsx
"use client";

import { useState } from "react";
import { tierScore } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberRiotIdCell } from "@/components/MemberRiotIdCell";

const POSITIONS = ["TOP", "JG", "MID", "AD", "SUP"] as const;
type Position = (typeof POSITIONS)[number];

// 「블루」와 「레드」는 경기 결과 입력·경기 기록이 이미 쓰는 이름이다.
const SIDES = ["blue", "red"] as const;
type Side = (typeof SIDES)[number];

type Slots = Record<Side, Record<Position, string | null>>;

function emptySlots(): Slots {
  return {
    blue: { TOP: null, JG: null, MID: null, AD: null, SUP: null },
    red: { TOP: null, JG: null, MID: null, AD: null, SUP: null },
  };
}

export function TeamBuilder({ pool, isAdmin }: { pool: LinkedMemberOption[]; isAdmin: boolean }) {
  // 팀 구성은 저장하지 않는다. 화면 하나를 띄워놓고 다 같이 보는 용도라 저장할 이유가
  // 없고, 저장하면 「어제 짠 팀」이 남아 다음 판에 헷갈린다 — 뽑기 게임과 같은 방침이다.
  const [slots, setSlots] = useState<Slots>(emptySlots);

  const byId = new Map(pool.map((p) => [p.id, p]));
  const seated = new Set(
    SIDES.flatMap((side) => POSITIONS.map((position) => slots[side][position])).filter(
      (id): id is string => id !== null,
    ),
  );

  function seat(side: Side, position: Position, memberId: string | null) {
    setSlots({ ...slots, [side]: { ...slots[side], [position]: memberId } });
  }

  function total(side: Side): number {
    return POSITIONS.reduce((sum, position) => {
      const id = slots[side][position];
      const member = id === null ? null : byId.get(id);
      return sum + (member ? tierScore(member.tier) : 0);
    }, 0);
  }

  const blueTotal = total("blue");
  const redTotal = total("red");

  // 한 사람이 두 자리에 앉는 것은 언제나 실수다. 자기 칸에서는 계속 보여야 선택을 바꿀 수 있다.
  function candidates(currentId: string | null): LinkedMemberOption[] {
    return pool.filter((p) => !seated.has(p.id) || p.id === currentId);
  }

  // 컴포넌트가 아니라 평범한 함수다. <Slot />로 만들면 렌더마다 새 컴포넌트 타입이
  // 되어 React가 하위를 통째로 다시 마운트하고, 그러면 Riot ID를 타이핑하던 input이
  // 매 렌더마다 사라진다.
  function slotCells(side: Side, position: Position) {
    const id = slots[side][position];
    const member = id === null ? null : byId.get(id) ?? null;
    const score = member === null ? null : tierScore(member.tier);

    return (
      <>
        {/* 점수. 0(아이언·언랭)은 빈칸이다 — 0을 찍으면 "0점짜리 실력"으로 읽히지만
            실제 의미는 "점수를 매기지 않는 구간"이다. */}
        <div className="text-right font-mono text-[15.5px] font-bold text-[#E6EAF2]">
          {score === null || score === 0 ? "" : score}
        </div>

        <div className="min-w-0">
          {member === null ? (
            <div className="text-[13.5px] text-[#5C6577]">—</div>
          ) : (
            <MemberTierCell memberId={member.id} tier={member.tier} isAdmin={isAdmin} />
          )}
        </div>

        {/* 위는 회원을 고르는 드롭다운, 아래는 그 회원의 Riot ID(운영진이면 편집 가능).
            한 칸에 「고르기」와 「고치기」를 동시에 넣을 수 없어 두 줄로 나눴다. */}
        <div className="flex min-w-0 flex-col gap-1">
          <select
            value={id ?? ""}
            onChange={(e) => seat(side, position, e.target.value === "" ? null : e.target.value)}
            className="w-full min-w-0 cursor-pointer rounded-md border border-white/[.09] bg-[#0F131B] px-1.5 py-1 text-[13.5px] text-[#E6EAF2] outline-none focus:border-[#4472C4]"
          >
            <option value="">— 비어 있음 —</option>
            {candidates(id).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {member !== null && (
            <MemberRiotIdCell memberId={member.id} riotId={member.riotId} isAdmin={isAdmin} />
          )}
        </div>
      </>
    );
  }

  const GRID = "grid grid-cols-[56px_112px_1fr_64px_1fr_112px_56px] items-start gap-3";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <h2 className="m-0 text-[14px] font-bold">팀 배치</h2>
          <span className="text-[12px] text-[#6E7889]">
            매핑 완료 회원만 · 짠 팀은 저장되지 않습니다
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSlots(emptySlots())}
          className="rounded-lg bg-[#20293A] px-3 py-1.5 text-[13px] font-bold text-[#C7D0DF] transition-colors hover:bg-[#27324A]"
        >
          전부 비우기
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="min-w-[860px]">
          <div className={`${GRID} border-b border-white/[.06] pb-2 text-[12.5px] font-bold tracking-wide text-[#6E7889]`}>
            <div className="text-right">점수</div>
            <div>티어</div>
            <div>블루</div>
            <div className="text-center">포지션</div>
            <div>레드</div>
            <div>티어</div>
            <div className="text-right">점수</div>
          </div>

          {POSITIONS.map((position) => (
            <div key={position} className={`${GRID} border-b border-white/[.04] py-3`}>
              {slotCells("blue", position)}
              <div className="pt-1.5 text-center font-mono text-[13px] font-bold text-[#8A94A6]">
                {position}
              </div>
              {slotCells("red", position)}
            </div>
          ))}

          <div className={`${GRID} pt-3 text-[15.5px] font-bold`}>
            <div className="text-right font-mono text-[#8FB4F5]">{blueTotal}</div>
            <div />
            <div />
            <div className="text-center text-[13px] text-[#8A94A6]">합</div>
            <div />
            <div />
            <div className="text-right font-mono text-[#EE8B8B]">{redTotal}</div>
          </div>

          <div className="pt-2 text-center text-[12.5px] text-[#6E7889]">
            차이 <span className="font-mono font-bold text-[#E6EAF2]">{Math.abs(blueTotal - redTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

`slotCells`가 `<>...</>`로 세 칸을 한꺼번에 내놓는 것은 부모의 7칸 그리드에 그대로 얹히게
하려는 것이다. 감싸는 `<div>`를 두면 세 칸이 한 칸으로 뭉친다.

- [ ] **Step 3: 페이지를 만든다**

`apps/dashboard/app/team-builder/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { TeamBuilder } from "@/components/TeamBuilder";
import { getLinkedMembers } from "@/lib/queries/linked-members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the pool query read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function TeamBuilderPage() {
  const [pool, currentAdmin] = await Promise.all([getLinkedMembers(), getCurrentAdmin()]);

  return (
    <AppShell
      activeNav="team-builder"
      pageTitle="수동 팀짜기"
      pageDesc="티어 점수를 보며 손으로 양 팀을 맞춥니다"
    >
      <div className="px-7 pb-10 pt-6">
        <TeamBuilder pool={pool} isAdmin={currentAdmin !== null} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: 빌드와 전체 테스트를 확인한다**

```bash
npm run build --workspace=dashboard
npm test
```
기대: 빌드 성공, 모든 워크스페이스 PASS.

- [ ] **Step 5: 실제 화면에서 확인한다**

```bash
npm run dev --workspace=dashboard
```

`http://localhost:3000/team-builder`에서:
1. 사이드바 「내전 관리」 아래 2.3 「수동 팀짜기」가 있고, 눌러 들어오면 그 항목이 켜진다.
2. 다섯 줄 × 양팀 표가 뜨고 모든 칸이 「— 비어 있음 —」이다. 합계는 둘 다 0, 차이 0.
3. 블루 TOP에 회원 하나를 앉힌다 — 티어와 Riot ID가 아래에 따라 붙고 합계가 그 점수만큼 오른다.
4. 다른 칸의 드롭다운을 열면 방금 앉힌 사람이 후보에 없다. 블루 TOP 자기 드롭다운에는 있다.
5. 언랭 회원을 앉히면 점수 칸이 빈칸이고 합계는 변하지 않는다.
6. 로그인 후 팀짜기 화면에서 티어를 바꾼다 — 저장되고 점수·합계가 즉시 따라 움직인다.
   `/members`로 가면 같은 값이 보인다.
7. 「전부 비우기」를 누르면 열 칸이 모두 비고 합계가 0으로 돌아간다.
8. 새로고침하면 배치가 초기화된다(의도된 동작이다).

- [ ] **Step 6: 커밋한다**

```bash
git add apps/dashboard/components/TeamBuilder.tsx apps/dashboard/app/team-builder/page.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(team-builder): seat both teams by hand and watch the tier totals"
```

---

## Task 7: 문서 갱신

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-03-tier-score-and-manual-team-builder-design.md`

**Interfaces:**
- Consumes: Task 1~6의 결과
- Produces: 없음 (문서)

- [ ] **Step 1: `CLAUDE.md`에 티어를 적는다**

「Domain model and its non-obvious rules」 절의 소프트 리셋 문단 **다음에** 붙인다:

```markdown
Separately from MMR, each member carries a solo-queue `tier` (`MemberTier`, default
`UNRANKED`) that an admin sets by hand. Its score comes from a reference table in
`packages/core/src/tier.ts` — 다1 24 down to 브4 1, master split into LP bands above
that (25–30), 아이언 and 언랭 both 0 — and is never stored, so editing the table
moves every score at once. It feeds `/team-builder` (2.3), where an admin seats both
teams by hand and watches the two totals; that arrangement is browser state and is
never saved. `packages/core` imports the `MemberTier` type from `@lolpamin/db` — the
one place it depends on another workspace, and a type-only import.
```

- [ ] **Step 2: 스펙에 구현 상태를 적는다**

`docs/superpowers/specs/2026-09-03-tier-score-and-manual-team-builder-design.md`의
제목 아래 메타 줄 다음에 붙인다:

```markdown
## 구현 상태 (2026-09-03)

구현 완료. 계획: `docs/superpowers/plans/2026-09-03-tier-score-and-manual-team-builder.md`.

구현하며 달라진 것:

- 티어 셀은 「클릭하면 열리는」 편집기가 아니라 항상 보이는 `<select>`다. 네이티브
  select는 그 자체가 한 번의 클릭으로 열린다.
- 티어·Riot ID 저장 후 `/inactive`는 revalidate하지 않는다. 그 화면은 두 값을
  보여주지 않는다.
- 팀짜기의 각 칸은 두 줄이다 — 위는 회원을 고르는 드롭다운, 아래는 Riot ID.
  한 칸에 「고르기」와 「고치기」를 함께 넣을 수 없어서다.
- `MemberRow.riotId`와 `LinkedMemberOption.riotId`는 `"-"` 센티넬이 아니라 `string | null`이다.
```

- [ ] **Step 3: 커밋한다**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-03-tier-score-and-manual-team-builder-design.md
git commit -m "docs: record the tier score table and the manual team builder"
```

---

## 배포 메모

마이그레이션이 하나 늘었다. 서버의 대시보드 컨테이너 `CMD`가 `prisma migrate deploy`를
`next start` 앞에서 돌리므로, 트리를 동기화하고 이미지를 다시 빌드하면 스키마가 따라온다.
`git archive`는 덮어쓰기만 하므로 삭제된 파일은 손으로 지워야 하는데, 이번 작업은 파일을
지우지 않는다.

배포 뒤 회원 41명의 티어는 전부 「언랭」이다. 운영진이 `/members`에서 손으로 채워야
팀짜기가 쓸모 있어진다.
