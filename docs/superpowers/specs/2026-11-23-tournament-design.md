# 대회 페이지 (리그전) 설계

작성일 2026-11-23. 상태: 초안, 사용자 승인 대기.

## 목적

그룹 회원을 1~4팀으로 나눠 리그전을 치른다. 대회 기간 동안 한 화면에서 순위표, 대회 포스터·대진
이미지, 경기·스크림 기록을 보여 주고, 운영진은 같은 화면에서 `.rofl`을 올려 결과를 기록한다.
대회가 끝나면 **기능은 내리고 기록은 남긴다** — 대회 경기는 내전 기록·통계에 협곡 내전처럼 계속
보인다.

## 목표

- 사이드바 「이벤트」 그룹에 「대회」(`/tournament`) 메뉴. 공지사항 아래.
- 화면 순서:
  1. 순위표 — 팀 / 승 / 패 / 승점. 승 +3, 패 −1. **대회 경기만** 센다(스크림 제외).
  2. 이미지 — 운영진만 업로드·삭제·순서 변경. 누구나 봄.
  3. 경기 및 스크림 기록 — 대회·스크림 경기 목록. 종류 태그, 블루팀 vs 레드팀 이름, 승리팀, 날짜.
  4. (운영진만) `.rofl` 업로드 — 「대회 / 스크림」 선택, 블루·레드 측을 각각 1~4팀 중 하나에 매핑.
- 팀은 1~4팀 고정 4개, 이름은 운영진이 수정.
- 대회·스크림 경기는 **MMR에 반영하지 않는다**(변화 0). 그 외에는 협곡 내전과 같다:
  `/match-history`, `/player-stats`, `/champion-stats`, `/match-calendar`에 포함, 리플레이 스탯 저장,
  참가 회원 `lastActiveAt` 갱신.
- 대회 종료 후 운영진이 기능을 끌 수 있다. 꺼도 기록(경기·팀 이름·이미지)은 DB에 남는다.

## 비목표

- 대회 여러 개(시즌 2 등) 동시·연속 운영. 대회는 하나뿐이다.
- 외부 팀 상대 스크림. 스크림도 1~4팀끼리만.
- 팀 로스터 관리(어느 회원이 몇 팀인지 저장). 팀은 경기마다 측 매핑으로만 정해진다.
- 대진표 자동 생성, 일정 관리.
- 칼바람 모드 대회. 대회·스크림은 협곡(`RIFT`)뿐.

## 반목표 (돌아가도 실패인 것)

- 대회 경기 때문에 내전 MMR이 한 점이라도 움직이거나, 내전 「최근 경기 되돌리기」가 막히는 것.
- `/rift`·`/member-info`·디스코드 봇의 판/승/패에 대회 경기가 섞이는 것(점수는 그대로인데 판수만 늘어
  헷갈린다 — 0판 회원의 표시 MMR 0 규칙도 깨진다).
- 기능을 끄면 내전 기록에서 대회 경기가 사라지는 것.

## 접근 방식

| | 방식 | 장단 |
|---|---|---|
| **A (채택)** | `GameResult`에 `kind`(INTERNAL/TOURNAMENT/SCRIM)와 블루·레드 팀 FK 추가. 업로드는 기존 리플레이 저장 경로를 타되 MMR 변화 0. | 기록·통계·캘린더 화면이 그대로 대회 경기를 포함. 대신 MMR이 걸린 곳마다 `kind = INTERNAL` 조건이 필요 — 빠뜨리면 버그. 고칠 곳이 정해져 있어 테스트로 막는다. |
| B | 대회 전용 테이블에 따로 저장. | MMR 코드 무접촉. 하지만 「내전 기록에 포함」하려면 기록·통계 화면마다 두 테이블을 합쳐야 하고 리플레이 스탯 저장이 중복. 원하는 방향과 반대. |

사용자가 A를 골랐다.

## 데이터 모델

