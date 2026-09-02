# 계정 매칭과 되돌릴 수 있는 연결 설계

**날짜:** 2026-09-01
**상태:** 설계 승인 대기
**관련 문서:** `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md` (전체 시스템 설계), `docs/superpowers/specs/2026-08-31-member-data-intake-and-editing-design.md` (회원 데이터 유입·정리·편집)

## 배경 및 목적

디스코드 회원 가져오기가 배포되고 Server Members Intent가 켜지면서, 처음으로 양쪽 계정이 한 시스템 안에 들어왔다. 실제 데이터는 디스코드 25명(봇 제외)과 카톡 16명이다. 이 상태에서 세 가지가 막힌다.

**1. 닉네임이 바뀌면 활동 기록이 갈라진다.** 카카오톡 대화 내보내기에는 사용자 ID가 없고 표시 닉네임만 있다. `processKakaoExport`는 `kakaoNickname`을 정확히 일치시켜 매칭하므로, 회원이 닉네임을 바꾸면 다음 임포트에서 별개 회원이 생기고 과거 활동과 끊긴다. 디스코드는 `discordUserId`가 불변이라 이 문제가 없지만, 카톡 쪽은 원리적으로 닉네임 외에 붙잡을 것이 없다.

**2. 연결할 때 누가 누군지 알기 어렵다.** `/link-accounts`는 미연결 목록 두 개를 나란히 보여줄 뿐이고, 25 × 16을 사람이 눈으로 대조해야 한다. 게다가 디스코드 쪽에 표시되는 값은 `username`(`daehyeok_`, `k._.dj` 같은 값)이라 대조에 거의 쓸모가 없다.

**3. 잘못 연결하면 되돌릴 수 없다.** `linkMembers`는 카톡 쪽 `Member` 행을 삭제하고 병합한다. 활동 기록을 생존자로 옮긴 뒤 행을 지우므로, 잘못 눌렀을 때 원상복구할 방법이 없다.

세 문제는 겉보기에 다르지만 뿌리가 같다 — **"닉네임 문자열 = 신원"이라는 전제와, 병합이 파괴적이라는 점**이다. 이 설계는 병합을 비파괴적으로 바꿔 셋을 한 메커니즘으로 푼다.

## 범위

**포함:**

- `Member` 병합을 삭제 대신 묘비(tombstone) 표시로 바꾸고, 연결을 되돌릴 수 있게 한다.
- 묘비가 보존하는 과거 닉네임을 임포트 매칭에 사용해, 닉네임이 바뀌어도 활동이 이어지게 한다.
- 카톡 닉네임과 디스코드 표시 이름을 대조해 연결 후보를 점수순으로 제안한다.
- 디스코드 서버 별명(`nick`)을 저장해 매칭·표시에 쓴다.
- `/link-accounts`에서 연결 생성과 해제를 모두 처리한다.
- 경기 결과 입력의 "연결됨" 판정을 실제로 채워지는 필드 기준으로 고친다.

**범위 밖:**

- **한 사람에게 계정 여러 개**(디스코드 부계정, 카톡 재가입)를 붙이는 일반화. 묘비 모델이 구조적으로 이를 허용하지만, 이번에는 카톡 반쪽 행만 흡수 대상으로 한다.
- **자동 연결.** 점수가 아무리 높아도 확정은 사람이 누른다. 임계값은 관측된 16건에 맞춰 고른 값이라 과적합 위험이 있고, 오연결은 활동 기록을 엉뚱한 사람에게 붙인다.
- **이미 삭제된 행의 복구.** 2026-08-31 정규화 스크립트가 개발 DB에서 7행을 실제로 삭제했다. 이 설계는 앞으로의 병합에만 적용된다.
- **디스코드 닉네임 변경 추적.** `discordUserId`가 불변이라 가져오기가 `discordHandle`/`discordDisplayName`을 자동으로 갱신한다. 별도 장치가 필요 없다.
- **회원 상세 화면.** 되돌리기는 `/link-accounts`에서 한다.

