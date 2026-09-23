# 팀 드래프트(`/matches`) 설계

날짜: 2026-09-23
참고 이미지: `sample/matches.jpg` (커밋하지 않음)

## 목표

`/matches`를 "게임 결과 입력"에서 **팀장 드래프트 화면**으로 바꾼다. 참여자 10명이 합의해
팀장 둘을 정하면, 두 팀장이 스네이크 순서로 나머지를 뽑는다. 화면 하나를 띄워 놓고 다 같이
보는 용도다. 뽑는 데 참고하도록 각 후보의 Riot ID·숙련 챔피언 3개·승패·MMR·주/부라인을 보여준다.

경기 결과 입력은 이 화면에서 **없앤다.** 결과는 `/replay-import`로만 들어온다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 결과 입력 | `/matches`에서 제거. 리플레이 임포트가 유일한 입력 경로. 리플레이가 없는 판(녹화 누락)은 기록할 수 없음을 감수한다 |
| 칼바람 | 이 화면은 협곡 전용. 모드 토글 없음. 칼바람 결과도 리플레이로만 |
| 팀장 선정 | 앱이 정하지 않는다. 합의된 두 사람을 관리자가 [블루 팀장] / [레드 팀장] 버튼으로 지정 |
| 픽 순서 | 스네이크. 팀장 2명이 먼저 앉은 뒤 남은 8픽을 `B R R B B R R B` |
| 선픽 | 블루 |
| 차례 표시 | 배너로 "블루 팀장 ○○○ 차례 · 3/8픽" |
| 팀 배정 수단 | 드롭다운 없음. 행의 [뽑기] 버튼(현재 차례 팀으로) + 드래그. 팀 열은 상태 뱃지(미배정/블루/레드) |
| 드롭 대상이 찬 칸 | 맞바꾸기 |
| 라인 배치 저장 | 하지 않는다. 경기 라인은 리플레이의 `position`이 기준 |
| 게스트 | 이름만으로 추가. MMR·주/부라인을 손으로 입력. 팀 평균에 포함. DB에 쓰지 않음 |
| 후보 표 정렬 | MMR 내림차순(게스트는 입력한 MMR로 함께 정렬) |
| MMR 값 | 저장된 `Member.mmr`. `displayedRating`(판수 0이면 0)은 평균을 무너뜨리므로 쓰지 않는다 |
| 숙련 챔피언 | Riot Champion-Mastery-V4. 회원의 모든 계정을 챔피언별로 합산해 상위 3개 |
| 숙련도 갱신 | 관리자 버튼, 24시간 1회. DB 캐시 |
| 상태 보존 | `sessionStorage`. 탭을 닫으면 사라진다 |
| 참여자 기본값 | 전체 해제 |
| MMR 시뮬레이터 | 엔트리가 바뀔 때마다 양 팀 평균을 자동으로 채운다. 손으로 고칠 수 있다 |
| 페이지 제목 | "팀 드래프트". URL은 `/matches` 그대로 |
| `/team-builder` | 건드리지 않는다. 운영진 팀 짜기 용도로 따로 바뀔 예정 |

## 숙련도 데이터

### 저장

```prisma
model ChampionMastery {
  riotAccountId String
  riotAccount   RiotAccount @relation(fields: [riotAccountId], references: [id], onDelete: Cascade)
  championId    Int     // 라이엇 숫자 키 (Data Dragon champion.json의 "key")
  level         Int
  points        Int

  @@id([riotAccountId, championId])
}
```

`SiteSetting`에 `masteryRefreshedAt DateTime?`를 더한다.

계정 단위 원본을 두고 회원별 합산은 **읽을 때** 한다. 흡수·해제·`saveReplayImport`의 계정 재배정은
`RiotAccount.memberId`만 옮기므로, 합산을 저장하지 않으면 이 경로들이 손댈 것이 없다.
`removeRiotAccount`·`deleteMember`가 계정 행을 지우면 cascade로 숙련도도 사라진다 — 숙련도는
그 계정의 부속물이지 확정 상태가 아니므로 `Restrict`가 필요 없다.

### 조회

