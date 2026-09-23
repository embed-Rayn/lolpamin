# 리플레이 경기 상세 화면 설계

날짜: 2026-09-23
참고 이미지: `sample/game_rst.jpg` (커밋하지 않음)

## 목표

`.rofl` 리플레이로 등록한 경기를 OP.GG식 상세 화면(팀별 5명 × 챔피언·주문·룬·KDA·피해량·와드·CS·아이템,
가운데에 팀 오브젝트와 총 킬·총 골드)으로 보여준다. 두 곳에 나온다.

1. `/replay-import` — 파일을 올린 직후, 저장 전 미리보기.
2. `/match-history` — 리플레이로 저장된 경기 행의 확장 버튼(▾)을 누르면 카드 아래로 펼쳐진다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 참고 이미지의 솔랭 티어("마스터 509") 자리 | MMR로 대체. 회원만 표시, 외부인은 `#태그`만 |
| MMR 표시 | 그 경기의 변화 `1012→1035 (+23)` (`GameParticipant.mmrBefore/mmrAfter`). 칼바람은 칼바람 MMR |
| 미리보기의 MMR | 저장 전이라 현재 MMR과 예상 변화량을 계산해 표시. 매칭을 바꾸면 즉시 재계산 |
| 이미지 에셋 | `16.18.1/`에서 필요한 것만 `apps/dashboard/public/ddragon/`로 복사해 커밋. 원본 폴더는 커밋하지 않음 |
| 기존 경기 | 보강하지 않는다. 새로 올리는 리플레이부터 상세가 생기고, 옛 경기·손 입력 경기는 확장 버튼이 없다 |
| 저장 형태 | 새 테이블 `ReplayPlayerStat` (경기당 10행, 타입 있는 컬럼) |

## rofl에서 읽는 값

실제 리플레이(16.18)의 `statsJson`으로 확인했다. 값은 전부 문자열이고, 빠진 키는 지금처럼 0으로 본다.

| 화면 | 키 |
|---|---|
| 챔피언·레벨 | `SKIN` (ddragon 챔피언 id와 일치), `LEVEL` |
| 소환사 주문 | `SUMMONER_SPELL_1`, `SUMMONER_SPELL_2` (summoner.json의 `key`) |
| 룬 | `KEYSTONE_ID`, `PERK_SUB_STYLE` (runesReforged.json) |
| KDA | `CHAMPIONS_KILLED`, `NUM_DEATHS`, `ASSISTS` |
| 피해량 | `TOTAL_DAMAGE_DEALT_TO_CHAMPIONS`, `TOTAL_DAMAGE_TAKEN` |
| 와드 | `VISION_WARDS_BOUGHT_IN_GAME` (제어와드), `WARD_PLACED`, `WARD_KILLED` |
| CS | `MINIONS_KILLED` + `NEUTRAL_MINIONS_KILLED`, 분당 CS는 `gameLength` 기준 |
| 골드 | `GOLD_EARNED` |
| 아이템 | `ITEM0`~`ITEM6` (0은 빈 칸, `ITEM6`은 장신구) |
| 오브젝트 | `BARON_KILLS`, `DRAGON_KILLS`, `RIFT_HERALD_KILLS`, `HORDE_KILLS`, `ATAKHAN_KILLS`, `TURRETS_KILLED`, `BARRACKS_KILLED` — 선수별 값을 팀별로 합산 |

## 데이터 모델

```prisma
model ReplayPlayerStat {
  id           String     @id @default(uuid())
  gameResultId String
  gameResult   GameResult @relation(fields: [gameResultId], references: [id])

  puuid    String
  gameName String
  tagLine  String
  team     Team
  position String
  champion String
  level    Int

  spell1   Int
  spell2   Int
  keystone Int
  subStyle Int

  kills   Int
  deaths  Int
  assists Int

  damageDealt Int
  damageTaken Int

  controlWards Int
  wardsPlaced  Int
  wardsKilled  Int

  cs    Int
  gold  Int
  items Int[]   // 길이 7, ITEM0..ITEM6

  baronKills    Int
  dragonKills   Int
  heraldKills   Int
  hordeKills    Int
  atakhanKills  Int
  turretKills   Int
  inhibitorKills Int

  @@unique([gameResultId, puuid])
}
```

- 회원 FK를 두지 않는다. 외부인도 행을 가지며, `deleteMember`가 손댈 필요가 없다.
- `gameResultId` FK에는 cascade를 두지 않는다. 경기 행은 지워지지 않고 취소만 된다.
- `GameResult`에 `replayStats ReplayPlayerStat[]` 역관계를 추가한다.

`GameParticipant`에 `replayPuuid String?`를 추가한다. 리플레이로 저장할 때만 채우고, 손 입력 경기는 null이다.

`GameResult`에 `gameLengthMs Int?`를 추가한다. 분당 CS를 기록 화면에서도 계산하려면 경기 길이가 필요하다. 리플레이 판에만 값이 있다.