## 데이터 모델

`Member`에 컬럼 두 개를 추가한다. 다른 스키마 변경은 없다.

```prisma
model Member {
  ...
  discordDisplayName String?
  mergedIntoId       String?
  mergedInto         Member?  @relation("MemberMerge", fields: [mergedIntoId], references: [id])
  absorbed           Member[] @relation("MemberMerge")

  @@index([mergedIntoId])
}
```

**활성 회원은 `mergedIntoId IS NULL`인 행이다.** 그 외는 묘비이며, 자기 `kakaoNickname`을 그대로 보존해 과거 닉네임(별칭) 역할을 한다. 기존 행은 전부 `NULL`이 되므로 마이그레이션은 후방호환된다.

### 불변식

1. **묘비는 `discordUserId`와 `kakaoUserId`가 모두 `null`이어야 한다.** 두 컬럼은 `@unique`다. 묘비가 값을 쥐고 있으면 같은 계정을 다시 가져올 때 유니크 제약에 막힌다. 이 조건은 이미 성립한다 — 연결은 디스코드 쪽이 생존자가 되고, 정규화 병합은 `discordUserId` 보유자를 우선 생존시키며 한 그룹에 둘 이상이면 예외를 던진다.
2. **`mergedIntoId`는 항상 활성 회원을 가리킨다.** 흡수 대상이 이미 묘비면 그 생존자로 바꿔 가리킨다(체인 압축). 조회에서 재귀를 타지 않는다.

### 활동 기록의 귀속

**활동 기록을 옮기지 않는다.** 지금 `linkMembers`와 정규화 스크립트는 `MentionLog.memberId`/`GameParticipant.memberId`를 생존자로 `updateMany` 하는데, 이 로직을 없앤다. 로그는 원래 행(묘비)에 그대로 남고, `Member.lastActiveAt`만 생존자에 갱신한다.

이 선택이 되돌리기를 단순하게 만든다. 어떤 로그가 원래 누구 것이었는지 따로 기록할 필요가 없고, 되돌리기는 `mergedIntoId`를 `null`로 되돌린 뒤 양쪽 `lastActiveAt`을 각자의 로그에서 다시 계산하는 것으로 끝난다.

회원별 활동량을 세는 쿼리가 없기 때문에 가능한 선택이다 — 활동은 `Member.lastActiveAt` 컬럼 하나로 관리되고 `MentionLog`는 감사용으로만 쌓인다. `GameParticipant`는 미활동 리포트가 `_count`로 세는데, 묘비는 경기에 참가할 수 없으므로(아래 참조) 묘비에 `GameParticipant`가 생기는 경로는 흡수 이전에 이미 참가한 경우뿐이다. 그 값은 묘비에 남아 생존자의 경기 수에 잡히지 않는다 — 지금도 연결 전 경기 기록이 없으므로 실질 영향이 없고, 되돌릴 수 있다는 이점이 더 크다.

## 매칭과 후보 제안

### 디스코드 표시 이름

`importDiscordMembers`가 `Member.discordDisplayName`에 `nick ?? global_name`을 저장한다(둘 다 없으면 `null`). `discordHandle`은 지금처럼 `username`을 담아 안정적 식별자로 남긴다.

전체 설계 문서가 "`global_name`은 사람이 자주 바꾸므로 쓰지 않는다"고 한 것은 *식별자*로 쓰지 말라는 뜻이었다. 매칭·표시용으로는 별개 컬럼이 필요하다. 실제 데이터에서 `username`은 `daehyeok_`, `k._.dj` 같은 값인 반면 서버 별명은 `유대혁/95/유대혁#KR1/sup`처럼 카톡 닉네임과 거의 같은 형식이다.

### 점수 함수

`packages/core`에 순수 함수를 둔다. DB도 디스코드 API도 모르는 문자열 함수다.

