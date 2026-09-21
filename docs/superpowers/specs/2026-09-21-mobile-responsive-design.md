# 모바일 반응형 설계

- 작성일: 2026-09-21
- 관련 스펙: `docs/superpowers/specs/2026-09-20-site-navigation-and-member-info-design.md`

## 배경 및 목적

대시보드는 PC 폭(1280px 이상)만 보고 만들어졌다. 사이드바는 260px 고정이고, 표는 전부
`grid-cols-[…px…]`로 열 폭이 박혀 있어 375px 폰에서는 사이드바가 화면 2/3를 먹고 표는
오른쪽이 잘린다. 회원이 폰으로 "내 순위 몇 등이지"를 보려면 핀치 줌으로 버텨야 한다.

이 작업은 **회원이 열람하는 화면**을 폰에서 읽을 수 있게 만든다. 운영 화면은 PC 전용으로
남기고, 폰에서는 안내만 띄운다.

## 범위

**포함 — 폰에서 완전히 동작하는 화면 (5 + 로그인)**

- `/` 홈 배너
- `/member-info` 회원 정보
- `/rift`, `/aram` MMR 랭킹
- `/match-history` 내전 기록
- `/inactive` 미활동 회원
- `/login` — 폰에서도 로그인은 되어야 한다(관리자가 스킨을 바꾸거나 본인 확인하는 정도)

**포함 — 공통**

- 햄버거 → 드로어 내비게이션
- 상단 StatCard 세로 쌓기
- 표 → 카드 전환 (회원 정보, 랭킹, 미활동)
- 폰용 정렬 셀렉트

**제외 — PC 전용, 폰에서는 안내 카드**

- `/matches`, `/replay-import`, `/team-builder`, `/kakao-import`, `/link-accounts`, `/admins`
- `/draw/cannon`, `/draw/plinko`

**제외 — 이번에 안 함**

- 하단 탭바, PWA, 터치 제스처, 다크 스킨 전용 조정(색은 토큰이 따라간다)
- 운영 화면의 폰 대응 (다음 스펙)

## 결정 사항

| 질문 | 결정 | 이유 |
|---|---|---|
| 폰 사용자는 누구인가 | 일반 회원의 열람 | 현장에서 폰으로 경기 입력하는 흐름은 아직 없다. 넓히면 표 11개를 다 손봐야 한다. |
| 넓은 표를 어떻게 | 카드형 | 랭킹은 "누가 몇 등, 몇 점"이 전부다. 가로 스크롤은 승률까지 밀어야 보이고, 열 숨김은 정보를 잃는다. |
| 내비게이션 | 햄버거 드로어 | `SidebarNav`를 그대로 재사용한다. 그룹 접기·스킨·관리자 메뉴가 전부 따라온다. |
| 구현 방식 | CSS 반응형(Tailwind `md:`) | 표와 카드를 둘 다 서버 렌더하고 `hidden md:block`으로 가른다. 하이드레이션 깜빡임이 없고 표 컴포넌트가 서버 컴포넌트로 남는다. DOM 2벌은 40행 규모라 무시한다. |
| 브레이크포인트 | `md`(768px) 하나 | 미만은 폰 레이아웃, 이상은 지금 PC 레이아웃. 태블릿(768~1100)은 PC 레이아웃에 표 `overflow-x-auto` 안전망만 둔다. |

## 설계

### 1. 셸 — `AppShell` + `MobileDrawer`

`AppShell`은 서버 컴포넌트로 남는다. 폰 레이아웃에서 달라지는 것은 두 가지다.

- **사이드바**: `<aside>`에 `hidden md:flex`. 폰에서는 DOM에 남되 보이지 않는다.
- **헤더**: 높이 72px → 폰에서 56px. 왼쪽에 ≡ 버튼(`md:hidden`), 가운데 페이지 제목,
  오른쪽 로그인/로그아웃. 브레드크럼과 "회원 N명"은 `hidden md:flex`.

`MobileDrawer`는 클라이언트 컴포넌트다. ≡ 버튼과 드로어 패널을 함께 소유한다 — 열림 상태는
`useState` 하나이고 서버가 알 필요가 없다. 드로어 안에는 로고 줄과 `SidebarNav`를 그대로
넣는다. `AppShell`이 사이드바용으로 만든 `groups`·`activeNav`를 `MobileDrawer`에도 같은
값으로 넘긴다(직렬화 가능한 plain object — 아이콘은 이미 이름 문자열이다).

동작:

- ≡ → 열림. 왼쪽에서 280px 패널이 슬라이드(`transition-transform 200ms`), 뒤에 `bg-ink/40`
  배경.
