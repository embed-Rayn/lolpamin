# 회원 관리 페이지(`/member-admin`)와 모스트 챔피언 설계

날짜: 2026-09-23

## 목표

1. 편집을 운영자 전용 페이지로 모은다. `/member-info`는 누구나 보는 읽기전용 뷰어가 된다.
2. 티어를 둘로 나눈다 — 기존 "현재티어"는 **산정티어**(팀빌더 점수의 근거), 새로 **최고티어**(참고용).
3. 회원별 **모스트 챔피언 3개**를 Riot 숙련도로 보여준다. 회원에게 붙은 모든 라이엇 계정의 숙련도 점수를 합산한다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 새 페이지 경로 | `/member-admin` (사이드바 "회원 관리"). `/members`는 이미 `/rift`로 가는 308 영구 리다이렉트라 브라우저 캐시에 남아 있어 재사용하지 않는다. 리다이렉트는 그대로 둔다 |
| 산정티어 | `Member.tier` 컬럼 그대로, UI 라벨만 "산정티어". 팀빌더 점수 기준 불변 |
| 최고티어 | `Member.peakTier MemberTier @default(UNRANKED)` 신규. 관리자 수동 입력(Riot API는 역대 최고 티어를 주지 않는다). 점수에 쓰지 않는다 |
| 순번 | 저장하지 않는다. 현재 정렬 기준의 행 번호(1, 2, 3…) |
| 부라인 | 유지. `/member-admin`에도 편집 컬럼을 둔다 |
| 비고 | `/member-info`에서 제거, `/member-admin`에서만 보고 편집 |
| 모스트 챔피언 | 상위 3개, 챔피언 아이콘(hover: 한글 이름·합산 점수). `/member-info`·`/member-admin` 둘 다 |
| 숙련도 저장 단위 | 회원이 아니라 **계정** 단위 원본. 합산은 읽을 때 |
| 버튼 제한 | "PUUID로 라이엇 ID 갱신", "모스트 챔피언 갱신" 각각 24시간에 한 번. 근거는 `SiteSetting` |

## 데이터 모델

```prisma
model Member {
  // ...
  tier     MemberTier @default(UNRANKED)  // 화면 이름: 산정티어
  peakTier MemberTier @default(UNRANKED)  // 최고티어
}

// 한 라이엇 계정의 챔피언별 숙련도 점수. 회원이 아니라 계정에 붙이는 이유는 흡수·해제·
// 계정 삭제·재배정 때 RiotAccount가 회원 사이를 옮겨 다니기 때문 — 계정에 붙어 있으면
// 모스트가 별도 동기화 없이 따라간다.
model RiotAccountMastery {
  riotAccountId String
  riotAccount   RiotAccount @relation(fields: [riotAccountId], references: [id], onDelete: Cascade)
  championId    Int
  points        Int

  @@id([riotAccountId, championId])
}

model SiteSetting {
  // ...
  riotIdRefreshedAt  DateTime?
  masteryRefreshedAt DateTime?  // 모스트 챔피언 갱신의 하루 한 번 근거
}
```

`onDelete: Cascade`인 이유: 숙련도는 계정의 파생 데이터라 계정 없이 의미가 없다. `RiotAccount.memberId`의
`Restrict`와는 반대 방향의 관계라 충돌하지 않는다 — `deleteMember`가 계정을 지우면 숙련도도 같이 지워진다.

## 모스트 챔피언

### 조회

`apps/dashboard/lib/riot-api/mastery.ts` — `lookupChampionMasteries(puuid)`:
`GET https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` (전체 목록).
합산하려면 계정별 상위 N이 아니라 전체가 필요하다 — 계정마다 1위가 달라도 합산 1위는 어느 계정의 상위권에도
없을 수 있다. 결과 모양·실패 사유(`not_found`/`unauthorized`/`rate_limited`/`unavailable`)는
`account.ts`와 같다. 응답에서 `championId`, `championPoints`만 쓴다.

### 갱신

`apps/dashboard/lib/mutations/refresh-masteries.ts` — `refreshMasteries(prisma, lookup, now)`:

1. `SiteSetting.masteryRefreshedAt`이 24시간 이내면 즉시 거부(남은 시간 반환).
2. 대상: `memberId != null`이고 `puuid`가 있는 `RiotAccount`.
3. 계정마다 조회 → 성공하면 트랜잭션으로 그 계정의 기존 행 삭제 + 새 행 `createMany`.
   `not_found`는 그 계정만 건너뛴다. 첫 `unauthorized`에서 중단한다.
4. 호출을 한 번이라도 쓴 실행만 `masteryRefreshedAt = now`를 남긴다 — `refreshRiotAccountIds`와 같은 규칙.
   대상이 없거나 키가 죽어 첫 호출에서 멈춘 실행이 하루를 잡아먹으면 키를 고친 뒤 다시 못 돌린다.
5. 결과: `{ refreshed, skipped, stoppedBy: null | "unauthorized" | "rate_limited" }`.

중간에 멈춰도 이미 갱신된 계정은 그대로 둔다. 남은 계정은 다음 실행(24시간 뒤)에 갱신된다.

### 합산