`lib/riot-api/mastery.ts` — `GET https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}`.
플랫폼 호스트(`kr`)다. Account-V1의 라우팅 호스트(`asia`)와 다르다. 실패를 던지지 않고
`account.ts`와 같은 `LookupFailure`로 돌려준다.

`/top?count=3`이 아니라 **전체 목록**을 받는다. 계정마다 상위 3개만 받으면, 두 계정에서 각각
4위인 챔피언이 합산으로는 1위가 되는 경우를 놓친다. 호출 수는 같다(계정당 1회).

### 갱신

`refreshChampionMasteries(prisma, lookup)` — `refreshRiotAccountIds`와 같은 모양.

- 대상: `memberId`가 활성 회원(또는 그 묘비)인 `RiotAccount`. 외부인 계정은 건너뛴다.
- 계정마다 해당 계정의 `ChampionMastery` 행을 전부 지우고 새 목록을 쓴다(계정 단위 트랜잭션).
- 첫 `unauthorized`에서 중단. `rate_limited`도 중단(남은 계정은 다음 실행으로).
- 24시간 제한의 근거는 `SiteSetting.masteryRefreshedAt`. 호출을 한 번이라도 쓴 실행만 시각을 남긴다.
- 버튼은 `/matches`의 후보 표 머리에 둔다. 마지막 갱신 시각과 다음 가능 시각을 표시.

### 합산 (packages/core)

`topMasteries(entries: {championId, level, points}[], n = 3)` — 챔피언별로 `points`는 합산하고
`level`은 계정들 중 **최댓값**을 쓴다(레벨을 더하는 것은 의미가 없다). `points` 내림차순 상위 n.
화면에는 초상화와 레벨(`x17`)을 보인다.

### Data Dragon 숫자 키

현재 `ddragon-map.json`의 `champions`는 문자열 id(`"Aatrox"`) → 한국어 이름이다. 숙련도 API는 숫자
`championId`를 준다. `scripts/sync-ddragon.ts`가 `champion.json`의 `key`로 `championKeys`
(`"266" → "Aatrox"`)를 함께 만들고, `lib/ddragon/assets.ts`에 `championIdByKey(key: number)`를 더한다.
모르는 키는 기존 규칙대로 빈 칸이다.

## 드래프트 로직 (packages/core, 순수)

상태:

```ts
type Side = "blue" | "red";
type Lane = "TOP" | "JUG" | "MID" | "AD" | "SUP";
interface DraftState {
  captains: Record<Side, string | null>;          // participant key
  slots: Record<Side, Record<Lane, string | null>>;
  picks: string[];                                // 팀장 제외, 뽑힌 순서
}
```

participant key는 회원이면 `m:<memberId>`, 게스트면 `g:<이름>`. 게스트 이름은 참여자 안에서 유일해야 한다.

함수:

- `snakeTurn(pickCount): Side | null` — `B R R B B R R B`, 8픽 이후 `null`.
- `autoLane(slots[side], mainLane, subLane): Lane` — 주라인 칸이 비었으면 주라인, 아니면 부라인,
  아니면 `TOP→SUP` 순의 첫 빈칸.
- `draftReducer(state, action)`:
  - `setCaptain(side, key, lanes)` — 두 팀장이 모두 있어야 픽이 시작된다. 팀장을 바꾸면 그 팀장 칸만 교체.
    이미 픽이 시작됐으면 거부(초기화 후 다시).
  - `pick(key, lanes)` — 현재 차례 팀의 `autoLane` 칸에 앉히고 `picks`에 추가.
  - `dropFromBench(key, side, lane)` — `side`가 현재 차례 팀일 때만. 칸이 차 있으면 거부(후보↔엔트리
    맞바꾸기는 픽 수를 흔들므로 드래프트 중에는 막는다). 드래프트가 끝난 뒤에는 벤치↔엔트리 맞바꾸기를
    허용한다(참여자가 10명보다 많을 때 교체용).
  - `move(from: {side, lane}, to: {side, lane})` — 엔트리끼리. 차례와 무관, 대상이 차 있으면 맞바꾸기.
    팀장이 다른 팀으로 옮겨지면 `captains`도 따라 바꾼다.
  - `undo()` — `picks`의 마지막을 빼고 그 칸을 비운다. 픽이 없으면 팀장 지정을 되돌린다.
  - `reset()`.
  - 참여자에서 빠진 key는 `removeParticipant(key)`로 칸과 `picks`에서 지운다. 팀장이면 드래프트 초기화.

