# 칼바람(ARAM) MMR 설계

- 작성일: 2026-09-16
- 관련 스펙: `docs/superpowers/specs/2026-09-03-tier-score-and-manual-team-builder-design.md`,
  `docs/superpowers/specs/2026-09-10-rofl-replay-import-design.md`

## 배경 및 목적

지금 MMR은 협곡(소환사의 협곡) 내전 하나만을 대상으로 한다. 그룹이 칼바람 내전도 자주
돌리는데, 지금 구조로는 칼바람 결과가 협곡 MMR에 그대로 섞여 들어가 두 게임 방식의 실력이
한 숫자로 뭉개진다.

이 작업은 칼바람 전용 레이팅 트랙을 협곡과 나란히 하나 더 만든다. 계산식(K=40, 승/패 보너스)은
그대로 재사용하고, 숫자만 완전히 독립적으로 쌓인다. 협곡·칼바람 두 가지만 확실히 정해졌고
그 이상의 모드 확장 계획은 없으므로, 모드를 일반화한 테이블을 만들지 않고 `Member`에 컬럼을
하나 더 얹는 실용적인 방식을 쓴다.

## 범위

**포함**

- `Member.aramMmr` — 협곡 `mmr`과 별개인 칼바람 레이팅
- `GameResult.mode`(`RIFT` 기본값 / `ARAM`) — 각 경기가 어느 트랙에 속하는지
- 게임결과 입력(2.2)에 협곡/칼바람 토글
- 리플레이 불러오기(2.3)에도 같은 토글(수동) — 아래 "왜 자동판별을 안 하는가" 참고
- 취소·분기 리셋이 두 트랙을 올바르게 다루도록 수정
- 「회원 관리」 그룹에 칼바람 대시보드(1.2, 회원 대시보드 바로 다음)
- 디스코드 봇 `/mmr-aram` 명령

**제외**

- 협곡·칼바람 외 세 번째 이상의 모드. 필요해지면 그때 일반화한다.
- 디스코드 봇의 `/랭킹`, `/전적` — 이번 범위는 `/mmr-aram`뿐이다.
- 리플레이의 모드 자동판별. `.rofl` 꼬리 JSON에 신뢰할 만한 필드가 없다(아래 참고).
- 티어 점수·팀짜기(2.4)에 칼바람용 값을 따로 두는 것. 티어는 솔로랭크 값이라 모드와
  무관하게 하나만 있으면 된다.

## 데이터 모델

```prisma
enum GameMode {
  RIFT
  ARAM
}

model Member {
  // ... 기존 필드 ...
  mmr     Int @default(1000)
  aramMmr Int @default(1000)
}

model GameResult {
  // ... 기존 필드 ...
  mode GameMode @default(RIFT)
}
```

`GameParticipant.mmrBefore/mmrAfter`는 손대지 않는다. 이미 모드에 무관한 범용 컬럼이라,
그 행이 속한 `GameResult.mode`를 보면 어느 트랙의 값인지 알 수 있다.

`MmrSetting`(K값·승리점수·패배점수)도 하나만 유지한다. 계산식을 그대로 재사용하기로
했으므로 두 트랙이 같은 설정을 공유해야 한다 — 모드별로 K값을 다르게 두는 것은 이번
범위가 아니다.

기존 41행은 `aramMmr` 기본값 1000으로 시작하고, 기존 `GameResult`는 전부 `mode = RIFT`로
채워진다(칼바람 경기가 지금까지 하나도 기록된 적이 없으므로 데이터 이관이랄 것이 없다).

## 레이팅 필드 헬퍼

모드에 따라 `mmr`과 `aramMmr` 중 어느 컬럼을 읽고 쓸지 결정하는 지점이 저장·취소·리셋
세 곳에 반복된다. 작은 헬퍼 하나로 묶는다.

```ts
// apps/dashboard/lib/mutations/rating-field.ts
import type { GameMode } from "@lolpamin/db";

export function ratingField(mode: GameMode): "mmr" | "aramMmr" {
  return mode === "ARAM" ? "aramMmr" : "mmr";
}
```

## 게임결과 입력 (2.2, `MatchBuilder.tsx`)

