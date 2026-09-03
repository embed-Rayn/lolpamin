# 티어 점수와 수동 팀짜기 설계

- 작성일: 2026-09-03
- 관련 스펙: `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md`

## 배경 및 목적

내전 팀을 짤 때 지금은 MMR만 있다. 그런데 MMR은 내전 결과로만 움직이는 값이라, 새로 들어온
회원이나 몇 판 안 뛴 회원은 전부 1000 근처에 몰려 있어 실력 차가 드러나지 않는다. 운영진은
실제로는 솔로랭크 티어를 보고 팀을 가른다.

이 문서는 두 가지를 만든다.

1. **티어 점수** — 회원마다 솔로랭크 티어를 저장하고, 참조표로 점수를 매긴다.
2. **수동 팀짜기 화면** — TOP/JG/MID/AD/SUP 다섯 자리에 양 팀 열 명을 앉히고 팀별
   점수 합계를 보며 손으로 균형을 맞춘다.

MMR을 대체하지 않는다. MMR은 내전에서 이기고 진 결과이고 티어 점수는 바깥 실력의 대용치다.
둘은 나란히 존재하며 서로를 계산에 넣지 않는다.

## 범위

**포함**

- `Member.tier` 컬럼과 티어 → 점수 참조표
- 회원 대시보드(1.1)와 팀짜기(2.3)에서 운영진이 티어를 고치는 경로
- `Member.riotId` 편집 경로 (지금은 스키마에만 있고 채울 방법이 없다)
- 「내전 관리」 그룹 2.3 항목으로 들어가는 `/team-builder` 화면

**제외**

- 팀 자동 배정. 이 화면은 사람이 손으로 앉히는 도구다. 자동 분배는 별개 작업이다.
- 짠 팀의 저장·이력. 상태는 브라우저 메모리에만 있고 새로고침하면 초기화된다 —
  뽑기 게임과 같은 방침이다.
- 티어 점수를 MMR에 섞는 것. 두 값은 독립이다.
- 라이엇 API로 티어를 자동으로 가져오는 것. 운영진이 손으로 입력한다.
- 이 화면에서 경기 결과를 입력하는 것. 경기가 끝나면 지금처럼 2.2에서 입력한다.

## 티어 점수표

```
마스터 1000+     30      마스터 800~1000  29      마스터 600~800   28
마스터 400~600   27      마스터 200~400   26      마스터 0~200     25
다1 24  다2 23  다3 22  다4 21
에1 20  에2 19  에3 18  에4 17
플1 16  플2 15  플3 14  플4 13
골1 12  골2 11  골3 10  골4  9
실1  8  실2  7  실3  6  실4  5
브1  4  브2  3  브3  2  브4  1
아이언 0        언랭 0
```

마스터 위쪽은 티어 이름이 아니라 **LP 구간**으로 자른다. 그랜드마스터와 챌린저는 별도
티어가 아니라 마스터 LP 상위 구간이므로, LP로 자르면 자동으로 덮인다. 구간은 아래를
포함하고 위를 뺀다 — `마스터 200~400`은 200 LP부터 399 LP까지다. 1000 LP 위는 한 칸이다.

아이언과 언랭은 둘 다 0이다. 브4가 1점이므로 그 아래는 구분하지 않는다. **점수가 0인
회원은 화면의 점수 칸을 빈칸으로 둔다** — 0을 찍으면 "0점짜리 실력"으로 읽히지만 실제
의미는 "점수를 매기지 않는 구간"이다.

점수는 **저장하지 않는다.** 티어에서 매번 계산한다. 저장하면 점수표를 고쳤을 때 이미
저장된 값이 옛 표에 묶인다.

## 데이터 모델

```prisma
model Member {
  // ... 기존 필드 ...
  tier MemberTier @default(UNRANKED)
}

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

`UNRANKED`가 기본값이다. nullable로 두지 않는 이유: 「티어를 모른다」와 「언랭이다」는
점수가 0으로 같고, 화면에서도 같은 칸에 같은 문구가 들어간다. 값을 하나로 줄이면
`null` 분기가 전부 사라진다.

enum 값을 점수 내림차순으로 선언한다. Prisma가 enum 순서를 보존하므로 드롭다운 항목을
만들 때 별도 정렬이 필요 없고, 실수로 항목을 빠뜨리면 점수표와 대조하기 쉽다.

아이언을 티어별로 쪼개지 않는 것은 전부 0이라서다. 브론즈까지는 1~4를 유지한다.

## `packages/core/src/tier.ts`

I/O 없는 순수 모듈. DB 값(enum)과 화면 문구·점수 사이의 유일한 다리다.

```ts
import type { MemberTier } from "@lolpamin/db";