```ts
scoreAccountMatch(kakaoNickname: string, discordDisplayName: string): { score: number; reasons: string[] }
```

정규화: 소문자로 바꾸고 공백과 `#`, `.`, `_`, `-`를 제거한다. 조각 분해: `/`로 나누고, 빈 조각과 숫자만인 조각(나이)을 버린다.

| 신호 | 점수 | 설명 |
|---|---|---|
| 실명 완전일치 | 100 | 첫 조각끼리 정규화 후 같음 |
| 실명 접미사 일치 | 60 | 한쪽이 다른 쪽의 접미사 (`동명` ⊂ `국동명`) — 카톡에서 성을 빼는 습관 |
| 게임닉 조각 일치 | 80 | 첫 조각을 뺀 나머지 중 길이 3 이상이 서로 같거나 한쪽이 다른 쪽으로 시작 |

실명 완전일치와 접미사 일치는 배타적이다(완전일치가 우선).

**단독 후보** = 최고점이 140 이상이거나 2위와 60점 이상 벌어진 경우. 그 외에는 후보를 점수순으로 나열만 한다.

### 실측 결과

2026-09-01 시점의 실데이터(디스코드 25명 × 카톡 16명)로 검증했다.

**카톡 16명 전원이 단독 후보로 나왔고, 16건 모두 정답이었다. 모호 0건, 후보 없음 0건.**

실명만으로는 13명(81%)만 잡힌다. 나머지 3명은 전부 카톡에서 성을 뺀 경우이고, 두 신호를 합치면 전부 잡힌다:

| 카톡 | 디스코드 | 근거 |
|---|---|---|
| `시형/95/즐겜유저니로바#KR1` | `박시형/95/즐겜유저니로바#KR1` | 실명접미사 + 게임닉일치 |
| `윤찬/85/드랍더비추kr3` | `허윤찬/드랍더비추 #KR3/서폿` | 실명접미사 + 게임닉일치 |
| `국동명/99/kooki#kr99` | `동명` (서버 별명 없음) | 실명접미사 단독 |

이 16쌍을 단위 테스트에 그대로 넣는다. 함께 있으면서도 매칭되면 안 되는 쌍(예: `윤소영/95/사육사#1003` ↔ `윤소영(지인)`)도 음성 케이스로 넣는다.

## 흐름과 화면

### 흡수와 해제

연결과 별칭 추가는 같은 동작이다 — 둘 다 "이 카톡 행을 저 회원에게 흡수시킨다"이다. 함수 하나로 통일한다.

```ts
absorbMember(prisma: PrismaClient, loserId: string, survivorId: string): Promise<void>
releaseMember(prisma: PrismaClient, tombstoneId: string): Promise<void>
```

`absorbMember`는 한 트랜잭션 안에서:

1. `loser`가 활성이고 `discordUserId`·`kakaoUserId`가 모두 `null`인지 검사한다(불변식 1).
2. `survivor`가 묘비면 그 생존자로 대체한다(불변식 2). 대체 후 `loser === survivor`면 거부한다.
3. `survivor`의 `realName`/`age`/`riotId`가 비어 있으면 `loser`의 값으로 채운다. `elo`는 건드리지 않는다.
4. `survivor.lastActiveAt`을 둘 중 최신 값으로 올린다.
5. `loser.mergedIntoId = survivor.id`.

행을 지우지 않고 로그도 옮기지 않으므로, 지금의 `linkMembers`보다 짧아진다. `linkMembers`는 이 함수로 대체되어 사라지고, 그것만 쓰던 `packages/core`의 `mergeMembers`도 함께 제거한다 — `absorbMember`는 빈 필드만 채우므로 별도의 병합 규칙이 필요 없다.

`releaseMember`는 대상이 묘비인지 확인하고 `mergedIntoId`를 `null`로 되돌린 뒤, 해제된 행과 이전 생존자의 `lastActiveAt`을 각자의 `MentionLog` 최댓값에서 다시 계산한다(로그가 없으면 `null`).

