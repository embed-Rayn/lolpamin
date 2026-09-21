# 사이트 개편 · 회원 정보 페이지 설계

- 작성일: 2026-09-20
- 관련 스펙: `docs/superpowers/specs/2026-09-16-aram-mmr-design.md`,
  `docs/superpowers/specs/2026-09-16-multi-game-community-expansion-plan.md`

## 배경 및 목적

지금 대시보드는 "내부 운영 도구"로 시작해서, 사이드바의 모든 항목이 로그인 여부와 무관하게
그대로 보인다. 카톡 불러오기·계정 연결·게임결과 입력처럼 관리자만 쓰는 화면이 일반 회원에게도
목록에 떠 있고, 반대로 회원이 실제로 보고 싶은 것(내 MMR 순위, 전적)은 운영 메뉴 사이에 섞여
있다.

이 작업은 두 가지를 한다.

1. **사이트 개편** — 사이트 첫 화면(배너)을 만들고, 사이드바를 "회원이 보는 것"과 "운영자만
   보는 것"으로 가른다. 운영자 전용 화면은 메뉴에서 숨기는 데 그치지 않고 URL로 직접 들어가도
   로그인 화면으로 돌려보낸다.
2. **회원 정보 페이지(1.1)** — 회원 명부. 실명·닉네임·협곡/칼바람 전적·티어·비고를 한 표에
   모아 놓고 검색과 정렬을 붙인다.

## 범위

**포함**

- 사이트 메인 랜딩 화면(`/`) — 배너 이미지 한 장
- 좌상단 로고("롤파민") 클릭 시 메인으로 이동
- 사이드바 3개 그룹으로 재편 + 운영자 전용 항목 숨김
- 운영자 전용 5개 화면에 로그인 리다이렉트 가드
- 회원 정보 페이지(`/member-info`) — 표, 검색, 정렬
- `Member.note` — 비고 칸(운영자만 인라인 수정)

**제외 (다음 스펙)**

- **주 역할군 / 부 역할군** — 포지션은 리플레이 임포트 때 매칭용으로만 쓰고 버려진다
  (`GameParticipant`에 저장되지 않는다). 수동 입력 경기에는 포지션 정보 자체가 없다.
  Riot API 연동으로 채울 예정이고, 그때 컬럼 헤더 클릭 = 범주 필터도 함께 붙인다.
- **최고티어** — 역대 최고 티어를 기록하는 필드도 이력 테이블도 없다. `Member.tier`는 관리자가
  손으로 덮어쓰는 현재 값 하나뿐이다. 이것도 Riot API 연동 대상.
- 회원 정보 페이지의 필터. 요청된 필터 축이 주/부 역할군 컬럼뿐이라, 그 컬럼이 생기는
  다음 단계로 같이 미룬다.
- 플레이어별 통계(2.2), 챔피언 통계(2.3) — 메뉴에 "추가예정"으로 자리만 잡아 둔다.

## 사이드바 구조

번호는 배열 위치에서 계산된다(`AppShell.tsx`). 운영자 전용 항목은 비로그인 시 배열에서
아예 빠지므로, 같은 코드가 두 가지 번호 매김을 만든다.

**운영자 로그인**

```
1. 회원 관리
   1.1 회원 정보 페이지   /member-info
   1.2 협곡 MMR 랭킹      /members
   1.3 칼바람 MMR 랭킹    /aram
   1.4 미활동 리포트      /inactive
   1.5 카톡 불러오기      /kakao-import      [운영자 전용]
   1.6 계정 연결          /link-accounts     [운영자 전용]
   1.7 관리자             /admins            [운영자 전용]

2. 경기기록
   2.1 내전 상세 기록     /match-history
   2.2 플레이어별 통계    (추가예정)
   2.3 챔피언 통계        (추가예정)
   2.4 게임결과 입력      /matches           [운영자 전용]
   2.5 리플레이 불러오기  /replay-import     [운영자 전용]
   2.6 수동 팀짜기        /team-builder      [운영자 전용]

3. 뽑기 게임
   3.1 대포뽑기           /draw/cannon
   3.2 핀볼뽑기           /draw/plinko
```

**비로그인** — 위에서 `[운영자 전용]` 항목만 빠진다(1.1~1.4, 2.1~2.3, 3.1~3.2).
"추가예정" 항목은 로그인 여부와 무관하게 회색 비활성 행으로 항상 보인다. 아직 아무에게도
없는 기능이라 숨길 이유가 없고, 번호 자리를 미리 잡아 둔다.

이름을 "회원정보"가 아니라 "회원 관리"로 둔 이유: 1.1 항목 이름이 "회원 정보 페이지"라
그룹 이름이 같으면 두 줄이 같은 말을 하게 된다.

## 접근 제어

기존 규칙은 "읽기는 공개, 쓰기는 관리자 세션"이었고, 운영 화면도 페이지 자체는 열리되 폼과
버튼만 숨겼다. 이번에 운영 전용 5개 화면은 페이지 진입 자체를 막는다 — `/admins`가 이미
쓰던 방식(`getCurrentAdmin()`이 null이면 `redirect("/login")`)을 그대로 복사한다.