- "경기 정보" 섹션에 협곡(기본)/칼바람 토글을 추가한다. `useState<GameMode>("RIFT")`.
- `getLinkedMembers()`가 내려주는 `LinkedMemberOption`에 `aramMmr`·`aramWins`·`aramLosses`를
  더한다. 기존 `mmr`·`wins`·`losses`는 그대로 두어 협곡 전용으로 남긴다 — 이 타입을 쓰는
  다른 화면(`/team-builder`)은 모드 개념이 없으므로 건드릴 이유가 없다.
- `MatchBuilder`는 선택된 모드에 따라 어느 필드를 보여주고 계산에 쓸지 고르는 작은 헬퍼를
  둔다(`ratingOf(member, mode)`, `recordOf(member, mode)`). 참가자 목록의 MMR·승·패 칸,
  평균 MMR, 미리보기가 전부 이 헬퍼를 거친다.
- **모드를 바꿔도 참석 명단·팀 배정·승리팀 선택은 그대로 둔다.** 같은 10명이 협곡 한 판,
  칼바람 한 판을 연달아 뛰는 흐름이 흔해서다. 바뀌는 것은 어떤 MMR 숫자를 보여주고
  저장할지뿐이다.
- 저장 시 `saveGameResultAction`에 `mode`를 함께 보낸다.

## 저장 (`save-game-result.ts`)

- `SaveGameResultInput`에 `mode: GameMode = "RIFT"`를 추가한다.
- 참가자 조회 시 `mmr`과 `aramMmr`을 함께 select하고, `ratingField(mode)`로 고른 값을
  `calculateTeamMmrChange`의 입력으로 쓴다.
- `GameResult.create`에 `mode`를 저장한다.
- `member.update`가 쓰는 필드도 `ratingField(mode)`를 거친다 — `{ [ratingField(mode)]: mmrAfter }`.

`calculateTeamMmrChange` 자체(`packages/core/src/mmr.ts`)는 손대지 않는다. 숫자 배열을
받아 델타를 내는 순수 함수라 모드라는 개념을 몰라도 된다 — 모드는 core 밖(어느 필드를
읽고 쓸지)에서만 다룬다.

## 취소 (`cancel-game-result.ts`)

두 가지를 고친다.

1. **되돌릴 필드.** 지금은 무조건 `member.mmr`을 되돌린다. `game.mode`를 보고
   `ratingField(game.mode)`로 고른 필드를 되돌리도록 바꾼다.

2. **"가장 최근 경기" 판정의 범위.** 지금 `notLatest` 검사는 전체 `GameResult` 중
   `cancelledAt: null`인 가장 최근 것만 취소 가능하다고 본다. 이 규칙의 근거는 "그
   참가자들이 이후에 뛴 살아 있는 경기가 없어야 현재 mmr이 정확히 이 경기의 mmrAfter다"인데,
   협곡과 칼바람은 서로 다른 레이팅 트랙이므로 **최근 칼바람 경기 하나가 있다고 해서 더 오래된
   협곡 경기를 못 되돌릴 이유가 없다.** 두 트랙이 서로의 mmr에 관여하지 않기 때문이다.
   `latest` 조회에 `mode: game.mode` 조건을 더해 "같은 트랙에서 가장 최근"으로 좁힌다.

`beforeReset` 검사(마지막 `RatingReset.resetAt`)는 그대로 둔다 — 리셋은 두 트랙을 같은
순간에 함께 건드리므로(아래 참고) 기준 시각 자체는 모드와 무관하게 하나다.

## 분기 리셋 (`reset-ratings.ts`)

소프트·하드 리셋 모두 `mmr`과 `aramMmr`을 같이 리셋한다(확인된 사항). `RatingReset`
행은 여전히 하나만 남긴다 — "칼바람 리셋"과 "협곡 리셋"을 별개 이벤트로 남길 이유가
없다. 한 번의 관리자 조작이 두 숫자를 동시에 건드린다.

```ts
if (kind === "HARD") {
  await tx.member.updateMany({
    where: { mergedIntoId: null },
    data: { mmr: applyHardReset(), aramMmr: applyHardReset() },
  });
} else {
  for (const member of members) {
    const mmr = applySoftReset(member.mmr);
    const aramMmr = applySoftReset(member.aramMmr);
    if (mmr === member.mmr && aramMmr === member.aramMmr) continue;
    await tx.member.update({ where: { id: member.id }, data: { mmr, aramMmr } });
  }
}
```