- 배경 탭, ESC, 링크 클릭 → 닫힘. 링크 클릭 감지는 패널의 `onClick`에서 `closest("a")`로
  잡는다 — `SidebarNav` 내부를 건드리지 않는다.
- 열린 동안 `document.body.style.overflow = "hidden"`, 닫히면 원복. `useEffect` 정리 함수에서도
  원복해 페이지 이동 중 잠긴 채 남지 않게 한다.
- `prefers-reduced-motion`이면 트랜지션 없음.
- `md` 이상으로 넓어지면 드로어는 강제로 닫힌 상태로 렌더(`md:hidden`)해서, 폰에서 열어 둔
  채 창을 키워도 겹치지 않는다.

### 2. 카드 컴포넌트

세 표 컴포넌트가 각각 `hidden md:block`(표)와 `md:hidden`(카드 목록)을 나란히 렌더한다.
정렬·필터·검색은 URL 파라미터라 두 뷰가 자동으로 같은 행을 본다.

**`MemberCard`** — `/rift`, `/aram`. 입력은 `MemberRow` 하나.

```
┌──────────────────────────────────┐
│ (1)  정우성                 1701 │   순위 배지(포디움 색 그대로) · 실명 · MMR
│      우성 · woosung · 언랭       │   카톡 · 디코 · 티어, "-"는 생략
│      1판 0승 1패 · 21일 전       │   전적 · 마지막 활동(색 규칙 동일)
└──────────────────────────────────┘
```

포디움 행은 `rank-row-*` 클래스를 카드에도 붙인다(글로우·그라데이션 재사용). 삭제 버튼과
인라인 편집은 폰 카드에 없다 — 관리 작업은 PC 범위다. `MemberRealNameCell` 같은 편집 셀
대신 평문으로 찍는다.

**`MemberInfoCard`** — `/member-info`. 입력은 `MemberInfoRow` 하나.

```
┌──────────────────────────────────┐
│ 3  김나연  ·  다4                │   번호 · 이름 · 티어
│    김나연/04/주디#주토피아        │   닉네임
│ 협곡   1007  9판 4승 5패  44%    │   모드 라벨은 협곡=accent-soft, 칼바람=orange
│ 칼바람 1072  3판 3승 0패 100%    │
│ 비고: (있을 때만)                │
└──────────────────────────────────┘
```

**`InactiveCard`** — `/inactive`. 입력은 `InactiveRow` 하나. 이름 · 닉네임 · "N일 전"
(14일 이상 orange, 30일 이상 danger — 표와 같은 임계) · MMR/최근 내전. 경과일 바는 카드
아래 한 줄로 유지(폭이 있으니 오히려 잘 보인다). 날짜 편집 셀은 폰에 없다.

**내전 기록**은 이미 카드 목록이다. 참가자 줄이 `flex-wrap`이라 줄바꿈된다. 헤더 줄(날짜·
모드·승패·입력자·되돌리기)이 375px에서 두 줄로 접히는지만 확인하고, 필요하면 `flex-wrap`을
붙인다.

### 3. 정렬·필터 UI

카드에는 헤더가 없어 정렬 링크를 누를 곳이 없다. 카드 목록 위에 **`SortSelect`** 하나를 둔다.
`<select>` 네이티브 — 폰 키보드/휠이 알아서 뜬다. 옵션은 그 표의 정렬 키 × 방향을 펼친 것
(`MMR 높은 순`, `MMR 낮은 순`, `이름 가나다`, `티어 높은 순` …). 값을 바꾸면
`router.push`로 `sort`·`dir`을 URL에 쓴다 — 지금 헤더 링크가 하는 것과 같은 URL이라 PC로
돌아가도 정렬이 유지된다. `MemberFilters`·`MemberInfoSearch`가 각각 자기 표의 `SortSelect`를
`md:hidden`으로 품는다.

필터 칩(전체/유저만/언랭만) + 검색창은 폰에서 세로 두 줄(`flex-col md:flex-row`). 검색창은
`w-full md:w-56`.

내전 기록의 모드 필터·페이지네이션은 폭 문제가 없다. 페이지 번호가 많아지면 `pageNumbers`가
이미 현재±2와 양끝만 남기므로 375px에 들어간다.

### 4. 상단 카드·페이지 여백

- StatCard 그리드: `grid-cols-1 md:grid-cols-3`. 아이콘 타일은 폰에서 56px로 줄인다.
- 페이지 본문 여백: `px-7` → `px-4 md:px-7`, `pt-6` → `pt-4 md:pt-6`. 페이지 6개에 같은
  패턴이 반복되므로 `AppShell`의 `<main>`이 아니라 각 페이지에서 바꾼다 — 뽑기·팀짜기처럼
  자기 그리드를 가진 페이지가 섞여 있어 셸에서 일괄 적용하면 그쪽이 깨진다.