| 화면 | 변경 |
|---|---|
| `/kakao-import`, `/link-accounts`, `/matches`, `/replay-import`, `/team-builder` | 비관리자 → `/login` 리다이렉트 |
| `/admins` | 이미 그렇게 동작함(변경 없음) |
| `/members`, `/aram`, `/inactive`, `/match-history`, `/member-info`, `/draw/*` | 읽기 공개 유지. 인라인 수정·취소 버튼만 `isAdmin` 조건부 |

가드가 붙은 페이지는 통과한 시점에 관리자가 확정이므로, 컴포넌트에 넘기던
`isAdmin={currentAdmin !== null}`은 `isAdmin={true}`가 된다.

## 회원 정보 페이지

### 표 컬럼

| 컬럼 | 출처 | 정렬 |
|---|---|---|
| NO. | 정렬 뒤 행 번호(1부터) | — |
| 이름 | `Member.realName`, 없으면 `-` | O |
| 닉네임 | 카톡 닉네임(묘비 포함, `displayKakaoNickname`) | O |
| 협곡 판/승/패/승률(%) | `GameParticipant` × `GameResult.mode = RIFT` | 판수·승률 각각 O |
| 칼바람 판/승/패/승률(%) | 같은 집계의 `ARAM` 몫 | 판수·승률 각각 O |
| 현재티어 | `Member.tier` (`MemberTier`) | O(점수 순) |
| 비고 | `Member.note` (신규) | — |

협곡·칼바람을 탭으로 전환하지 않고 한 행에 나란히 둔다. 이 화면의 목적이 "한 사람의 상태를
한 줄로 보는 명부"라서, 모드를 바꿔 가며 두 번 봐야 하면 목적이 깨진다.

### 전적 집계 규칙

`queries/members.ts`의 `tallyRecords`와 **같은 규칙**을 쓴다. 되돌린 경기와 마지막 분기 리셋
이전 경기는 빼고(`getCountedGameFilter`), 묘비가 들고 있는 참가 기록은 생존자 몫으로 합산한다.
같은 회원의 같은 판이 화면마다 다르게 세어지면 안 되기 때문이다.

승률은 `round(승 / 판 × 100)`이고, 판이 0이면 `null`이다. 0%과 "기록 없음"을 구분해야
정렬에서 기록 없는 회원을 항상 뒤로 보낼 수 있다.

### 검색 · 정렬

- **검색**: 실명 + 카톡 닉네임 + 묘비 닉네임을 훑는다(대소문자 무시, 부분 일치). 묘비까지 보는
  이유는 닉네임을 바꾼 회원을 옛 이름으로 찾는 일이 잦아서다 — `queries/members.ts`와 같다.
- **정렬**: 컬럼 헤더를 누르면 내림/오름차순이 토글된다(`/members`의 `sortHref` 패턴).
  기본값은 이름 오름차순.
- **빈 값은 항상 마지막**: 실명·닉네임이 없는 행, 판이 0이라 승률이 없는 행은 방향과 무관하게
  뒤로 간다. 동점일 때는 `id` 오름차순으로 순서를 고정한다.
- 티어 정렬은 조회 뒤 JS에서 한다. Postgres는 `MemberTier` enum을 선언 순서로 정렬하므로
  점수 순과 다를 수 있다 — `queries/members.ts`의 `sortByTierScore`와 같은 이유다.

정렬을 전부 JS에서 하는 것은 이 파일만의 선택이다(`queries/members.ts`는 Prisma `orderBy`와
JS 정렬을 섞어 쓴다). 회원 수가 ~40명이고, 승률·판수처럼 조회 뒤에 계산되는 값이 정렬 기준에
섞여 있어서 한 가지 방법으로 통일하는 편이 읽기 쉽다.

### 비고 칸

```prisma
model Member {
  // ...
  note String?
}
```

운영자가 손으로 남기는 자유 텍스트. `MemberRealNameCell`과 같은 방식으로 인라인 편집하고,
빈 문자열은 `null`로 저장한다. 비관리자에게는 읽기 전용 텍스트로 보인다.

## 데이터 흐름

```
/member-info (page.tsx, force-dynamic)
  ├─ getMemberInfoListData(q, sort, dir)   lib/queries/member-info.ts
  │    ├─ member.findMany({ mergedIntoId: null, include: absorbed })
  │    └─ tallyByMode() → getCountedGameFilter + gameParticipant.findMany
  ├─ getCurrentAdmin()                      → isAdmin
  └─ <MemberInfoTable>                      검색창 + 정렬 헤더 + 행
       ├─ <MemberTierCell>                  기존 컴포넌트 재사용
       └─ <MemberNoteCell> → updateMemberNoteAction → updateMemberNote()
```

## 테스트

- `lib/queries/member-info.test.ts` — 협곡/칼바람 분리 집계, 취소·리셋 제외 규칙, 묘비 몫
  합산, 검색(묘비 닉네임 포함), 정렬 7종과 "빈 값 마지막" 규칙.
- `lib/mutations/update-member-note.test.ts` — 트림 저장, 빈 문자열 → `null`, 다른 필드
  불변, 없는 회원이면 throw.

둘 다 기존 통합 테스트 패턴(`DATABASE_URL_TEST` 가드 + `resetDatabase`)을 그대로 쓴다.