```prisma
enum GameKind {
  INTERNAL
  TOURNAMENT
  SCRIM
}

model GameResult {
  // ...기존 칸
  kind         GameKind @default(INTERNAL)
  blueTeamSlot Int?     // 1..4. INTERNAL이면 null, 아니면 둘 다 채움.
  redTeamSlot  Int?
}

// 1~4팀 이름. FK 없이 슬롯 번호로만 잇는다 — 행이 없는 슬롯은 기본 이름 「N팀」(계획 단계 결정:
// 시드 행이 필요 없어 테스트의 resetDatabase와 충돌하지 않는다). 이름을 바꿀 때 upsert.
model TournamentTeam {
  slot      Int      @id        // 1..4
  name      String
  updatedAt DateTime @updatedAt
  updatedById String?
}

// 대회 화면 이미지. EventImage/HomeBanner와 같은 Bytes 방식(5MB, png/jpg/webp/gif, 최대 20장).
model TournamentImage {
  id        String   @id @default(cuid())
  position  Int
  bytes     Bytes
  type      String
  createdAt DateTime @default(now())
}

model SiteSetting {
  // ...기존 칸
  tournamentEnabled Boolean @default(false)
}
```

- 기존 행은 전부 `INTERNAL`로 이행된다(기본값). 사용자 확인: 대회·스크림 경기를 내전으로 올린 적 없음 —
  재분류·백필 없음.
- 같은 팀을 양쪽에 매핑하는 것은 저장 시 거부(`blueTeamSlot !== redTeamSlot`).
- `GameParticipant`는 그대로. 대회 경기의 참가 행은 `mmrBefore = mmrAfter = 저장 시점의 현재 mmr`.

## 규칙: MMR과 분리

MMR에 닿는 곳은 전부 `kind: "INTERNAL"`로 거른다:

1. `lib/queries/counted-games.ts`를 둘로 나눈다. 지금 `playerStatsGameFilter`(player-stats.ts)가
   `?period=season`에서 `getCountedGameFilter`를 그대로 쓰고 `/champion-stats`도 그 함수를 쓰므로,
   기존 함수에 kind를 붙이면 통계에서 대회 경기가 빠진다.
   - 기준선만 거는 필터(취소 제외 + 리셋 이후) — 통계(`/player-stats`, `/champion-stats`)용, kind 무관.
   - 판/승/패 필터 = 위 + `kind: "INTERNAL"` — `/rift`, `/aram`, `/member-info`, `members.ts`의
     판/승/패, `linked-members`, `inactive`용.
   (`members.ts`의 `gameCount`는 삭제 확인용이라 워터마크를 안 쓰지만, 대회 경기도 삭제 대상이므로
   그대로 둔다.)
2. `apps/discord-bot/src/lib/get-game-count.ts`에 같은 조건.
3. `cancelGameResult`:
   - 내전 판: 「가장 최근」을 찾을 때 `kind: "INTERNAL"`만 본다 → 대회 경기가 내전 되돌리기 순서를 막지 않음.
   - 대회·스크림 판: `ratingField`·복원 루프를 통째로 건너뛰고 `cancelledAt`·`replayKey`만 정리.
     순서 제한(최근만)·리셋 기준선 제한도 없음 — MMR을 건드리지 않으니 근거가 없다. 흡수 가드도 불필요.
   - `game-history.ts`의 `canCancel`: 모드별 최신 판을 찾는 `groupBy`(`mode:createdAt` 키)를
     `kind: "INTERNAL"`로 한정한다 — 아니면 더 새 대회 판이 「최신」이 되어 내전 판 취소 버튼이 사라진다.
     대회·스크림 판은 살아 있으면 항상 가능.
   - 기능이 꺼져 있어도 대회·스크림 판 취소는 허용한다(내 판단: 잘못 올린 결과를 고치려고 페이지를
     다시 켤 필요가 없게. 꺼진 동안 순위표는 아무도 안 보니 바뀌어도 문제없다).