## 판/승/패 집계와 칼바람 대시보드 (1.2)

`getCountedGameFilter`(취소 여부 + 리셋 기준선)는 모드와 무관하게 그대로 두고, 호출부에서
`gameResult: { ...countedGame, mode: "ARAM" }`처럼 모드 조건을 덧붙이는 방식으로 재사용한다.

`getMemberListData`에 `mode: GameMode = "RIFT"` 파라미터를 추가한다. `ratingField(mode)`로
고른 필드를 네 군데에서 쓴다: `orderByFor`의 `"mmr"` 정렬(Prisma `orderBy`), `toRow`가
`MemberRow.mmr`에 채우는 값(필드 이름은 그대로 `mmr`이고 내용만 협곡/칼바람을 오간다),
`tallyRecords`의 판/승/패 집계(참가 기록을 `gameResult.mode`로도 필터링), `averageMmr` 계산.

`MemberRow`·`MemberTable`·`MemberFilters`·`StatCard`는 이미 모드를 모른다 — `rows`와
숫자만 받아 그리는 컴포넌트라 손댈 이유가 없다. 새 `app/aram/page.tsx`는
`app/members/page.tsx`를 그대로 본떠 `getMemberListData("ARAM", filter, query, sort, dir)`를
부르고, 같은 세 컴포넌트로 그린다. 기존 `/members`(1.1)는 인자를 생략해(`"RIFT"` 기본값)
지금과 동일하게 동작한다. 티어 칼럼은 모드와 무관한 정보이므로 칼바람 대시보드에도 그대로
둔다.

`AppShell`의 `memberItems`에 "칼바람 대시보드"를 회원 대시보드 바로 다음에 끼워 넣는다.
사이드바 번호는 배열 위치에서 계산되므로(`AppShell.tsx`의 주석 참고) 카톡 불러오기 이하는
자동으로 한 칸씩 밀린다. `activeNav` 유니온에 `"aram"`을 추가한다.

## 리플레이 불러오기 (2.3)

### 왜 자동판별을 안 하는가

`.rofl`의 평문 JSON 꼬리를 실제 칼바람 샘플 파일로 열어 확인했다 — 루트 키는
`gameLength` / `lastGameChunkId` / `lastKeyFrameId` / `statsJson`뿐이고, 모드나 큐를
가리키는 필드가 없다. 참가자의 `TEAM_POSITION`이 빈 문자열이긴 한데(칼바람은 라인이
없어서), 포지션 없이 진행된 협곡 커스텀 게임도 같은 값을 남길 수 있어 이것만으로 자동
판별하면 오탐이 생긴다. 그래서 모드는 관리자가 업로드 화면에서 직접 고른다 —
`MatchBuilder`와 같은 패턴이다.

### 변경

- `ReplayImportForm`에 협곡(기본)/칼바람 토글 추가.
- `SaveReplayImportInput`(`save-replay-import.ts`)에 `mode: GameMode = "RIFT"` 추가,
  `saveGameResultTx` 호출에 그대로 전달.

## 디스코드 봇 `/mmr-aram`

- `apps/discord-bot/src/commands/mmr-aram.ts` 신설. `commands/mmr.ts`를 그대로 따라가되
  `member.mmr` 대신 `member.aramMmr`을 쓴다.
- `getMemberRank(prisma, mmr)`은 지금 `mmr` 컬럼에 고정되어 있다(`{ mmr: { gt: mmr } }`).
  두 번째 인자로 `field: "mmr" | "aramMmr" = "mmr"`를 받도록 넓혀 `/mmr-aram`이
  `getMemberRank(prisma, member.aramMmr, "aramMmr")`로 호출한다.
- `index.ts`의 커맨드 목록과 `deploy-commands.ts`에 새 명령을 추가한다.
- `/랭킹`(`leaderboard.ts`), `/전적`(`record.ts`)은 건드리지 않는다.

## 파일

**생성**

| 파일 | 책임 |
|---|---|
| `apps/dashboard/lib/mutations/rating-field.ts` | 모드 → `mmr`/`aramMmr` 필드 이름 |
| `apps/dashboard/app/aram/page.tsx` | 1.2 서버 컴포넌트, force-dynamic |
| `apps/discord-bot/src/commands/mmr-aram.ts` | `/mmr-aram` |

