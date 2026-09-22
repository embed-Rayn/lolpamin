# 라이엇 계정 조회 등록 설계

**날짜:** 2026-09-22
**상태:** 설계 승인 대기

## 배경 및 목적

회원의 라이엇 신원은 지금 두 군데에 흩어져 있다.

- `Member.riotId` — 회원당 하나, 손으로 적는 문자열. `/team-builder`에서 편집. PUUID 없음.
- `RiotAccount` — Member 1:N, `puuid @unique`(불변), `gameName/tagLine`(변경 가능).
  **리플레이 임포트로만** 만들어지고, 어느 화면에도 목록이 보이지 않는다.

`RiotAccount`는 이미 원하는 구조("사람 1:N PUUID(불변) 1:1 Riot ID(변경 가능)")다.
없는 것은 **리플레이 없이 채우는 경로**와 **보는 화면**이다. PUUID는 클라이언트에 표시되지
않아 사람이 손으로 넣을 수 없으므로, Riot Account-V1 API로 Riot ID → PUUID를 조회해
등록한다. 등록 경로를 세 개로 만든다: 회원 정보 화면에서 직접 입력, 리플레이 업로드(기존),
디코·카톡 닉네임에서 추출.

## 범위 밖

- **경기 조회(Match-V5).** 계정 조회만 한다. 내전 자동 수집은 별도 스펙.
- **`Member.riotId` 제거.** 힌트로 그대로 둔다. `scoreRiotAccountMatch`가 리플레이
  매칭에 쓰고, 팀빌더 편집도 유지된다. 검증된 계정이 생겼다고 힌트를 지우지 않는다.
- **닉변 자동 갱신(by-puuid).** 리플레이가 이미 `gameName/tagLine`을 갱신한다. 필요해지면
  추가한다.
- **스키마 변경.** 없다. `RiotAccount`의 생성 규칙 주석만 고친다.

## 원칙 변경 하나

`RiotAccount` 행은 "리플레이에서 관측된 계정으로만" 만든다는 규칙을 "**검증된 PUUID
소스**에서만"으로 넓힌다. 소스는 둘: 리플레이 메타데이터, Riot Account-V1 응답. 둘 다
라이엇이 준 PUUID다. 손으로 적은 문자열(`Member.riotId`, 카톡·디코 닉네임의 `이름#태그`)로
행을 만들지 않는다는 원칙은 그대로다 — 그 문자열은 **조회의 입력**일 뿐이고, 행은 조회가
성공해 PUUID를 받았을 때만 생긴다. 오타면 404가 나고 아무것도 만들어지지 않는다.

`firstSeenAt/lastSeenAt`은 조회로 등록한 계정에서는 조회 시각이다. "리플레이에서 봤다"는
뜻이 아니게 되지만, 두 값은 표시용이고 로직이 읽지 않으므로 컬럼을 늘리지 않는다.

## 구성 요소

### `packages/core/src/parse-riot-id.ts`

```ts
parseRiotId(text: string): { gameName: string; tagLine: string } | null
```

마지막 `#` 기준으로 나눈다(게임 닉에 `#`은 못 들어가지만 방어적으로). 양쪽 trim. 어느
쪽이든 비면 null. 형식 검증은 이것뿐이다 — 길이·문자 규칙은 라이엇이 안다. 순수 함수,
유닛 테스트.

### `apps/dashboard/lib/riot-api/account.ts`

```ts
type RiotAccountLookup = { puuid: string; gameName: string; tagLine: string };
type LookupResult =
  | { ok: true; account: RiotAccountLookup }
  | { ok: false; reason: "not_found" | "unauthorized" | "rate_limited" | "unavailable" };

lookupRiotAccount(gameName, tagLine, deps?: { fetch?, apiKey? }): Promise<LookupResult>
```

- `GET https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`,
  헤더 `X-Riot-Token`. 경로 조각은 `encodeURIComponent`.