export const TIER_SCORES: Record<MemberTier, number>;

/** 티어의 점수. 참조표 그대로다. */
export function tierScore(tier: MemberTier): number;

/** 드롭다운과 표에 쓰는 한글 이름. "다1", "마스터 400~600", "언랭". */
export function tierLabel(tier: MemberTier): string;

/** 드롭다운 항목. 점수 내림차순 — 위가 마스터, 아래가 언랭이다. */
export const TIER_OPTIONS: ReadonlyArray<{ value: MemberTier; label: string; score: number }>;
```

`packages/core`가 `@lolpamin/db`의 타입을 가져오는 것은 새로운 일이다. 지금 core는
어떤 워크스페이스에도 기대지 않는다. 두 가지 선택지가 있었다:

1. core가 자기 문자열 유니온 타입을 정의하고 dashboard가 enum과의 변환을 맡는다.
2. core가 `MemberTier` 타입만 `@lolpamin/db`에서 가져온다.

**2를 고른다.** 1은 값이 같은 타입을 두 곳에 적어놓고 둘이 어긋나지 않기를 바라는 것이고,
티어는 32개다. 가져오는 것은 `import type`이라 런타임 의존이 생기지 않고, Prisma 클라이언트가
enum을 값으로도 내보내므로 `TIER_SCORES`의 키를 컴파일러가 검사해 준다 —
enum에 항목을 더하고 점수표에 안 더하면 타입 에러가 난다. `packages/db`를
`packages/core`의 dependency에 추가한다.

**테스트:** 32개 티어가 전부 점수표에 있고 값이 위 표와 일치한다. `UNRANKED`와 `IRON`은
0이다. `TIER_OPTIONS`가 점수 내림차순이고 32개다. 라벨이 전부 비어 있지 않다.

## 티어·Riot ID 편집

### 왜 Riot ID까지

`Member.riotId`는 스키마와 시드 데이터에만 있고, 어느 화면도 이 값을 쓰거나 채우지 않는다.
병합 로직만 승계 대상으로 다룬다. 팀짜기 표는 사람을 Riot ID로 식별하므로(예시가 그렇다)
이번에 입력 경로를 만든다.

### 셀 컴포넌트 두 개

`MemberRealNameCell`이 쓰는 클릭 편집 패턴을 그대로 따른다 — 평소에는 값만 보이고,
운영진이 클릭하면 편집기가 열리고, blur나 Enter로 저장하고 Escape로 취소한다. 값이
바뀌지 않았으면 저장하지 않는다.

- `MemberTierCell` — 클릭하면 `<select>`가 열린다. 항목은 `TIER_OPTIONS`. 고르는 즉시
  저장한다(텍스트와 달리 선택은 확정 동작이다).
- `MemberRiotIdCell` — 텍스트 입력. `MemberRealNameCell`과 거의 같다.

두 컴포넌트를 **회원 대시보드(1.1)와 팀짜기(2.3) 양쪽에서 재사용한다.** 팀을 짜다 티어가
바뀐 걸 발견했을 때 화면을 옮기지 않아도 되고, 편집 로직은 한 벌만 존재한다.

로그인하지 않은 사람에게는 읽기 전용 텍스트로 보인다. 읽기는 공개, 쓰기는 운영진 —
지금 대시보드 전체의 방침이다.

### 뮤테이션과 서버 액션

```ts
// apps/dashboard/lib/mutations/update-member-tier.ts
export async function updateMemberTier(prisma: PrismaClient, memberId: string, tier: MemberTier): Promise<void>;

// apps/dashboard/lib/mutations/update-member-riot-id.ts
export async function updateMemberRiotId(prisma: PrismaClient, memberId: string, riotId: string): Promise<void>;
```

`updateMemberRiotId`는 `updateMemberRealName`과 같이 입력을 trim하고 빈 문자열은 `null`로
저장한다. 형식 검증은 하지 않는다 — 예시의 `늑 구#1003`, `주디#주토피아`처럼 공백과
한글이 들어가고, 라이엇의 실제 규칙보다 우리가 아는 규칙이 좁을 위험이 더 크다.

서버 액션은 `apps/dashboard/app/members/actions.ts`에 둔다. 두 화면이 같은 액션을 부른다.
액션은 첫 줄에서 `await requireAdmin()`을 호출한다. 저장 뒤 `/members`, `/team-builder`,
`/inactive`를 revalidate한다.

