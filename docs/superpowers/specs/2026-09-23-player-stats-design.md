# 플레이어 통계 화면 설계

날짜: 2026-09-23
참고 이미지: `sample/player_stat.png` (커밋하지 않음)

## 목표

회원 한 명 한 명의 **협곡 내전** 결과를 포지션별로 모아 보여준다. 참고 이미지는 관리자가 엑셀로
손으로 만들던 표다 — 회원마다 포지션 5행(TOP/JUG/MID/AD/SUP) × 판·승·패·평균 K/D/A·KDA·승률·
평균 피해량·평균 받은 피해·평균 골드, 그리고 옆에 "내전 주 챔피언 ×N회". 이것을 리플레이 데이터로
자동 계산한다.

사이드바의 비활성 항목 `플레이어 통계`(`AppShell.tsx`, `key: "player-stats"`)를 이 화면으로 활성화한다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 페이지 구조 | `/player-stats` 한 페이지. 목록/상세 분리 없음 |
| 모드 | 협곡(RIFT)만 |
| 집계 대상 | 취소되지 않은 RIFT 경기에서 `GameParticipant.replayPuuid`가 있는 참가 기록 — 리플레이 스탯이 있는 판만. 손 입력 판은 포지션·KDA가 없어 빠지므로 `/rift`의 판수와 다를 수 있다 |
| 기간 | `?period=season`(기본, 마지막 리셋 이후 — `getCountedGameFilter`) / `?period=all`(취소만 제외). 알 수 없는 값은 `season` |
| 멤버 필터 | 뽑기 화면(`CandidateSetup`)과 같은 모양의 칩 그리드. 검색·전체 선택·전체 해제. 첫 진입은 **전원 선택**. 선택 상태는 브라우저 메모리에만 — 저장하지 않는다 |
| 접기 | 멤버 블록마다 헤더 클릭으로 접기. 기본 펼침. 상단에 "모두 접기 / 모두 펼치기" |
| 정렬 | 칩·블록 모두 이름순(`localeCompare(…, "ko")`) |
| 블록 레이아웃 | 시안 A — 왼쪽 포지션 표(5행 + 합계), 오른쪽 주 챔피언 패널 |
| 권한 | 공개 읽기 화면. 로그인 불필요 |
| 모바일 | 지원(읽기 화면). `md` 미만은 표 대신 포지션 카드 |

## 계산 규칙

모두 `packages/core/src/player-stats.ts`의 순수 함수.

- **포지션 매핑** — 리플레이 `position` → `Lane`: `TOP→TOP`, `JUNGLE→JUG`, `MIDDLE→MID`,
  `BOTTOM→AD`, `UTILITY→SUP`. 그 밖의 값(빈 문자열 포함)은 `null` — 합계 행과 챔피언 집계에는
  들어가고 포지션 행에는 들어가지 않는다.
- **승패** — 참가자 `team`이 `GameResult.winner`와 같으면 승.
- **평균** — 판당 평균: K, D, A, 피해량(`damageDealt`), 받은 피해(`damageTaken`), 골드(`gold`).
- **KDA** — `(K합 + A합) / D합`. D합이 0이면 `null`(화면에 "Perfect"). 판당 평균으로 나눠도
  비율은 같다(참고 이미지: (7.2+6.83)/5.5 = 2.55).
- **승률** — `wins / games`. 판이 0이면 `null`.
- **포지션 행** — 5개 모두 항상 존재. 0판이면 `null`(화면에 흐린 "–").
- **합계 행** — 모든 판(포지션 없는 판 포함)의 같은 계산.
- **주 챔피언** — `champion`(리플레이 SKIN)별 판·승. 판 내림차순, 동률이면 승 내림차순, 그다음
  챔피언 id 오름차순. 상위 5개.
- **최고값 강조** — 판이 1 이상인 포지션이 **2개 이상**일 때만. 열별(승률, KDA, 피해량, 받은
  피해, 골드) 최댓값인 포지션을 표시한다. 동률이면 모두 표시. KDA `null`(Perfect)은 최댓값으로 본다.

## 데이터 흐름

`apps/dashboard/lib/queries/player-stats.ts`

```
getPlayerStats(prisma, period) → PlayerStatsMember[]
```

1. 기간 조건: `season` → `getCountedGameFilter(prisma)`, `all` → `{ cancelledAt: null }`.
2. 활성 회원(`mergedIntoId: null`) 전부 — 이름은 `getDisplayName`.
3. `GameParticipant` where `replayPuuid != null` AND `gameResult: { mode: RIFT, ...기간 조건 }`,
   `gameResult.winner`와 `gameResult.replayStats`(puuid 일치 행) 포함.
4. 참가 기록마다 같은 경기의 `ReplayPlayerStat` 중 `puuid === replayPuuid`인 행을 찾는다. 없으면
   (데이터 이상) 건너뛴다.
5. 회원별로 묶어 `aggregatePlayerStats`에 넘기고, 0판 회원도 빈 결과로 포함. 이름순 정렬.

흡수된 회원의 판은 `absorbMember`가 `GameParticipant.memberId`를 생존자로 옮겨 두므로 따로 할
일이 없다.

## 화면

`app/player-stats/page.tsx` — `force-dynamic`, `period` 파싱, 쿼리 호출, `AppShell` 안에
`PlayerStatsScreen` 렌더.

`components/player-stats/`

| 컴포넌트 | 역할 |
|---|---|
| `PlayerStatsScreen.tsx` (client) | 선택 집합(초기 전원), 접힌 집합, 기간 토글 링크, 모두 접기/펼치기. 선택된 회원만 이름순으로 블록 렌더 |
| `MemberPicker.tsx` (client) | 검색 입력 + 전체 선택/해제 + 칩 그리드(`md`:8열, 모바일 3열). 칩에 해당 기간 판수. 0판 칩은 흐리게 |
| `PlayerStatBlock.tsx` | 헤더(이름, `N전 W승 L패 · 승률`, 접기 토글). 펼치면 데스크톱 표(`hidden md:block`) + 모바일 카드(`md:hidden`) + 주 챔피언 패널. 0판 회원은 "기록 없음" 한 줄 |

- 색은 스킨 토큰만(`bg-surface`, `text-muted`, `border-ink/[.06]`, `bg-accent-tint`,
  `text-accent-soft` …). 강조는 `text-accent-soft font-bold`.
- 숫자: 평균 K/D/A 소수 1자리, KDA 소수 2자리, 피해·골드 정수 천 단위 쉼표, 승률 정수 `%`.
- 챔피언 아이콘은 `championIcon` / `championName`(`lib/ddragon/assets.ts`). 모르는 id는 빈 칸.
- 모바일 포지션 카드: 1줄 포지션·판·승률·KDA, 2줄 K/D/A·피해·골드.

## 테스트

- `packages/core/src/player-stats.test.ts` — 포지션 매핑과 미지 포지션, 평균/KDA/Perfect, 승률,
  빈 포지션 `null`, 합계 행, 챔피언 순위와 5개 제한, 최고값 강조(1개 포지션일 때 없음, 동률).
- `apps/dashboard/lib/queries/player-stats.test.ts` (DB, `DATABASE_URL_TEST` 가드) — `season`은
  리셋 이전 판 제외 / `all`은 포함, 취소 판 제외, ARAM 제외, `replayPuuid` null 제외, 0판 회원
  포함, 묘비(`mergedIntoId` 있는 행) 제외, 이름순.

## 범위 밖

- 칼바람 통계, 챔피언 통계 화면(`champion-stats`는 비활성 그대로).
- 선택 상태의 URL/스토리지 저장.
- 손 입력 판의 보강.