- 홈 배너: `w-full max-w-4xl`이라 이미 폭을 따라간다. 여백만 맞춘다.

### 5. PC 전용 화면 안내

`AppShell`에 `desktopOnly?: boolean` prop. `true`면 `children`을 `hidden md:block`으로 감싸고,
그 앞에 `md:hidden` 안내 카드를 넣는다:

> 이 화면은 PC에서 이용해 주세요
> 경기 입력·리플레이·계정 연결·뽑기는 화면이 넓어야 합니다.
> [홈으로] [협곡 랭킹]

DOM에는 원래 내용이 남으므로 폰에서 강제로 봐야 할 일이 생기면 브라우저 "데스크톱 사이트
보기"로 볼 수 있다. 여덟 페이지(`matches`, `replay-import`, `team-builder`, `kakao-import`,
`link-accounts`, `admins`, `draw/cannon`, `draw/plinko`)가 `desktopOnly`를 켠다. `/login`은
켜지 않는다.

### 6. 색·스킨

새 요소는 전부 시맨틱 토큰만 쓴다(`bg-surface`, `text-muted`, `border-ink/[.06]`, `bg-ink/40`).
세 스킨이 자동으로 따라온다. 드로어 배경은 `--sidebar-bg`를 쓴다.

## 데이터 흐름

쿼리·뮤테이션·타입은 바뀌지 않는다. 카드는 표가 받는 `MemberRow[]` / `MemberInfoRow[]` /
`InactiveRow[]`를 그대로 받는다. `SortSelect`가 쓰는 정렬 키도 `parseMemberSort` /
`parseMemberInfoSort`가 이미 받아들이는 값이다.

## 오류 처리

- 드로어의 body 스크롤 잠금은 정리 함수로 반드시 푼다. 라우팅 중 언마운트되어도 남지 않게.
- `SortSelect`는 URL 파라미터가 알 수 없는 값이면 기본 옵션을 선택 상태로 보여 준다 —
  `parse*Sort`가 이미 기본값으로 접으므로 셀렉트도 같은 함수를 통과시킨다.

## 테스트

- **유닛**: 없음. 카드와 드로어는 표시 계층이고 데이터 계층은 변경이 없다. 기존 쿼리 테스트
  전부 그대로 통과해야 한다.
- **시각 확인**(Playwright, 헤드리스 Edge): 375×812, 768×1024, 1280×900 세 폭 × 스킨
  clean·pink. 페이지: `/`, `/member-info`, `/rift`, `/match-history`, `/inactive`, `/admins`
  (안내 카드), `/login`.
- **동작 스크립트**: 375에서 ≡ → 드로어 열림 → 그룹 접기 → 링크 클릭 → 닫히고 이동. ESC로
  닫힘. `SortSelect` 변경 → URL `sort`/`dir` 반영 → 카드 순서 바뀜.
- **회귀**: 1280에서 기존 스크린샷과 비교해 PC 레이아웃이 그대로인지.

## 건드리는 파일

| 구분 | 파일 |
|---|---|
| 신규 | `components/MobileDrawer.tsx`, `components/MemberCard.tsx`, `components/MemberInfoCard.tsx`, `components/InactiveCard.tsx`, `components/SortSelect.tsx` |
| 수정 | `components/AppShell.tsx`, `components/MemberTable.tsx`, `components/MemberInfoTable.tsx`, `components/InactiveTable.tsx`, `components/MemberFilters.tsx`, `components/MemberInfoSearch.tsx`, `components/StatCard.tsx`, `components/GameHistoryList.tsx`(헤더 줄 wrap만) |
| 페이지 여백 | `app/page.tsx`, `app/member-info/page.tsx`, `app/rift/page.tsx`, `app/aram/page.tsx`, `app/match-history/page.tsx`, `app/inactive/page.tsx` |
| `desktopOnly` | `app/matches/page.tsx`, `app/replay-import/page.tsx`, `app/team-builder/page.tsx`, `app/kakao-import/page.tsx`, `app/link-accounts/page.tsx`, `app/admins/page.tsx`, `app/draw/cannon/page.tsx`, `app/draw/plinko/page.tsx` |
| 스타일 | `app/globals.css`(드로어 트랜지션·reduced-motion) |
| 문서 | `CLAUDE.md` — 반응형 규칙 한 단락 |