**테스트:** 티어를 저장하고 다시 읽으면 같은 값이다. Riot ID의 앞뒤 공백이 잘린다.
공백만 넣으면 `null`이 된다. 없는 회원 id면 던진다.

### 회원 대시보드 표

현재 6칸(실명·카톡 닉네임·디코 닉네임·MMR·마지막 활동·관리)에 「티어」와 「Riot ID」가
붙어 8칸이 된다. 그리드를 `1fr_1fr_1fr_92px_1fr_88px_128px_80px`로 바꾼다 — 차례로 실명 · 카톡 닉네임 ·
디코 닉네임 · 티어 · Riot ID · MMR · 마지막 활동 · 관리다. Riot ID는 디코 닉네임과 같은
고정폭 글꼴로 보여준다.

티어로 정렬할 수 있게 한다. `MemberSort`에 `"tier"`를 더한다. **정렬은 enum 순서가 아니라
점수 순이어야 한다** — Postgres는 enum을 선언 순서로 정렬하는데 우리 선언 순서가 점수
내림차순이므로 두 순서가 우연히 일치한다. 이 사실에 기대는 대신, 정렬은 조회 후
`tierScore`로 자바스크립트에서 한다. 회원이 41명이라 비용이 문제되지 않고, 나중에 enum
순서를 바꿔도 정렬이 조용히 틀어지지 않는다.

`MemberRow`에 `tier: MemberTier`와 `riotId: string | null`을 더한다.

## `/team-builder` — 2.3 수동 팀짜기

### 내비게이션

`AppShell`의 `activeNav` 합집합에 `"team-builder"`를 더하고, 「내전 관리」 그룹의 세 번째
항목으로 넣는다. 그룹 안 순서는 경기 기록(2.1) · 게임결과 입력(2.2) · 수동 팀짜기(2.3)다.
사이드바 번호는 위치에서 계산되므로 손댈 것이 없다.

### 화면

```
      점수  티어   Riot ID                        Riot ID              티어   점수
TOP    19   에2    늑 구#1003              TOP    모티애비#7805         골3    10
JG     19   에2    나는야칭찬무새#kr1        JG     주디#주토피아          언랭
MID    13   플4    람스터#람스터            MID    뚜비뚜밥#뚜비얌        다1    24
AD     10   골3    fukcin216#7980         AD     사육사#1003           에4    17
SUP          언랭  MadCow#KR98            SUP    고라니기운#kr1         골2    11

                    29        합        30        (차이 1)
```

- 다섯 줄은 고정이다: TOP · JG · MID · AD · SUP. 자리를 늘리거나 줄이지 않는다.
- 가운데 열이 포지션 이름이고, 좌우가 두 팀이다. 팀 이름은 「블루」와 「레드」로 —
  경기 결과 입력과 경기 기록이 이미 쓰는 이름이다.
- Riot ID 칸을 클릭하면 회원을 고르는 드롭다운이 열린다. 고르면 그 회원의 티어와 점수가
  같은 줄에 채워진다.
- 회원의 `riotId`가 비어 있으면 그 자리에 표시 이름을 대신 보여주고, 옆에서 바로 채울 수
  있다(`MemberRiotIdCell`).
- 티어 칸은 `MemberTierCell`이다. 운영진이면 그 자리에서 고쳐 회원 데이터에 저장된다.
- 점수가 0인 줄은 점수 칸이 빈칸이다. 합계에는 0으로 들어간다.
- 맨 아래에 팀별 합계와 차이를 보여준다.

### 후보 명단

`getLinkedMembers()`가 주는 명단을 그대로 쓴다 — 디스코드와 카톡이 모두 붙은 회원이다.
경기 결과를 입력할 수 있는 사람과 팀에 앉힐 수 있는 사람이 같아야 하므로 같은 질의를 쓴다.
`LinkedMemberOption`에 `tier`와 `riotId`를 더한다.

**이미 앉은 사람은 다른 칸의 후보에서 빠진다.** 한 사람이 두 자리에 앉는 것은 언제나
실수다. 자기 칸에서는 계속 보여야 선택을 바꿀 수 있다.

### 상태

전부 클라이언트 상태다. 열 칸의 배열 하나 — 각 칸은 `memberId | null`이다. 티어와 점수는
파생값이므로 상태에 넣지 않고 매번 명단에서 찾는다.

「전부 비우기」 버튼 하나를 둔다. 되돌리기는 없다 — 칸을 다시 고르면 되고, 뽑기와 달리
연출이 없어 실수를 되돌릴 것이 없다.