`packages/core/src/top-mastery.ts` — `topMasteryChampions(rows: {championId, points}[], n = 3)`:
championId별 points 합 → 내림차순, 동점은 championId 오름차순 → 상위 n개 `{championId, points}`.
회원에게 계정이 없거나 숙련도 행이 없으면 빈 배열(화면은 `-`).

쿼리는 활성 회원의 `riotAccounts.masteries`를 함께 읽어 이 함수에 넘긴다. 약 40명 × 계정 1~3개 × 챔피언 170여 개
— 한 번에 읽어도 문제없는 크기라 DB 집계를 쓰지 않는다.

### 아이콘

숙련도 API는 숫자 `championId`를 주는데 `ddragon-map.json`은 문자열 id(`Aatrox`)로만 키가 있다.
`scripts/sync-ddragon.ts`가 `champion.json`의 `key` 필드로 `championKeys: { "266": "Aatrox", … }`를 함께
만들도록 확장하고 한 번 다시 돌린다. 모르는 id는 기존 규칙대로 빈 칸이다.

## 화면

### `/member-info` (읽기전용)

- 모든 편집 셀(`MemberTierCell`·`MemberLaneCell`·`MemberRiotAccountsCell`·`MemberNoteCell`·실명/Riot ID 셀)의
  편집 모드를 쓰지 않는다. 관리자로 로그인해도 편집 UI가 없다. `isAdmin` 분기 제거.
- 컬럼: 이름 · 나이 · 협곡 MMR/판/승률 · 칼바람 MMR/판/승률 · 최고티어 · 산정티어 · 주라인 · 부라인 ·
  라이엇 계정 · 모스트3. 비고 제거.
- 정렬 키에 `peakTier` 추가(`tier`와 같은 enum 순서 기반).
- 모바일 `MemberInfoCard`도 같은 항목(최고/산정티어, 모스트3), 비고 없음.
- `app/member-info/actions.ts`의 액션들은 `/member-admin/actions.ts`로 옮긴다.

### `/member-admin` (운영자)

- `AppShell desktopOnly`, `dynamic = "force-dynamic"`. 비로그인도 페이지는 열리지만 편집 UI는 관리자만
  (기존 셀 컴포넌트의 `isAdmin` 동작 그대로), 모든 액션은 `requireAdmin()`.
- 대상: 활성 회원(`mergedIntoId: null`) 전원.
- 컬럼(순서대로):

  | 컬럼 | 편집 | 구현 |
  |---|---|---|
  | 순번 | ✗ | 행 번호 |
  | 이름 | ✓ | 기존 `update-member-real-name` |
  | 나이 | ✓ | **신규** `update-member-age` (정수 1~99 또는 빈 값 → null) |
  | 최고티어 | ✓ | **신규** `update-member-peak-tier` (`MemberTierCell`에 필드 prop 추가해 재사용) |
  | 산정티어 | ✓ | 기존 `update-member-tier` |
  | 주라인 / 부라인 | ✓ | 기존 `update-member-lane` |
  | 라이엇 계정 | ✓ 추가·삭제 | 기존 `registerRiotAccount`/`removeRiotAccount` |
  | 모스트3 | ✗ | 표시만 |
  | 최근 활동 날짜 | ✓ | 기존 `update-member-last-active` |
  | 활동일 | ✗ | `lastActiveAt ?? createdAt`에서 오늘까지 일수, `D+N` |
  | 비고 | ✓ | 기존 `update-member-note` |

- 정렬: 이름·나이·최고티어·산정티어·최근 활동 날짜(=활동일) — URL `sort`/`dir`, `/member-info`와 같은 방식.
  기본은 이름 오름차순.
- 상단 버튼 두 개:
  - **PUUID로 라이엇 ID 갱신** — 기존 `refreshRiotAccountIds` 액션 재사용. `/link-accounts`의 버튼도 남긴다(같은
    `riotIdRefreshedAt`을 보므로 어느 쪽에서 눌러도 한도는 하나).
  - **모스트 챔피언 갱신** — `refreshMasteries`.
  - 제한 중이면 비활성 + "N시간 M분 후 가능". 실행 후 결과 요약(갱신 N / 건너뜀 N / 중단 사유) 표시.
- 사이드바 운영 그룹에 "회원 관리"(`activeNav="member-admin"`).

## revalidate

편집 액션: `/member-admin`, `/member-info`. 티어 변경은 `/team-builder`도. 라이엇 계정 추가·삭제는 기존처럼
`/matches`도. 모스트 갱신: `/member-admin`, `/member-info`.

## 테스트

- `packages/core`: `topMasteryChampions` — 여러 계정 합산, 동점 정렬, n 미만, 빈 입력.
- 통합(DB): `refreshMasteries` — 24시간 제한, 호출 없는 실행은 시각 미기록, `unauthorized` 중단 시 앞 계정 반영,
  `not_found` 건너뜀, 재실행 시 기존 행 교체. `update-member-age`, `update-member-peak-tier`.
  계정 삭제 시 숙련도 cascade. 흡수 후 생존자 쿼리에 흡수 대상 계정의 숙련도가 합산되는지.
- `/member-info` 쿼리: `peakTier` 정렬, 모스트3 포함.

## 범위 밖

- 디스코드 봇 표시 변경 없음.
- 숙련도 자동 주기 갱신(크론) 없음 — 버튼으로만.
- 최고티어 자동 추정(League-V4 현재 티어로 올리기) 없음.