4. `saveGameResultTx`에 `kind` 입력. 비내전이면 delta 0, 회원 `mmr` 갱신 안 함.
   `lastActiveAt` 갱신은 `saveReplayImport` 쪽에 이미 있으므로 그대로 둔다(대회 판도 갱신).
5. 업로드 미리보기(`previewReplayMmr`)는 대회 모드에서 호출하지 않음 — 화면에 MMR 변화 칸을 숨긴다.
6. 시즌 리셋은 영향 없음(대회 경기는 애초에 판/승/패에 안 세므로). 대회 순위표는 리셋 기준선을 **보지
   않는다** — 대회가 분기 경계를 넘어도 순위가 지워지면 안 된다.

통계 화면은 1번의 기준선 전용 필터를 써서 대회 경기를 **포함**한다.

## 순위표

`aggregateTournamentStandings(games, teams)` — `packages/core`의 순수 함수, 단위 테스트.

- 입력: 살아 있는(`cancelledAt: null`) `kind = TOURNAMENT` 경기의 (blueTeamSlot, redTeamSlot, winner).
- 팀마다 승, 패, 승점 = 승×3 − 패×1, **킬득실** = 그 팀이 낸 킬 합 − 상대가 낸 킬 합(사용자 요청).
  킬은 그 경기 `ReplayPlayerStat.kills`를 측(`team`)별로 더한 값 — 대회 경기는 전부 리플레이라 항상 있다.
  경기 0판 팀도 0/0/0/0으로 표에 나온다.
- 정렬: 승점 ↓ → 승 ↓ → 상대 전적(동점 두 팀 사이 승수) ↓ → 킬득실 ↓ → 슬롯 번호 ↑
  (킬득실을 마지막 동점 기준으로 둔 건 내 판단).
  셋 이상 동점이면 상대 전적은 동점 팀들끼리의 승수 합으로 본다.

## 화면 `/tournament`

공개 페이지(로그인 불필요), 모바일 지원(375px까지). 4번 업로드 영역만 운영진·데스크톱 전용
(`hidden md:block`, 모바일에선 「PC에서 이용해 주세요」 한 줄).

1. **순위표**: 순위 / 팀 / 승 / 패 / 승점 / 킬득실(+3, −2, 0). 운영진은 팀 이름 칸을 그 자리에서 수정(`MemberRealNameCell`과
   같은 인라인 편집 패턴).
2. **이미지 (카드식, 사용자 요청)**: 카드 그리드 — 모바일 2열, `md` 3열, `lg` 4열. 카드는 같은 비율
   (`aspect-[3/4]`, 내 판단: 포스터가 세로형이 많다) 안에 `object-contain`, 잘리지 않음. 카드를 누르면
   원본 크기 라이트박스(배경 클릭·Esc로 닫기, 좌우 화살표로 넘김 — 내 판단). 운영진은 파일 선택에서
   **여러 장을 한 번에** 고를 수 있고(`multiple`), 브라우저가 한 장씩 차례로 올린다(한 장당 서버 액션
   하나 — 본문 20MB 한도 회피). 진행 「3/5 업로드 중」, 실패한 장은 이유와 함께 표시하고 나머지는
   계속. 카드마다 앞으로/뒤로 이동·삭제 버튼. `/api/tournament/images/[id]`가 이미지를 내보낸다.
   캐시는 `private, no-store`(내 판단: 꺼지면 방문자에게 404여야 하므로 immutable로 두면 이미 본 사람
   브라우저에 남는다. 장수가 적어 비용 무시 가능).
3. **경기 및 스크림 기록**: 최신순. 행마다 「대회」/「스크림」 태그, 블루팀 이름 vs 레드팀 이름, 승리팀
   강조, `formatPlayedAt` 날짜. 행을 누르면 `/match-history`와 같은 `GameDetailBoard` 펼침(리플레이
   스탯). 취소된 경기는 흐리게 「취소됨」. 운영진에게 취소 버튼.
   필터: 전체 / 대회 / 스크림(`?kind=`).