**회원·MMR 연결 규칙:** 보드는 `ReplayPlayerStat.puuid` → 같은 경기의 `GameParticipant.replayPuuid`로 회원과
`mmrBefore/mmrAfter`를 찾는다. 읽는 시점의 `RiotAccount`를 조인하지 않는다 — 나중에 계정 주인을 바꾸거나 계정을
지워도 과거 경기의 표시가 변하지 않아야 한다. 흡수·해제는 `GameParticipant.memberId`만 옮기므로 표시가 그대로
따라가고, 회원을 삭제하면(참가 행이 함께 지워지므로) 그 선수는 외부인처럼 MMR 줄 없이 보인다.

## packages/core

- `parseRoflMetadata`: `ReplayPlayer`에 spell1, spell2, keystone, subStyle, items, damageDealt, damageTaken,
  controlWards, wardsPlaced, wardsKilled, gold, 오브젝트 킬 7종을 추가한다.
- 순수 함수를 새로 둔다:
  - `summarizeReplayTeams(players)` → 팀별 `{ kills, gold, baron, dragon, herald, horde, atakhan, turret, inhibitor }`
  - `killParticipation(player, teamKills)` → 0~100 정수 %, 팀 킬 0이면 0
  - `kdaRatio(k, d, a)` → 데스 0이면 `"Perfect"`, 아니면 소수 둘째 자리 문자열
  - 미리보기 예상 변화량은 기존 `calculateTeamMmrChange`를 그대로 쓴다. K·승점·패점은 상수가 아니라
    `/admins`에서 고치는 DB 값이므로 `getMmrConfig(prisma)`의 결과를 `PreparedReplayImport.mmrConfig`로 함께 내려보낸다.

## 저장 경로

지금의 저장 액션은 파일을 다시 받지 않고 `replayKey`와 배정만 받는다. 16MB를 두 번 올리지 않도록 이 모양을 유지한다.

1. 미리보기(`prepareReplayImport`)가 `PreparedReplayImport.players`로 10명의 전체 스탯을 돌려준다.
2. 저장 시 클라이언트가 그 배열을 그대로 `saveReplayImportAction`에 돌려보낸다(`players`, `gameLengthMs` 추가).
3. `saveReplayImport` 트랜잭션:
   1. `computeReplayKey({ players, gameLengthMs })`가 입력 `replayKey`와 같은지 확인한다. 다르면
      `"리플레이 정보가 일치하지 않습니다."`로 실패한다. 다른 경기의 스탯이 끼어드는 것을 막는다. 관리자 전용
      경로이므로 수치 조작까지는 막지 않는다.
   2. 기존 로직(계정 등록 → `saveGameResultTx` → `lastActiveAt` 갱신).
   3. 배정된 회원의 `GameParticipant.replayPuuid`를 채운다.
   4. `ReplayPlayerStat` 10행을 `createMany`한다.

`saveGameResultTx` 자체는 바꾸지 않는다. `replayPuuid`는 그 뒤에 `(gameResultId, memberId)`로 업데이트한다.

## 기존 규칙과의 관계

- `cancelGameResult`: 스탯을 남긴다. 취소된 경기도 확장해서 볼 수 있다(카드 전체가 흐리게). 취소가 `replayKey`를
  비우므로 같은 파일을 다시 올리면 새 `GameResult`에 새 스탯이 붙는다.
- `absorbMember`/`releaseMember`: 변경 없음. 표시는 `GameParticipant.memberId`를 따라간다.
- `deleteMember`: 변경 없음.
- 초기화(`resetAllRatings`): 무관하다. 기록된 `mmrBefore/mmrAfter`는 초기화가 건드리지 않는다.

## 화면

### `GameDetailBoard` (공용, 표시 전용)

props로 `winner`, `gameLengthMs`, `mode`, 선수 10명(스탯 + 선택적 `member: { name, mmrBefore, mmrAfter } | null`)을
받는다. DB·액션을 모른다. 클라이언트 컴포넌트 두 곳에서 모두 쓰인다.

- 블루 위, 레드 아래로 고정한다. 팀 헤더는 `승리 (블루팀)` / `패배 (레드팀)`에 KDA·피해량·와드·CS·아이템 열 제목.
- 행 배경은 승/패 틴트. 색은 시맨틱 토큰만 쓴다(hex 금지, CLAUDE.md Skins 규칙).
- 선수 행:
  - 챔피언 초상 + 레벨 뱃지, 주문 2개, 핵심 룬 + 보조 계열 아이콘
  - 1줄 게임 닉, 2줄 회원명 · `1012→1035 (+23)` (증감 색은 success/danger). 외부인은 `#태그`만
  - `K/D/A (KP%)`, 평점 `x.xx:1` (5 이상·3 이상 강조색, Perfect 포함)
  - 가한/받은 피해 수치 + 막대. 막대 길이는 그 판 10명 중 각 항목의 최대값 기준
  - 제어와드 / 설치 · 제거
  - CS / 분당 CS
  - 아이템 7칸. 0 또는 에셋이 없는 id는 빈 칸
- 가운데 띠: 팀별 오브젝트 수, 총 킬·총 골드 대비 막대.
  칼바람은 포탑·억제기만 보인다. 오브젝트는 한글 라벨(바론·용·전령·유충·아타칸·포탑·억제기)과 수로 표시한다 — ddragon에 아이콘이 없고, 글자가 더 알아보기 쉽다.