새로고침하면 초기화된다. 화면 하나를 띄워놓고 다 같이 보는 용도라 저장할 이유가 없고,
저장하면 「어제 짠 팀」이 남아 다음 판에 헷갈린다.

## 파일

**생성**

| 파일 | 책임 |
|---|---|
| `packages/core/src/tier.ts` | 티어 → 점수·라벨·드롭다운 항목 (순수) |
| `packages/core/src/tier.test.ts` | 위의 단위 테스트 |
| `apps/dashboard/lib/mutations/update-member-tier.ts` | 티어 저장 |
| `apps/dashboard/lib/mutations/update-member-riot-id.ts` | Riot ID 저장 |
| `apps/dashboard/components/MemberTierCell.tsx` | 티어 드롭다운 셀 (두 화면 공용) |
| `apps/dashboard/components/MemberRiotIdCell.tsx` | Riot ID 텍스트 셀 (두 화면 공용) |
| `apps/dashboard/app/team-builder/page.tsx` | 2.3 서버 컴포넌트, force-dynamic |
| `apps/dashboard/components/TeamBuilder.tsx` | 팀짜기 표 (클라이언트) |

**수정**

| 파일 | 무엇을 |
|---|---|
| `packages/db/prisma/schema.prisma` | `MemberTier` enum + `Member.tier` |
| `packages/core/src/index.ts` | `./tier` 재수출 |
| `packages/core/package.json` | `@lolpamin/db` 의존 추가 |
| `apps/dashboard/lib/queries/members.ts` | `MemberRow`에 `tier`·`riotId`, `MemberSort`에 `"tier"` |
| `apps/dashboard/lib/queries/linked-members.ts` | `LinkedMemberOption`에 `tier`·`riotId` |
| `apps/dashboard/components/MemberTable.tsx` | 두 칸 추가, 그리드 조정, 티어 정렬 링크 |
| `apps/dashboard/app/members/actions.ts` | 두 서버 액션 추가 |
| `apps/dashboard/components/AppShell.tsx` | `activeNav`에 `"team-builder"`, 내전 관리 그룹에 항목 |

## 테스트 전략

DB를 건드리는 테스트는 `DATABASE_URL_TEST` 가드로 시작한다.

**순수 (`packages/core`)**

- 32개 티어(마스터 6 + 다이아~브론즈 24 + 아이언 + 언랭)가 모두 점수표에 있고 값이 스펙의 표와 같다.
- `IRON`과 `UNRANKED`가 0이다.
- `TIER_OPTIONS`가 32개이고 점수 내림차순이다.

**뮤테이션**

- 티어를 저장하고 다시 읽으면 같다.
- Riot ID의 앞뒤 공백이 잘리고, 공백만 넣으면 `null`이 된다.
- 없는 회원이면 던진다.

**질의**

- `getMemberListData`가 티어와 Riot ID를 실어 온다.
- 티어 정렬이 점수 순이다 — 마스터가 위, 언랭이 아래.
- `getLinkedMembers`가 티어와 Riot ID를 실어 온다.

**화면**

팀짜기 상태는 브라우저에만 있어 통합 테스트가 닿지 않는다. 실제 화면에서 확인한다:
회원을 고르면 티어·점수가 따라 붙는지, 이미 앉은 사람이 다른 칸 후보에서 빠지는지,
합계가 맞는지, 언랭 줄의 점수 칸이 비어 있는지.

## 마이그레이션

`Member.tier`에 기본값 `UNRANKED`가 있으므로 기존 41행은 전부 언랭으로 시작한다.
운영진이 손으로 채워 넣는다. 데이터 이관 스크립트는 필요 없다.

## 남긴 것

회원 변경 로그(`docs/superpowers/plans/2026-09-03-member-change-log.md`)가 들어오면 티어와
Riot ID 수정도 `MemberChangeLog`에 남겨야 맞는다. 이번에는 그 테이블이 아직 없으므로
남기지 않는다. 로그 작업을 할 때 두 뮤테이션도 함께 붙인다.

## 알려진 한계

- 티어는 손으로 입력한다. 시즌이 바뀌거나 누가 티어를 올려도 아무도 고치지 않으면 값이
  낡는다. 라이엇 API 연동은 별개 작업이다.
- 점수표는 코드에 박혀 있다. 바꾸려면 배포해야 한다. 지금 규모에서는 화면에서 고치게
  만드는 비용이 이득보다 크다.
- 짠 팀이 남지 않으므로, 그 팀으로 뛴 경기와 팀 구성을 나중에 연결할 수 없다. 경기 기록에는
  누가 어느 팀이었는지가 남으므로 실질적인 손실은 포지션 정보뿐이다.
