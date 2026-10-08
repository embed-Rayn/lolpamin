# 챔피언 통계 (`/champion-stats`) 설계

날짜: 2026-10-08

## 목적

내전에서 어떤 챔피언이 얼마나 나왔고 성적이 어땠는지를 본다. 기본은 챔피언별 전체 성적이고,
챔피언 행을 펼치면 그 챔피언을 한 회원별 성적이 나온다. 회원을 골라 좁혀 볼 수 있다.

## 확정한 요구사항

- 챔피언 표가 기본, 챔피언을 펼치면 회원별 줄.
- 회원 필터: 기본 **전체 선택**, 접힌 확장 바를 펼쳐 회원 선택(`/player-stats`의 `MemberPicker`).
- 정렬: 기본 **많이 나온 순**(판수 내림차순), 그 외 **KDA 높은 순 / 낮은 순**.
- 집계 대상은 **회원만**. 외부인(회원에게 붙지 않은 계정)은 빠진다.
- 모드는 **협곡 / 칼바람 탭**(`?mode=RIFT|ARAM`, 기본 협곡). 섞지 않는다.
- 라인 필터는 없다. 회원별 줄에 그 회원의 주 라인을 표시한다(협곡만).
- 데이터는 리플레이로 등록한 판(`ReplayPlayerStat`)만. 손 입력 판은 스탯이 없어 빠진다.
- 밴 정보는 저장된 곳이 없어 다루지 않는다.

## 접근 방식

서버는 (회원, 챔피언) 단위 **합계**를 넘기고, 브라우저가 선택한 회원으로 챔피언 표를 다시 계산한다.
회원 40명 × 챔피언 수십 개라 페이로드가 작고, 선택을 바꿀 때 서버 왕복이 없다. `/player-stats`와
같은 구조다. 회원 선택은 URL에 싣지 않는다(공유 불가, 의도적).

검토 후 버린 안: 회원 선택을 URL(`?members=…`)에 싣고 서버 집계 — URL이 길고 체크마다 왕복.
원본 경기 행을 통째로 넘기기 — 페이로드만 커지고 얻는 게 없다.

## 1. 데이터 — `apps/dashboard/lib/queries/champion-stats.ts`

```ts
export type ChampionStatsMode = "RIFT" | "ARAM";
export function parseChampionStatsMode(value: string | undefined): ChampionStatsMode; // "ARAM" 외 전부 RIFT

export async function getChampionStats(
  prisma: PrismaClient,
  period: PlayerStatsPeriod,
  mode: ChampionStatsMode,
  now?: Date,
): Promise<{ members: { id: string; name: string; games: number }[]; lines: MemberChampionLine[] }>;
```

- 기간 필터는 `getPlayerStats`와 같다: `season` → `getCountedGameFilter`(리셋 기준선),
  `year` → `seoulYearRange(now)`의 `playedAt` 범위, `all` → `cancelledAt: null`.
  `parsePlayerStatsPeriod`를 재사용한다. 공통 부분(기간 → where 조건)은 `player-stats.ts`에서
  함수로 빼서 둘이 같이 쓴다.
- `GameParticipant`(`replayPuuid` not null, `gameResult: { mode, ...기간 }`)를 읽고, 그 판의
  `replayStats`에서 `puuid === replayPuuid`인 행을 찾는다. 없으면 건너뛴다(불일치 데이터, 크래시 아님).
  참가자가 출발점이므로 외부인은 자연히 빠지고, 흡수된 회원은 `GameParticipant.memberId`가
  생존자로 옮겨져 있어 따로 처리하지 않는다.
- 승패는 `participant.team === gameResult.winner`.
- `members`: 그 기간·모드에 한 판 이상 뛴 병합 안 된 회원. `name`은 `getDisplayName`,
  `games`는 그 회원의 판수(선택기 칩에 표시). 이름 가나다순.
- `lines`: (회원, 챔피언)마다 하나. **평균이 아니라 합계**를 담는다 — 브라우저에서 여러 회원을
  더해도 정확해야 하므로.

## 2. 순수 집계 — `packages/core/src/champion-stats.ts`

```ts
export interface MemberChampionLine {
  memberId: string;
  champion: string;
  games: number;
  wins: number;
  kills: number;    // 합계
  deaths: number;
  assists: number;
  lanes: Partial<Record<Lane, number>>; // 라인별 판수; 칼바람은 빈 객체
}

export type ChampionSort = "games" | "kdaDesc" | "kdaAsc";

export interface ChampionMemberRow extends ChampionAverages { memberId: string; mainLane: Lane | null; }
export interface ChampionRow extends ChampionAverages { champion: string; members: ChampionMemberRow[]; }
// ChampionAverages = { games, wins, losses, winRate (0–1), kills, deaths, assists (판당 평균), kda: number | null }

export function aggregateChampionStats(
  lines: MemberChampionLine[],
  selectedIds: ReadonlySet<string>,
  sort: ChampionSort,
): ChampionRow[];
```

- 선택된 회원의 줄만 챔피언별로 합친다. 빈 선택 → `[]`.
- KDA = (K+A)/D, 데스 합 0이면 `null`("Perfect") — `StatLine`과 같은 규칙.
- `mainLane`: 그 회원이 그 챔피언으로 가장 많이 간 라인. 동률은 `PLAYER_STAT_LANES` 순서.
  라인 기록이 없으면(칼바람) `null`. 포지션 → 라인 변환은 `replayPositionToLane` 재사용(쿼리 쪽).