- 404 → `not_found`. 401/403 → `unauthorized`(개발 키 24시간 만료가 가장 흔한 원인).
  429 → `rate_limited`. 그 외 5xx·네트워크 오류 → `unavailable`. 예외로 던지지 않고
  결과로 돌려준다 — 배치가 한 건 실패로 멈추면 안 된다.
- 응답의 `gameName/tagLine`을 그대로 쓴다(대소문자·공백이 정본으로 정리돼 온다).
- `apiKey`는 `process.env.RIOT_API_KEY`. 비어 있으면 호출 없이 `unauthorized`.
- `fetch`를 주입받아 테스트는 mock. I/O라 core에 두지 않는다.

### `apps/dashboard/lib/mutations/register-riot-account.ts`

```ts
registerRiotAccount(prisma, memberId, account: RiotAccountLookup): Promise<void>
```

- 회원 실재 확인 먼저. 없으면 `"회원이 존재하지 않습니다"` — FK 위반보다 먼저 잡는다
  (`saveReplayImport`와 같은 이유).
- `puuid`로 찾아 없으면 create, 있으면:
  - `memberId`가 **다른 회원**이면 거부. 메시지에 그 회원 이름을 넣는다
    (`"이미 ○○ 회원의 계정입니다"`). 실수로 덮어 한 사람의 계정을 옮기는 일을 막는다.
    옮기려면 그쪽에서 먼저 해제한다.
  - `memberId === null`(외부인 확정)이면 관리자의 명시적 등록이 우선 → 회원에게 붙인다.
  - 같은 회원이면 `gameName/tagLine/lastSeenAt`만 갱신.
  - 주인이 바뀌면 `absorbedFromId`를 지운다 — `saveReplayImport`와 같은 규칙.
- 단일 행이라 트랜잭션 없이도 되지만, 확인-쓰기 사이 경합을 막기 위해 `$transaction`.

```ts
removeRiotAccount(prisma, riotAccountId): Promise<void>
```

행을 **삭제**한다. `memberId = null`로 두면 "외부인으로 확정, 다시 묻지 말 것"이 되어
잘못 붙인 계정을 뗀 것과 구별되지 않는다. 지우면 다음 리플레이에서 다시 후보로 뜬다.

### `apps/dashboard/lib/mutations/register-riot-accounts-from-hints.ts`

```ts
registerRiotAccountsFromHints(
  prisma,
  lookup: typeof lookupRiotAccount,
): Promise<{ registered: number; notFound: number; conflicts: number; skipped: number; unauthorized: boolean }>
```

- 대상: `mergedIntoId: null`이고 `riotAccounts`가 **하나도 없는** 회원. 이미 계정이 있는
  회원은 건너뛴다(부계정까지 찾아 주는 기능이 아니다).
- 힌트 우선순위: `discordRiotHint(discordDisplayName)` → `kakaoRiotHint(카톡 닉네임)` →
  `Member.riotId`. 첫 번째로 `parseRiotId`가 통과하는 것 하나만 조회한다. 카톡 닉네임은
  `displayKakaoNickname`과 같이 묘비 최신 것까지 본다.
- 힌트가 없으면 `skipped`. 404면 `notFound`. 다른 회원 소유면 `conflicts`.
  `unauthorized`가 한 번이라도 나오면 즉시 중단하고 `unauthorized: true` — 키가 죽었는데
  40번 더 부를 이유가 없다. `rate_limited`는 2초 쉬고 한 번 재시도, 또 나오면 중단.
- 순차 호출. 개발 키 한도(20/s, 100/2분)에 40명은 여유다.
- 자동 실행하지 않는다. 디코 임포트에 끼워 넣으면 임포트가 외부 API에 묶인다.

### `/member-info` — "라이엇 계정" 컬럼

- `getMemberInfoRows`가 회원별 `riotAccounts`(`id, gameName, tagLine`)를 실어 온다.
  묘비의 계정은 `absorbMember`가 생존자로 옮기므로 자기 것만 보면 된다.