거부는 상태를 그대로 돌려준다(UI가 버튼을 이미 비활성화하므로 예외가 필요 없다).

## 화면 `/matches`

`AppShell` `desktopOnly` 유지. 위에서 아래로:

1. **참여자 선택** — 기본 전체 해제, 이름 검색, 체크박스 격자. 아래에 "명단에 없는 사람 이름 추가" 입력과
   [추가]. 게스트는 칩에 표시가 붙고 X로 제거한다. 풀은 지금처럼 `getLinkedMembers()`.
2. **후보 선수 표** — 선택된 참여자만. 열: `#`, 이름, Riot ID, 숙련 챔피언 ×3, 승, 패, MMR, 주라인,
   부라인, 상태, 행동.
   - Riot ID: 계정이 여럿이면 숙련 포인트 합이 가장 큰 계정 하나와 `+N`.
   - 승/패: 협곡의 counted games(리셋 기준선 이후).
   - 게스트 행: Riot ID·숙련·승패는 `—`, MMR(기본 1000)·주/부라인은 입력 칸.
   - 행동: 팀장 둘이 정해지기 전에는 [블루 팀장] [레드 팀장], 이후에는 [뽑기](현재 차례 팀, 미배정만).
   - 배정된 행은 팀 색으로 칠한다(`bg-*`는 테마 토큰으로, hex 금지).
   - 행 전체가 드래그 핸들.
   - 머리: 숙련도 갱신 버튼과 시각.
3. **차례 배너** — "블루 팀장 ○○○ 차례 · n/8픽" / "드래프트 완료". [되돌리기] [초기화].
4. **엔트리** — 라인 5행 × 블루/레드. 칸은 드롭 대상이자 드래그 원천. 팀 머리에 `n/5`와 평균 MMR
   (게스트 포함, 빈 팀은 `—`). 팀장 칸에 표시.
5. **MMR 시뮬레이터** — 기존 `MmrSimulator`. 블루/레드 평균을 prop으로 받아 엔트리가 바뀔 때마다 입력값을
   덮어쓴다. 사용자가 고친 값은 다음 엔트리 변경 때 다시 덮인다.

드래그는 네이티브 HTML5 DnD(`draggable`, `dataTransfer`). 새 의존성 없음. PC 전용 화면이라 터치 지원은 범위 밖.

### sessionStorage

키 `lolpamin.draft.v1`, 값 `{ participants: string[], guests: Guest[], draft: DraftState }`.
마운트 후 읽는다(서버 렌더와 어긋나지 않게). 읽은 회원 key 중 현재 풀에 없는 것은 버린다. 읽기·쓰기는
전부 try/catch — 실패하면 빈 상태로 시작한다.

## 제거

- `components/MatchBuilder.tsx`, `app/matches/actions.ts`(`saveGameResultAction`).
- `saveGameResult` mutation은 남긴다 — `saveReplayImport`가 쓰는 `saveGameResultTx`의 본체다.
  손 입력 전용 분기가 남는지는 계획 단계에서 확인해 정리한다.
- 다른 액션의 `revalidatePath("/matches")`는 그대로 둔다(후보 표가 MMR·계정을 읽는다).
- `CLAUDE.md`의 해당 서술 갱신.

## 테스트

- `packages/core`: `snakeTurn`, `autoLane`, `draftReducer`의 각 액션(차례 강제, 맞바꾸기, 팀장 이동,
  undo가 차례를 되돌림, 참여자 제거), `topMasteries`(계정 간 합산, 레벨 최댓값, 동점, n개 미만).
- `lib/riot-api/mastery.ts`: fetch 주입으로 상태 코드별 결과.
- `refreshChampionMasteries`: 실제 테스트 DB. 외부인 계정 제외, 계정 단위 교체, 24시간 제한, 즉시
  `unauthorized`면 시각을 남기지 않음, 계정 삭제 시 cascade.
- 후보 표 쿼리(숙련 합산·대표 계정 포함): 실제 테스트 DB.
- UI는 수동 확인.