4. **리플레이 업로드** (운영진): 기존 `ReplayImportForm`을 재사용하되 `tournament` 모드 prop:
   - 칼바람/협곡 토글 대신 「대회 / 스크림」 토글.
   - 블루 측 팀, 레드 측 팀 드롭다운(1~4팀 이름). 같은 팀 선택 시 저장 버튼 비활성.
   - MMR 변화 미리보기 숨김.
   - 참가자 매칭·외부인 지정·`playedAt` 기본값은 그대로.

## 다른 화면에 보이는 모습

- `/match-history`: 대회·스크림 행에 태그 배지(「대회」/「스크림」)와 「1팀 vs 3팀」 표기.
  MMR 변화 칸은 `±0` 대신 `-`. 모드 필터는 그대로(대회 경기는 협곡으로 잡힘).
- `/match-calendar`: 협곡 점으로 센다(색 추가 안 함).
- `/player-stats`, `/champion-stats`: 협곡 경기로 포함.

## 기능 끄기 (대회 종료)

`/admins`에 「대회 페이지」 스위치(`SiteSetting.tournamentEnabled`, 기본 꺼짐 — 배포 후 운영진이 켠다).

- **켜짐**: 사이드바에 「대회」, 페이지 정상.
- **꺼짐**:
  - 사이드바에서 「대회」 숨김.
  - 방문자의 `/tournament`는 `notFound()`.
  - 운영진은 들어갈 수 있되 상단에 「대회 페이지가 꺼져 있습니다」 띠, 업로드 영역 숨김(다시 켜면 복구).
  - 서버 액션(업로드 저장·팀 이름·이미지)도 꺼져 있으면 거부.
  - `/api/tournament/images/[id]`는 꺼져 있어도 운영진에게는 응답, 방문자에겐 404.
- 내전 기록·통계·캘린더의 대회 경기는 스위치와 무관하게 계속 보인다(태그 포함 — 팀 이름은 DB에 남음).

코드 자체를 나중에 지우기 쉽게, 대회 전용 코드는 `app/tournament/`, `components/tournament/`,
`lib/tournament/`, `packages/core/src/tournament-standings.ts`에 모은다. 공용 파일에 닿는 곳(위
「규칙」의 kind 필터, 기록 화면의 태그, `AppShell` 메뉴, `/admins` 스위치)은 kind 필터를 빼면 지울
수 있고, kind 필터와 스키마 칸은 기록이 남아 있는 한 **지우지 않는다**.

## 테스트

- core: `aggregateTournamentStandings` — 승점 계산, 0판 팀, 2팀 동점 상대 전적, 3팀 동점, 스크림·취소 제외(입력 단계).
- dashboard 통합(실 DB, 기존 가드 유지):
  - 대회 리플레이 저장 → 회원 `mmr`/`aramMmr` 불변, `GameParticipant` delta 0, `lastActiveAt` 갱신, `ReplayPlayerStat` 저장.
  - 같은 팀 양쪽 매핑 거부, 꺼진 상태에서 저장 거부.
  - `counted-games`·봇 `get-game-count`에 대회 경기 미포함.
  - 내전 판 뒤에 대회 판을 넣어도 그 내전 판 취소 가능. 대회 판 취소는 MMR 불변.
  - `/player-stats`·`game-history`에 대회 경기 포함.

## 빌더에게 남긴 것

- 인라인 팀 이름 편집, 이미지 순서 변경 UI의 세부 모양.
- `ReplayImportForm`에 prop을 더할지 감싸는 컴포넌트를 둘지.
- 대회 경기 목록 페이지네이션(경기 수가 적어 처음엔 전부 보여도 됨).
- CLAUDE.md에 대회 규칙 절 추가(모바일 화면 목록, 데스크톱 전용 목록 갱신 포함).