- 칩 `gameName#tagLine` N개. 없으면 `-`.
- 관리자: 칩 옆 `×` → `removeRiotAccount`(confirm 한 번). 컬럼 끝에 입력창
  "이름#태그" + Enter → 서버 액션 `registerRiotAccountByLookupAction(memberId, text)`:
  `parseRiotId` → `lookupRiotAccount` → `registerRiotAccount`. 에러 문구:
  - 형식: `"이름#태그 형식으로 입력해 주세요"`
  - `not_found`: `"라이엇에 없는 계정입니다"`
  - `unauthorized`: `"Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY)"`
  - `rate_limited`/`unavailable`: `"잠시 후 다시 시도해 주세요"`
  - 충돌: mutation 메시지 그대로
- 폰 카드(`MemberInfoCard`)에도 칩만 표시. 편집은 데스크톱만 — 기존 셀들과 같다.
- 정렬 컬럼 추가 안 함.

### `/link-accounts` — "닉네임에서 라이엇 계정 찾기" 버튼

- 관리자만. 클릭 → confirm(`"라이엇 계정이 없는 회원 N명의 닉네임으로 Riot API를 조회합니다"`)
  → `registerRiotAccountsFromHintsAction` → 결과 문구
  `"등록 3 · 못 찾음 2 · 충돌 0 · 힌트 없음 5"`. `unauthorized`면 키 문구.
- `AccountMappingPanel` 상단, 기존 「디스코드 회원 가져오기」 버튼 옆.

### 리플레이 업로드

변경 없음. `saveReplayImport`가 하던 등록이 세 경로 중 하나가 된다.

## 환경 변수

- `.env`: `RIOT_API_KEY="RGAPI-…"`. `.env.example`·`.env.prod.example`에 플레이스홀더와
  "developer.riotgames.com, 개발 키는 24시간 만료" 주석.
- 서버 `.env`에도 넣어야 한다. `docker-compose.prod.yml`의 dashboard는 `env_file`이 아니라
  `environment`로 `DATABASE_URL`만 넘기므로 `RIOT_API_KEY: ${RIOT_API_KEY:-}`를 추가한다
  (비어 있어도 컨테이너는 뜨고 조회만 `unauthorized`).
- 개발 키는 매일 갱신해야 한다. 귀찮으면 Personal API Key(신청, 영구, 같은 한도).

## 테스트

| 대상 | 종류 |
|---|---|
| `parseRiotId` | core 유닛: 정상, `#` 없음, 빈 조각, 앞뒤 공백, `#` 둘 |
| `lookupRiotAccount` | fetch mock: 200 → ok, 404/401/429/500/throw → 각 reason, 키 없음 → unauthorized 호출 0회, URL 인코딩 |
| `registerRiotAccount` | DB 통합: 신규, 같은 회원 갱신, 외부인(null) → 회원, 다른 회원 → 거부, 없는 회원 → 거부, 주인 변경 시 absorbedFromId 초기화 |
| `removeRiotAccount` | DB 통합: 삭제, 없는 id → 조용히 무시 |
| `registerRiotAccountsFromHints` | DB 통합 + lookup 주입: 힌트 우선순위, 이미 계정 있는 회원 건너뜀, 집계, unauthorized 즉시 중단 |
| `getMemberInfoRows` | 기존 테스트에 `riotAccounts` 필드 추가 |

## CLAUDE.md 갱신

"`RiotAccount`는 리플레이에서 관측된 계정으로만 만든다" 문단을 "검증된 PUUID 소스(리플레이,
Riot Account-V1 조회)로만" 으로 고치고, 손으로 적은 문자열은 조회의 입력일 뿐 행의 근거가
아니라는 문장을 남긴다. `removeRiotAccount`가 null이 아니라 삭제인 이유 한 줄.