- 이미지는 `next/image`가 아닌 `<img loading="lazy">`로 `/ddragon/...`을 직접 가리킨다(정적 파일, 최적화 불필요).

### `/match-history`

- 게임 기록 쿼리(`lib/queries/game-history.ts`)가 `replayStats`와 참가자의 `replayPuuid`를 함께 읽어 행마다 `detail`
  (없으면 null)을 싣는다. 페이지당 20경기 × 10행이라 페이지 쿼리에 함께 싣고 별도 요청은 하지 않는다.
- `GameHistoryList`의 카드에 `detail`이 있을 때만 ▾ 버튼이 생긴다. 펼침 상태는 행별 클라이언트 state이고 URL에
  남기지 않는다.
- 모바일(`md` 미만): 선수당 2줄 카드 — 1줄 초상·주문 | 닉·MMR | KDA, 2줄 아이템. 피해 막대·와드·룬은 숨긴다.
  데스크톱 그리드는 `hidden md:block`, 모바일은 `md:hidden` (CLAUDE.md Mobile 규칙).

### `/replay-import`

- `ReplayImportForm`에서 기존 슬롯 매칭 목록 위에 `GameDetailBoard`를 미리보기로 둔다.
- MMR 줄: 배정된 회원의 현재 MMR(모드별)과 예상 변화량. `PreparedReplayImport.members`에 `mmr`, `aramMmr`를
  추가해 클라이언트에서 계산한다. 배정이 바뀌면 다시 계산한다. 한 팀에 회원이 0명이면 변화량 없이 현재 MMR만.
- 데스크톱 전용 화면이라 모바일 레이아웃은 필요 없다.

## 에셋

`apps/dashboard/scripts/sync-ddragon.ts <원본 폴더>` (`npx tsx`로 실행):

- 복사 → `apps/dashboard/public/ddragon/`
  - `img/champion/*.png`
  - `img/item/*.png`
  - `img/spell/Summoner*.png` 중 summoner.json에 있는 것
  - runesReforged.json이 가리키는 `perk-images/Styles/**` 아이콘(핵심 룬 + 계열 아이콘만)
- 생성 → `apps/dashboard/lib/ddragon/ddragon-map.json`
  - `version`
  - `spells: { [key]: { file, name } }`
  - `runes: { [id]: { icon, name } }` (핵심 룬과 계열)
  - `champions: { [id]: name }` (한글 이름, 툴팁용)
  - `items: { [id]: name }`
- 매핑 생성은 순수 함수(`buildDdragonMap(summoner, runes, champion, item)`)로 분리해 테스트한다.
- 루트의 `16.18.1/`과 `sample/`은 `.gitignore`에 넣는다. `mission/` 등은 복사하지 않는다(원본 101MB → 약 20MB).
- 패치 교체 절차: 새 ddragon 폴더를 받아 스크립트를 다시 돌리고 커밋한다. 교체 전까지 새 아이템·챔피언은 빈 칸으로 나온다.

## 에러 처리

- 키 불일치: `"리플레이 정보가 일치하지 않습니다."` (저장 거부).
- 에셋 누락: 예외 없이 빈 칸.
- 알 수 없는 주문·룬 id: 빈 칸.
- 파싱 실패 문구는 기존 `ROFL_PARSE_ERRORS`를 그대로 쓴다.

## 테스트

- `packages/core`
  - `parse-rofl.test.ts`: 합성 fixture에 새 키를 추가하고 새 필드 파싱과 누락 키 → 0을 검증한다. 실제 rofl은
    이름이 들어 있어 커밋하지 않는다.
  - `summarizeReplayTeams`, `killParticipation`(팀 킬 0 포함), `kdaRatio`(데스 0 → Perfect).
- `apps/dashboard` (통합, 실제 Postgres)
  - `saveReplayImport`: 10행 저장, 배정된 회원의 `replayPuuid` 채움, 키 불일치 거부(아무것도 저장되지 않음).
  - 게임 기록 쿼리: 회원/외부인 구분, `mmrBefore/mmrAfter` 연결, 손 입력 경기는 `detail: null`,
    흡수 후 생존자 이름이 나옴.
  - `test-fixture.ts`의 `buildRoflFixture`에 새 키를 추가한다.
- `buildDdragonMap` 단위 테스트.

## 문서

CLAUDE.md 리플레이 단락에 다음을 추가한다: `ReplayPlayerStat`는 외부인 포함 10명·회원 FK 없음,
회원·MMR 연결은 `GameParticipant.replayPuuid`로 한다, 저장 시 `replayKey` 재계산 검증, ddragon 에셋 교체 절차.

## 범위 밖

- 이미 올린 경기의 스탯 보강(재업로드 보강 모드).
- 챔피언별 전적 등 스탯 집계 화면.
- 솔랭 티어 조회.
- 경기 시점 패치(`gameVersion`)별 에셋 분기 — 에셋은 한 버전만 둔다.