**수정**

| 파일 | 무엇을 |
|---|---|
| `packages/db/prisma/schema.prisma` | `GameMode` enum, `Member.aramMmr`, `GameResult.mode` |
| `apps/dashboard/lib/mutations/save-game-result.ts` | `mode` 입력, `ratingField`로 분기 |
| `apps/dashboard/lib/mutations/cancel-game-result.ts` | 되돌릴 필드, "최근 경기" 판정을 모드로 한정 |
| `apps/dashboard/lib/mutations/reset-ratings.ts` | `aramMmr`도 함께 리셋 |
| `apps/dashboard/lib/mutations/save-replay-import.ts` | `mode` 입력 추가 |
| `apps/dashboard/lib/queries/linked-members.ts` | `LinkedMemberOption`에 `aramMmr`·`aramWins`·`aramLosses` |
| `apps/dashboard/lib/queries/members.ts` | `getMemberListData`에 `mode` 파라미터 |
| `apps/dashboard/components/MatchBuilder.tsx` | 모드 토글, 모드별 표시/계산 |
| `apps/dashboard/app/matches/actions.ts` | `mode` 전달 |
| `apps/dashboard/components/ReplayImportForm.tsx` | 모드 토글 |
| `apps/dashboard/app/replay-import/actions.ts` | `mode` 전달 |
| `apps/dashboard/components/AppShell.tsx` | `activeNav`에 `"aram"`, 회원 관리 그룹에 1.2 항목 |
| `apps/discord-bot/src/lib/get-member-rank.ts` | `field` 파라미터 추가 |
| `apps/discord-bot/src/index.ts` | 새 커맨드 등록 |
| `apps/discord-bot/src/deploy-commands.ts` | 새 커맨드 등록 |

## 테스트 전략

DB를 건드리는 테스트는 `DATABASE_URL_TEST` 가드로 시작한다.

**뮤테이션**

- `saveGameResult`: `mode: "ARAM"`으로 저장하면 `aramMmr`만 움직이고 `mmr`은 그대로다.
  역방향(`mode` 생략 시 기존 협곡 동작 그대로)도 확인한다.
- `cancelGameResult`: 칼바람 경기를 되돌리면 `aramMmr`만 되돌아간다. 협곡 경기 뒤에
  칼바람 경기가 있어도(또는 그 반대) 서로를 막지 않고 각자 자기 트랙에서 "최근"인지만 본다.
- `resetAllRatings`: 소프트·하드 리셋 뒤 `mmr`과 `aramMmr`이 둘 다 기대한 값이다.
- `saveReplayImport`: `mode`가 `saveGameResultTx`까지 전달된다.

**질의**

- `getMemberListData("ARAM", ...)`가 `aramMmr` 기준으로 정렬되고, 판/승/패가 칼바람
  경기만 센다(협곡 경기가 섞여 들어가지 않는다).
- `getLinkedMembers()`가 `aramMmr`·`aramWins`·`aramLosses`를 함께 실어 온다.

**화면**

`MatchBuilder`에서 모드를 바꿔도 명단·팀 배정이 그대로인지, 저장 후 올바른 트랙만
움직였는지 실제 화면에서 확인한다(기존 참가자 정보 유지 기능과 같은 화면).

## 마이그레이션

`aramMmr`과 `mode`에 각각 기본값(`1000`, `RIFT`)이 있으므로 별도 데이터 이관 스크립트는
필요 없다. 기존 회원은 칼바람 1000점에서 시작하고, 기존 경기 기록은 전부 협곡으로 분류된다.

## 남긴 것

- 리플레이 모드 자동판별. `.rofl`에 확실한 신호가 생기거나(예: 패치로 필드가 추가되거나)
  칼바람 샘플이 더 쌓여 `TEAM_POSITION` 휴리스틱의 오탐률을 검증할 수 있게 되면 다시
  검토한다.
- `/랭킹`, `/전적`의 칼바람 버전. 필요해지면 `/mmr-aram`과 같은 패턴(각 커맨드에
  `field`/`mode` 파라미터를 넓히는 것)으로 붙일 수 있다.
- 세 번째 이상의 게임 모드. 그때는 `Member`에 컬럼을 계속 늘리는 대신 모드를 키로 하는
  레이팅 테이블로 일반화하는 것을 검토해야 한다.
