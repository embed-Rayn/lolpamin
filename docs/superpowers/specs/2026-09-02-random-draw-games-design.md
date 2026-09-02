# 랜덤 뽑기 그래픽 게임 설계

**날짜:** 2026-09-02
**상태:** 설계 승인 완료, 구현 계획 작성 대기

## 배경 및 목적

모임 운영 중 순서 정하기(벌칙 지명, 발표 순서, 팀장 뽑기 등)를 대시보드 안에서 처리한다.
현재는 별도 사이트나 사다리타기를 쓰는데, 회원 명단을 매번 손으로 옮겨 적어야 한다.
대시보드는 이미 계정이 연결된 회원 명단을 갖고 있으므로, 그 명단을 그대로 뽑기 후보로 쓴다.

핵심 요구는 세 가지다.

- **비복원 추출**: 한 번 뽑힌 사람은 풀에서 빠진다. 같은 사람이 두 번 나오지 않는다.
- **되돌리기 / 리셋**: 잘못 눌렀을 때 마지막 뽑기를 취소할 수 있고, 처음부터 다시 시작할 수 있다.
- **직관적인 그래픽**: 숫자가 툭 나오는 게 아니라, 보는 사람이 "무작위구나"를 눈으로 납득하는 연출.
  방식이 다른 두 가지를 각각 독립 페이지로 구현한다 — 공 뽑기(로또 추첨기), 핀볼(플린코).

## 범위 밖 (Out of scope)

- 추첨 결과를 DB에 저장하지 않는다. 이력 조회 화면도 만들지 않는다. 상태는 브라우저 메모리에만 있고 새로고침하면 초기화된다.
- 팀 배정(5:5 자동 분배) 모드는 만들지 않는다. 이번엔 "한 명씩 순차 추첨"만.
- 효과음은 넣지 않는다. BGM 재생만 지원한다.
- 여러 사람이 같은 추첨을 동시에 보는 실시간 동기화는 하지 않는다. 화면 하나를 띄워놓고 다 같이 보는 용도다.
- 모바일 세로 레이아웃 최적화는 하지 않는다. 데스크톱 우선.

## 사이드바 배치

현재 01~05인 좌측 메뉴에 두 항목을 추가해 07까지 늘린다.

```
01 회원 관리        /members
02 게임 결과 입력   /matches
03 미활동 리포트    /inactive
04 카톡 내보내기    /kakao-import
05 계정 연결        /link-accounts
06 공 뽑기          /draw/ball
07 핀볼 뽑기        /draw/plinko
```

`AppShellProps.activeNav` 유니온에 `"draw-ball" | "draw-plinko"`를 추가하고 `navItems`에 두 행을 넣는다.

## 아키텍처

추첨 로직과 연출을 분리한다. 게임이 두 개(나중에 더 늘 수도 있다)지만 "비복원으로 한 명 뽑는다"는 규칙은 하나뿐이므로, 규칙은 `packages/core`의 순수 함수 한 벌로 두고 게임별로 다른 것은 캔버스 렌더러 파일뿐이도록 한다.

```
packages/core/src/draw.ts              비복원 추출 상태머신 (순수, 단위테스트)

apps/dashboard/
  app/draw/ball/page.tsx               06 — 서버 컴포넌트, force-dynamic
  app/draw/plinko/page.tsx             07 — 서버 컴포넌트, force-dynamic
  app/api/bgm/route.ts                 public/bgm 목록 반환
  components/draw/
    DrawScreen.tsx                     client. 오케스트레이터. variant="ball"|"plinko"
    CandidateSetup.tsx                 후보 구성 (회원 / 숫자)
    DrawControls.tsx                   뽑기 · 되돌리기 · 리셋 · 연출 스킵
    ResultList.tsx                     뽑힌 순서 목록
    BgmPlayer.tsx                      곡 선택 · 재생/정지 · 볼륨 · 반복
    BallLotteryCanvas.tsx              06 연출
    PlinkoCanvas.tsx                   07 연출
  lib/draw/
    candidates.ts                      회원[] / 숫자범위 → DrawCandidate[]
    random.ts                          crypto 기반 균등 인덱스 추출
    plinko-path.ts                     목표 슬롯에 도달하는 좌/우 시퀀스 생성
    bgm.ts                             디렉터리 파일 목록 필터·정렬
```