### 리뷰 큐

**새 테이블을 만들지 않는다.** 임포트가 처음 보는 닉네임으로 반쪽 회원을 만들면 그 행은 자동으로 `/link-accounts`의 "미연결 카톡 계정" 목록에 나타난다. 이미 있는 화면이 리뷰 큐 역할을 한다.

임포트 결과 요약에 `확인 필요 N명`을 덧붙여 관리자가 새 닉네임이 생겼음을 바로 알게 한다. `N`은 이번 임포트가 새로 만든 회원 수(`newMembers`)다.

### 화면

`/link-accounts`가 세 가지를 한다.

1. **미연결 카톡 계정을 하나 고르면 후보가 점수순으로 뜬다.** 후보는 두 종류가 섞인다 — 미연결 디스코드 계정(신규 가입자)과 **이미 연결된 활성 회원**(닉네임을 바꾼 사람). 후자가 닉네임 변경 문제를 푸는 경로다. 각 후보에 `실명일치 · 게임닉일치` 같은 근거를 함께 표시하고, 단독 후보는 눈에 띄게 표시한다.
2. **연결** 버튼이 `absorbMember`를 호출한다.
3. **"연결된 계정" 섹션** — 묘비를 가진 활성 회원과 그 별칭 목록, 각 별칭에 **끊기** 버튼(`releaseMember`). 연결을 만드는 곳과 푸는 곳이 같은 화면에 있다.

`/members` 표는 활성 회원만 보여주므로 겉보기 변화가 없다. 묘비는 목록·정렬·리더보드·미활동 리포트 어디에도 나타나지 않는다.

## 기존 코드 영향

**활성 필터(`mergedIntoId: null`)를 추가하는 곳:** `lib/queries/members.ts`, `lib/queries/inactive.ts`, `lib/queries/linked-members.ts`, `lib/queries/pending-accounts.ts`, `components/AppShell.tsx`(회원 수), `apps/discord-bot/src/lib/get-leaderboard.ts`, `apps/discord-bot/src/lib/get-member-rank.ts`. 대부분 `where` 한 줄이다.

`get-member-by-discord-id.ts`는 `discordUserId`로 찾으므로 불변식 1에 의해 묘비를 절대 만나지 않는다. 손대지 않는다.

**`processKakaoExport`의 매칭 변경 — 이 설계의 핵심 동작이다.** 닉네임 조회에서 묘비를 제외하지 않는다. 히트한 행이 묘비면 `mergedIntoId`를 따라가 **생존자의 `lastActiveAt`**을 갱신하고, `MentionLog`는 히트한 행(묘비)에 그대로 단다. 히트가 없을 때 새 회원을 만드는 동작은 지금과 같다.

**정규화 스크립트**(`normalize-kakao-nicknames.ts`)도 `member.delete()` 대신 묘비 표시로 바꾸고, `MentionLog`/`GameParticipant` 이동을 없앤다. `NormalizeResult.mergedPairs`의 `movedMentionLogs`/`movedGameParticipants`는 더 이상 "옮긴 수"가 아니므로 `loserMentionLogs`/`loserGameParticipants`로 이름을 바꿔 묘비에 남는 수를 보고한다.

**`deleteMember`**는 대상이 흡수한 묘비들을 함께 삭제한다(각 묘비의 `MentionLog`·`GameParticipant` 포함). 그러지 않으면 `mergedIntoId`가 고아가 된다. 지금도 활동 기록을 함께 지우고 있으므로 성격이 같다.

**`saveGameResult`의 연결 판정 버그.** 현재 참가자에게 `discordUserId && kakaoUserId`를 요구하는데, **`kakaoUserId`를 채우는 경로가 시스템에 없다**(카카오톡 봇이 폐기되면서 사라졌다). 즉 지금 경기 결과 입력은 누구를 넣어도 거부되며, 프로덕션에 경기 0건·ELO 전원 1000인 이유가 이것이다. 판정을 `discordUserId !== null && kakaoNickname !== null`로 바꾸고, 묘비는 참가자가 될 수 없게 막는다.

