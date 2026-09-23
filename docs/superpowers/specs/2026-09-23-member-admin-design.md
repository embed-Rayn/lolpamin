# 회원 관리 페이지(`/member-admin`)와 모스트 챔피언 설계

날짜: 2026-09-23

## 목표

1. 편집을 운영자 전용 페이지로 모은다. `/member-info`는 누구나 보는 읽기전용 뷰어가 된다.
2. 티어를 둘로 나눈다 — 기존 "현재티어"는 **산정티어**(팀빌더 점수의 근거), 새로 **최고티어**(참고용).
3. 회원별 **모스트 챔피언 3개**를 Riot 숙련도로 보여준다. 회원에게 붙은 모든 라이엇 계정의 숙련도 점수를 합산한다.

## 이미 있는 것 (캡틴 드래프트 작업에서 먼저 들어옴)

숙련도 백엔드는 `2026-09-23-matches-captain-draft-design.md` 작업이 먼저 만들었다. 이 작업은 그것을 그대로 쓴다.

| 것 | 위치 |
|---|---|
| 계정 단위 숙련도 캐시 `ChampionMastery(riotAccountId, championId, level, points)`, 계정 삭제 시 cascade | `packages/db/prisma/schema.prisma` (7d46c80) |
| `SiteSetting.masteryRefreshedAt` | 같은 커밋 |
| `lookupChampionMasteries(puuid)` | `apps/dashboard/lib/riot-api/mastery.ts` (2c32d09) |
| `refreshChampionMasteries`, `getMasteryRefreshAvailability`, `REFRESH_MASTERIES_ERRORS` | `apps/dashboard/lib/mutations/refresh-champion-masteries.ts` (e90f2be) |
| 합산 상위 N `topMasteries(entries, n = 3)` | `packages/core/src/mastery.ts` |
| 숫자 championId → ddragon id `championIdByKey`, 아이콘 `championIcon`, 이름 `championName` | `apps/dashboard/lib/ddragon/assets.ts` |

그쪽 스펙은 "갱신 버튼은 `/matches`가 아니라 다른 화면에 따로 만든다(범위 밖)"고 적었다 — 그 화면이 `/member-admin`이다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 새 페이지 경로 | `/member-admin` (사이드바 운영 관리 그룹 "회원 관리"). `/members`는 이미 `/rift`로 가는 308 영구 리다이렉트라 브라우저 캐시에 남아 있어 재사용하지 않는다. 리다이렉트는 그대로 둔다 |
| 접근 | 다른 운영 화면과 같이 비로그인이면 `/login`으로 보낸다. 모든 액션은 `requireAdmin()` |
| 산정티어 | `Member.tier` 컬럼 그대로, UI 라벨만 "산정티어". 팀빌더 점수 기준 불변 |
| 최고티어 | `Member.peakTier MemberTier @default(UNRANKED)` 신규. 관리자 수동 입력. 점수에 쓰지 않는다 |
| 순번 | 저장하지 않는다. 현재 정렬 기준의 행 번호(1, 2, 3…) |
| 나이 | `Member.age`(모임 표기의 출생연도 두 자리, 임포트가 닉네임에서 채움)를 편집한다. 화면의 나이는 두 페이지 모두 `age`가 있으면 그것, 없으면 카톡 닉네임에서 읽은 출생연도 |
| 부라인 | 유지. `/member-admin`에도 편집 컬럼을 둔다 |
| 비고 | `/member-info`에서 제거, `/member-admin`에서만 보고 편집 |
| 모스트 챔피언 | 상위 3개, 챔피언 아이콘(hover: 한글 이름·합산 점수). `/member-info`·`/member-admin` 둘 다 |
| 버튼 제한 | "PUUID로 라이엇 ID 갱신", "모스트 챔피언 갱신" 각각 24시간에 한 번. 근거는 기존 `SiteSetting` 두 시각 |

## 데이터 모델

추가는 한 컬럼뿐이다.

```prisma
model Member {
  tier     MemberTier @default(UNRANKED)  // 화면 이름: 산정티어
  peakTier MemberTier @default(UNRANKED)  // 최고티어
}
```

### 나이