### 검토한 대안

- **페이지별 독립 구현**: 06과 07이 각자 상태와 셋업 패널을 갖는다. 시작은 빠르지만 되돌리기/리셋 버그를 두 번 고쳐야 하고, 작업량의 대부분인 셋업 패널이 통째로 중복된다. 기각.
- **단일 페이지 + 모드 토글**: 메뉴를 06 하나만 늘리고 페이지 안에서 공/핀볼을 전환한다. 사이드바 요구(06·07 두 항목)와 어긋나 기각.

## 도메인 코어 — `packages/core/src/draw.ts`

```ts
export interface DrawCandidate { id: string; label: string }
export interface DrawState { candidates: DrawCandidate[]; drawnIds: string[] }

createDrawState(candidates: DrawCandidate[]): DrawState
remainingCandidates(state: DrawState): DrawCandidate[]
drawNext(state: DrawState, nextIndex: (n: number) => number): { state: DrawState; picked: DrawCandidate } | null
undoDraw(state: DrawState): DrawState
resetDraw(state: DrawState): DrawState
```

상태 모델은 **고정 후보 배열 + 뽑힌 id 스택**이다. 남은 후보는 파생값(`candidates` 중 `drawnIds`에 없는 것, 원래 순서 유지)이다. 이 모델을 고른 이유:

- 되돌리기가 스택 pop 한 줄이고, 되돌린 후보가 원래 자리로 돌아와 표시 순서가 흔들리지 않는다.
- 되돌리기 횟수 제한이 자연스럽게 없다(스택 전체를 되돌릴 수 있다).
- 리셋은 `drawnIds = []`.

모든 함수는 불변(새 객체 반환)이고 I/O가 없다.

무작위는 `nextIndex(n)`를 주입받는다. 테스트는 `() => 0` 같은 결정적 함수를 넘기고, 프로덕션은 `lib/draw/random.ts`가 `crypto.getRandomValues` + 리젝션 샘플링으로 만든 함수를 넘긴다(`%` 모듈로 편향 제거). core는 Web Crypto에 의존하지 않는다.

풀이 비면 `drawNext`는 `null`을 반환한다.

### 단위 테스트

- 같은 후보가 두 번 뽑히지 않는다(전부 소진할 때까지 반복).
- 풀 소진 후 `drawNext` → `null`.
- `undoDraw`는 마지막 하나만 되돌린다. 빈 상태에서 호출해도 안전.
- `resetDraw` 후 남은 후보 = 최초 후보.
- `nextIndex` 경계값 0 / n-1.
- 후보 0명으로 만든 상태.
- undo 직후 다시 뽑으면 되돌린 후보가 다시 후보에 포함된다.

## 후보 구성 — `lib/draw/candidates.ts`

후보 소스는 세 가지이고, 전부 `DrawCandidate`로 정규화된다. 캔버스 렌더러는 회원 개념을 모른다.

- **연결 회원**: 서버가 `getLinkedMembers()`로 가져온 목록(Discord 측이 있고 카카오 측도 있는 회원)을 체크박스로 보여준다. 기본 전체 선택, 검색·전체선택/해제 지원. `id`는 회원 id, `label`은 `getDisplayName()` 결과.
- **수동 추가**: 임시 손님 등 DB에 없는 사람 이름을 직접 입력해 추가. `id`는 `manual-<n>`.
- **숫자 범위**: min~max를 입력하면 `{ id: "n-7", label: "7" }` 형태로 후보를 만든다. 회원과 무관한 일반 숫자 뽑기 모드.

UI는 상단 탭으로 [회원] / [숫자]를 고르고, 회원 탭 안에 수동 추가 입력을 둔다.

## 진행 규칙

- **뽑는 순간 결과 확정.** `drawNext`가 즉시 코어 상태를 갱신하고, 연출은 이미 확정된 당첨자를 재생하기만 한다. 물리 시뮬레이션이 결과를 정하지 않는다 — 분포 균등이 보장되고, 공이 끼거나 애니메이션이 실패해도 결과는 이미 정해져 있다.
- **연출 중 잠금.** 재생 중에는 뽑기·되돌리기·리셋 비활성. [연출 스킵]으로 즉시 종료할 수 있다.
- **첫 뽑기 후 후보 편집 잠금.** 진행 중 명단을 바꾸면 비복원의 의미가 깨진다. 바꾸려면 리셋. 잠긴 동안 셋업 패널은 읽기전용으로 표시한다.
- **되돌리기·리셋은 역재생하지 않는다.** 코어 상태만 되돌리고 캔버스는 `sync(remaining)`으로 다시 그린다. 상태와 그림이 어긋날 여지를 없앤다.