## 에러 처리

- **`absorbMember` 거부 조건** — `loser`가 이미 묘비, `loser`가 `discordUserId`나 `kakaoUserId`를 보유, 대체 후 `loser === survivor`. 각각 사람이 조치할 수 있는 문구로 예외를 던지고, 전체가 한 트랜잭션이므로 아무것도 반영되지 않는다.
- **`releaseMember` 거부 조건** — 대상이 묘비가 아님.
- **서버 액션** — 데이터를 바꾸는 액션은 본문 첫 줄에서 `await requireAdmin()`을 호출한다. 실패는 해당 행에만 짧은 한글 문구로 표시하고 나머지 화면은 그대로 둔다.
- **후보 계산 실패는 없다.** 점수 함수는 순수 함수이며 예외를 던지지 않는다. 후보가 하나도 없으면 목록이 비고, 관리자는 여전히 아무 회원이나 골라 연결할 수 있다.

## 테스트 전략

- **`scoreAccountMatch`** — 순수 함수 단위 테스트. 위 실측 16쌍을 양성 케이스로, `윤소영/95/사육사#1003` ↔ `윤소영(지인)` 같은 쌍을 음성 케이스로 넣는다. 정규화 경계(전각 괄호, 대소문자, 공백)도 포함한다.
- **`absorbMember` / `releaseMember`** — `DATABASE_URL_TEST` 대상 통합 테스트: 흡수 후 활성 목록에서 사라지는지, `MentionLog`가 묘비에 남는지, 해제하면 활성으로 돌아오고 양쪽 `lastActiveAt`이 로그에서 재계산되는지, 체인 압축이 동작하는지, 불변식 위반이 거부되는지, 거부 시 아무것도 바뀌지 않는지.
- **`processKakaoExport`** — 묘비 닉네임으로 들어온 멘션이 생존자의 `lastActiveAt`을 올리고 `MentionLog`는 묘비에 달리는지.
- **활성 필터** — 각 쿼리가 묘비를 제외하는지. 묘비를 하나 만들어 두고 목록·리더보드·미활동 리포트·경기 참가자 후보에서 빠지는지 확인한다.
- **`deleteMember`** — 묘비를 가진 회원을 지우면 묘비와 그 활동 기록까지 사라지는지.
- **`saveGameResult`** — `discordUserId`와 `kakaoNickname`이 있는 회원은 참가할 수 있고, 묘비와 반쪽 회원은 거부되는지.

## 알려진 한계

- **카톡 닉네임 변경은 여전히 사람이 알려줘야 한다.** 대화 내보내기에 사용자 ID가 없는 이상 자동으로 알 방법이 없다. 이 설계가 하는 일은 한 번 알려주면 그다음부터 자동으로 이어지게 만드는 것이다.
- **묘비는 계속 쌓인다.** 삭제가 없으므로 병합할 때마다 행이 는다. 모임 규모(수십 명)에서는 무해하고, 정리가 필요해지면 별도 작업으로 다룬다.
- **임계값은 한 번의 스냅샷에 맞춘 값이다.** 회원이 늘면 다시 재봐야 한다. 자동 연결을 하지 않는 이유가 이것이다.
- **흡수 대상은 카톡 반쪽 행뿐이다.** 디스코드 계정을 다른 회원에 흡수시키려면 불변식 1을 완화해야 하고, 그건 계정 여러 개를 다루는 별도 설계의 몫이다.
- **연결 전에 쌓인 `GameParticipant`는 생존자의 경기 수에 잡히지 않는다.** 묘비에 남기 때문이다. 현재 경기 기록이 0건이라 실질 영향이 없다.