- 정렬:
  - `games`: 판수 내림차순 → 승수 내림차순 → 챔피언 id 오름차순.
  - `kdaDesc`: KDA 내림차순, Perfect가 맨 위. 동률은 판수 내림차순 → 챔피언 id.
  - `kdaAsc`: KDA 오름차순, Perfect가 맨 아래. 동률은 판수 내림차순 → 챔피언 id.
  - 챔피언 안의 회원 줄은 정렬과 무관하게 판수 내림차순 → 승수 → `memberId`.

## 3. 화면

### 페이지 `apps/dashboard/app/champion-stats/page.tsx`

- `export const dynamic = "force-dynamic"`. 로그인 불필요, 모바일 지원(`desktopOnly` 아님).
- `AppShell activeNav="champion-stats" pageTitle="챔피언 통계"
  pageDesc="회원 내전 · 리플레이로 등록한 판 기준 챔피언별 전적"`.
- `AppShell.tsx`의 비활성 「챔피언 통계」 항목에 `href: "/champion-stats"`를 붙이고 `disabled`를 뗀다.
  `activeNav` 유니온에 `"champion-stats"` 추가.
- 화면 컴포넌트를 `key={`${mode}:${period}`}`로 마운트 — 모드·기간이 바뀌면 선택이 전체로 초기화된다.

### 화면 `apps/dashboard/components/champion-stats/ChampionStatsScreen.tsx` (client)

- **모드 탭** `협곡 | 칼바람`, **기간 탭** `{올해}년 | 이번 시즌 | 전체` — URL 링크.
  기본값(RIFT, year)은 파라미터를 생략한 링크.
- **정렬 버튼** `많이 나온 순 | KDA 높은 순 | KDA 낮은 순` — 브라우저 상태. URL에 두면 바꿀 때마다
  서버를 거쳐 회원 선택이 풀린다. 세그먼트 버튼이라 PC·모바일 공통.
- **회원 선택 바** — 기본 접힘. 「회원 선택 · 전체 N명 ▾」 / 일부만 고르면 「K명 선택 ▾」.
  펼치면 기존 `MemberPicker`(검색·붙여넣기 명단·전체 선택/해제)를 그대로 쓴다.
- 선택·정렬·펼침 상태는 브라우저 메모리만. 새로고침하면 전체 선택·많이 나온 순·모두 접힘.

### PC 표 (`hidden md:block`)

| # | 챔피언 | 판수 | 승률 | KDA | K / D / A | ▸ |
|---|---|---|---|---|---|---|

- 챔피언 칸: `championIcon` + `championName`. 모르는 id는 빈 아이콘 + 원본 id.
- 승률 칸: `58%` + `7승 5패`. 포맷은 `lib/player-stats/format.ts` 재사용.
- ▸로 펼치면 바로 아래에 회원별 줄: 이름, 주 라인(협곡만, `laneLabel`), 판수, 승률, KDA, K/D/A.

### 모바일 카드 (`md:hidden`)

- 카드: 순위, 아이콘, 이름, 판수, 승률, KDA. 탭하면 회원별 목록이 카드 안에 펼쳐진다.

### 빈 상태

- 선택한 회원 없음: 「선택한 회원이 없습니다.」
- 해당 기간·모드에 판 없음: 「이 기간에 리플레이로 등록한 판이 없습니다.」 (회원 선택 바도 숨김)

## 4. 오류 처리

- 잘못된 `?mode=`는 RIFT, 잘못된 `?period=`는 year. 파라미터로 오류 화면이 나는 경로는 없다.
- 스탯 행이 없는 참가자는 건너뛴다.
- 취소된 판은 기간 필터에서 빠진다.

## 5. 테스트

- `packages/core/src/champion-stats.test.ts`: 여러 회원 합산, 선택 필터, 빈 선택 → `[]`,
  판수 정렬·동률, KDA 높은/낮은 순과 Perfect 위치, 주 라인 동률 → 라인 순서,
  라인 기록 없음 → `mainLane` null, 회원 줄 정렬.
- `apps/dashboard/lib/queries/champion-stats.test.ts` (실 DB, `DATABASE_URL_TEST` 가드 +
  `resetDatabase`): 모드 분리(칼바람 판이 협곡에 안 섞임), 기간 year/season/all,
  외부인 제외, 취소된 판 제외, 흡수된 회원은 생존자로 집계, 합계가 평균이 아님.
  `parseChampionStatsMode` 기본값.
- 화면은 컴포넌트 테스트 없이 수동 확인(`/player-stats`와 동일).

## 6. 문서

- CLAUDE.md: `/player-stats` 문단 뒤에 `/champion-stats` 한 단락 — 리플레이 판만, 회원만,
  모드 분리, 회원 선택·정렬은 브라우저 상태, 서버는 합계를 넘긴다.
- CLAUDE.md 「## Mobile」: 읽기 화면 목록에 `/champion-stats` 추가(9 → 10).

## 범위 밖

- 밴률(데이터 없음), 라인 필터, 회원 선택 URL 공유, 아이템·룬 통계, 손 입력 판 보강.