## 연출

공통: `<canvas>` + `requestAnimationFrame`, DPR 스케일, `ResizeObserver`로 리사이즈 대응. 렌더러는 imperative handle로 `play(winner): Promise<void>` / `skip()` / `sync(remaining)`를 노출한다. `prefers-reduced-motion`이면 연출을 0.3초로 단축한다. 결과는 캔버스 밖 `ResultList` DOM에도 텍스트로 남는다(스크린리더·화면 캡처용).

### 06 공 뽑기 (로또 추첨기)

유리통 안에 남은 후보 수만큼 공이 돌아다닌다. 각 공은 위치·속도 벡터를 갖고 벽에서 반사하며, 공끼리는 간단한 밀어내기만 한다(결과를 물리가 정하지 않으므로 정밀 충돌이 필요 없다). 색은 `id` 해시 → HSL. 라벨은 공 반지름에 맞춰 폰트를 줄이고 넘치면 말줄임.

뽑기 시퀀스는 약 2.5초:

1. 교반 가속 0.6초.
2. 당첨 공만 배출 튜브 경로를 따라 빠져나간다. 나머지는 계속 튄다.
3. 확대 표시 0.8초 후 결과 목록에 추가.

뽑힌 공은 통에서 사라진다(비복원의 시각화). 되돌리기는 역재생 없이 즉시 재삽입.

### 07 핀볼 (플린코)

상단 투입구, 삼각 격자 핀, 하단 슬롯 구조. 슬롯은 **매 뽑기마다 남은 후보만 균등 재배치**한다 — 소진될수록 슬롯이 넓어져 후반이 시원하다.

당첨자가 이미 확정되어 있으므로 목표 슬롯을 알고 있다. `plinko-path.ts`가 핀 줄 수만큼의 좌/우 시퀀스를 만들되, 우회전 수는 목표 도달에 필요한 값으로 고정하고 순서만 셔플한다. 매번 경로가 달라 보이지만 항상 목표 슬롯에 도착한다. 핀 충돌은 포물선 보간으로 표현하고 낙하는 약 2초.

한계: 후보가 20명을 넘으면 슬롯 라벨은 번호만 표시하고 당첨 이름은 하단에 크게 띄운다. 10명 안팎을 상정한 화면이다.

## BGM

`BGM/` 의 mp3 3개를 `apps/dashboard/public/bgm/`으로 옮기고 커밋한다(미추적 파일이므로 `git mv`가 아니라 이동 후 `git add`). 약 7MB가 저장소에 들어간다.

- 재생은 `/bgm/<파일명>` 정적 서빙(Next가 Range를 지원하므로 탐색이 동작한다).
- 목록은 `GET /api/bgm`이 런타임에 `public/bgm` 디렉터리를 읽어 `.mp3`만 필터·정렬해 반환한다. 나중에 mp3를 폴더에 떨궈 넣기만 하면 목록에 뜬다. 목록 생성 로직은 `lib/draw/bgm.ts`의 순수 함수로 분리해 테스트한다.
- 플레이어는 곡 선택, 재생/정지, 볼륨, 반복을 제공한다. 브라우저 자동재생 차단 정책 때문에 **사용자 클릭으로만 시작**한다. 선택 곡과 볼륨은 페이지 상태이며 새로고침하면 초기화된다.
- 06·07 각각 독립 플레이어를 둔다. Next 페이지 전환에서 어차피 언마운트되므로 공용화 이득이 없다.

## 엣지 케이스

- 연결 회원 0명: 안내 문구를 띄우고 숫자 모드로 유도.
- 후보 1명: 한 번에 종료. 후보 0명: 뽑기 버튼 비활성.
- 숫자 범위 역전 또는 1000개 초과: 인라인 검증 메시지, 시작 불가.
- 수동 이름 공백·중복: trim 후 비교해 거부.
- `public/bgm` 비어 있거나 API 실패: 플레이어에 "BGM 없음" 표시, 뽑기는 정상 동작.