`Member.age`는 이미 있는 컬럼이고 임포트가 `이름/출생연도/…`의 두 번째 조각을 숫자로 넣는다(예: `94`).
`/member-info`는 지금 `age`를 보지 않고 닉네임에서 매번 읽는다 — 닉네임이 바뀌면 따라가게 하려는 것이었다.
하지만 출생연도는 매칭 키의 일부라 이름을 바꿔도 변하지 않고, 이제 관리자가 손으로 고칠 수 있어야 하므로
**`age`가 있으면 그것을 우선**한다. 두 자리 → 네 자리 변환은 `kakaoBirthYear`의 규칙(`< 30`이면 2000년대)을
`packages/core`의 `fullBirthYear(year)`로 떼어 같이 쓴다. 입력은 `94`, `01`, `1994`를 받고 두 자리로 저장한다.
빈 값은 null(닉네임에서 읽은 값으로 돌아감).

## 화면

### `/member-info` (읽기전용)

- 모든 편집 UI를 뺀다. 관리자로 로그인해도 편집 UI가 없다. `isAdmin` prop 제거.
- 컬럼: 이름 · 나이 · 협곡 MMR/판/승/패/승률 · 칼바람 MMR/판/승/패/승률 · 최고티어 · 산정티어 · 주라인 · 부라인 ·
  라이엇 계정 · 모스트3. 비고 제거.
- 정렬 키에 `peakTier` 추가(`tier`와 같은 점수 기준).
- 모바일 `MemberInfoCard`: 최고/산정티어, 모스트3 추가, 비고 제거.
- `app/member-info/actions.ts`의 액션들(라인·비고·라이엇 계정)은 `app/member-admin/actions.ts`로 옮긴다.

### `/member-admin` (운영자)

- `AppShell desktopOnly`, `dynamic = "force-dynamic"`, 대상은 활성 회원(`mergedIntoId: null`) 전원.
- 컬럼(순서대로):

  | 컬럼 | 편집 | 구현 |
  |---|---|---|
  | 순번 | ✗ | 행 번호 |
  | 이름 | ✓ | 기존 `MemberRealNameCell` / `updateMemberRealName` |
  | 나이 | ✓ | **신규** `MemberAgeCell` / `updateMemberAge` |
  | 최고티어 | ✓ | `MemberTierCell`에 `field` prop 추가, **신규** `updateMemberPeakTier` |
  | 산정티어 | ✓ | 기존 `updateMemberTier` |
  | 주라인 / 부라인 | ✓ | 기존 `MemberLaneCell` |
  | 라이엇 계정 | ✓ 추가·삭제 | 기존 `MemberRiotAccountsCell` |
  | 모스트3 | ✗ | 표시만 |
  | 최근 활동 날짜 | ✓ | 기존 `InactiveLastActiveCell` / `updateMemberLastActive` |
  | 활동일 | ✗ | `lastActiveAt ?? createdAt`에서 지금까지 일수(`getInactiveMembers`와 같은 계산), `D+N` |
  | 비고 | ✓ | 기존 `MemberNoteCell` |

- 정렬: 이름·나이·최고티어·산정티어·최근 활동 날짜 — URL `sort`/`dir`. 기본 이름 오름차순.
- 상단 버튼 두 개(`DailyRefreshButton`, 종류별로 한 컴포넌트):
  - **PUUID로 라이엇 ID 갱신** — 기존 `riotIdRefreshStatusAction`/`refreshRiotIdsAction` 재사용. `/link-accounts`의
    버튼도 같은 컴포넌트로 바꿔 남긴다(같은 `riotIdRefreshedAt`을 보므로 한도는 하나).
  - **모스트 챔피언 갱신** — 신규 `masteryRefreshStatusAction`/`refreshMasteriesAction`이 `refreshChampionMasteries` 호출.
  - 누르면 상태를 먼저 묻고, 제한 중이면 마지막 실행 시각과 함께 안내, 아니면 확인창 → 실행 → 결과 요약.

## revalidate

편집 액션은 기존 경로에 `/member-admin`, `/member-info`를 더한다. 티어는 `/team-builder`도.
라이엇 계정 추가·삭제는 기존처럼 `/matches`도. 모스트 갱신·ID 갱신: `/member-admin`, `/member-info`, `/link-accounts`.

## 테스트

- `packages/core`: `fullBirthYear`, `parseBirthYearInput`.
- 통합(DB): `updateMemberPeakTier`, `updateMemberAge`, `getMemberAdminRows`(모스트 합산, 활동일, 정렬, 묘비 제외),
  `getMemberInfoListData`(peakTier·모스트·age 우선).

## 범위 밖

- 디스코드 봇 표시 변경 없음. `/rift`의 티어 셀도 그대로.
- 숙련도 자동 주기 갱신(크론) 없음 — 버튼으로만.
- 최고티어 자동 추정 없음.