## 테스트 전략

- `packages/core/src/draw.test.ts` — 위 단위 테스트 목록. DB 무관.
- `apps/dashboard/lib/draw/candidates.test.ts` — 회원/숫자 → 후보 변환, 중복·공백 처리.
- `apps/dashboard/lib/draw/plinko-path.test.ts` — 항상 목표 슬롯 도착, 우회전 수 정확, 호출마다 경로가 달라짐.
- `apps/dashboard/lib/draw/bgm.test.ts` — 확장자 필터·정렬.
- 위 대시보드 테스트는 전부 순수 함수라 DB를 건드리지 않는다. 따라서 `DATABASE_URL_TEST` 가드가 필요 없다(가드는 DB 테스트 파일 규칙).
- 캔버스 렌더러 자체는 자동 테스트하지 않는다. `npm run dev --workspace=dashboard`로 눈으로 확인한다.


## 설계 변경 (2026-09-02, 구현 중)

07을 유도형 플린코에서 **실물리 구슬 레이스**로 바꿨다. 참고: [lazygyu/roulette](https://github.com/lazygyu/roulette).

- 물리엔진 **matter.js**를 의존성으로 추가한다(순수 JS, 약 90KB). "새 의존성 없음" 제약은 07에 한해 해제.
- 07은 **물리가 승자를 정한다**. 남은 후보 수만큼 구슬이 중력·핀·경사판·회전 막대를 지나 떨어지고, 골라인을 먼저 넘은 구슬이 당첨. 유도하지 않으므로 분포 균등 보장은 07에서 포기한다(출발 위치와 맵에 좌우됨). 06 공 뽑기는 기존대로 `crypto` 균등 추출 + 재생만 한다.
- 렌더러가 승자를 알게 되므로 `DrawAnimator`를 둘로 나눈다: `PlaybackAnimator.play(winner)`(06)와 `RaceAnimator.race(): Promise<DrawCandidate>`(07). 07은 레이스가 끝난 뒤 `drawById(state, id)`로 상태에 커밋한다.
- 코스 형상과 판정 규칙은 `apps/dashboard/lib/draw/marble-course.ts`에 두어 브라우저 없이 vitest로 수백 판을 돌린다. 시간 상한 25초, 상한에 걸리면 가장 앞선 구슬이 이긴다 — 구슬이 끼어도 버튼이 멈추지 않는다.
- [연출 스킵]은 프레임당 물리 스텝을 40배로 돌리는 빨리감기다.
- `lib/draw/plinko-path.ts`(유도형 경로 생성기)는 삭제했다.

## 설계 변경 2 (2026-09-02, 구현 중)

06 공 뽑기(로또 드럼)를 **대포 뽑기**로 교체했다. 참고: [HJPyo/RandomSeqGenerator](https://github.com/HJPyo/RandomSeqGenerator) (a.k.a. 대포뽑기).

- 화면: 좌우 언덕 사이에 대포가 있고, 뽑기를 누르면 포신이 반동하며 포구 섬광과 함께 공 한 발이 이름을 달고 하늘로 날아가며 작아진다. 남은 인원은 대포 옆 탄약 더미로 보인다. 참고 레포는 언덕·대포를 PNG로 쓰지만 우리는 저장소에 바이너리를 넣지 않으려고 캔버스 벡터로 그린다.
- 당첨자는 여전히 발사 **전에** `crypto` 균등 추출로 확정된다(참고 레포도 시작 시 Fisher–Yates로 순서를 미리 섞는다). 비복원·되돌리기·리셋·연출 스킵 동작은 그대로다.
- 참고 레포의 "최근 나온 번호" 로그는 기존 `뽑힌 순서` 패널이 그 역할을 한다.
- 경로와 라벨이 `/draw/cannon` · 「대포 뽑기」로 바뀌었고, `variant`는 `"cannon" | "plinko"`, 렌더러는 `components/draw/CannonCanvas.tsx`다. `BallLotteryCanvas.tsx`는 삭제했다.
- 06·07이 사이드바 번호를 쓰므로 로그인 시 붙는 관리자 항목은 08로 밀었다.
