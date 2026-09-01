# 경기 기록과 운영 로그 설계

- 작성일: 2026-09-01
- 관련 스펙: `docs/superpowers/specs/2026-09-01-account-matching-and-reversible-linking-design.md`

## 배경 및 목적

지금은 경기 결과를 입력하면 ELO만 움직이고 끝난다. `/matches`는 입력 화면일 뿐 지난 경기를 볼 수 없고, 잘못 입력해도 되돌릴 방법이 없다. 운영진이 여럿이지만 누가 무엇을 했는지도 남지 않는다.

세 가지를 만든다.

1. **경기 기록** — 언제 누가 이겼고 누구의 점수가 어떻게 움직였는지 본다.
2. **되돌리기** — 가장 최근 한 판을 취소한다. 취소하면 그 앞 판이 다시 취소 대상이 된다.
3. **운영 로그** — 어떤 운영진이 입력했고 취소했는지, 그리고 회원 정보를 누가 바꿨는지 본다.

## 범위

**포함**

- 경기 목록 화면과 참가자별 점수 변동 표시
- 가장 최근 경기 취소 (ELO 복원)
- 경기 입력·취소의 운영진 귀속
- 회원 변경(연결·끊기·실명 수정·삭제·정규화)의 운영진 귀속과 목록

**제외**

- 취소한 경기를 되살리는 기능. 되살리기가 있으면 아래의 LIFO 규칙이 깨진다.
- ELO 수동 조정. 지금 ELO를 바꾸는 경로는 `saveGameResult` 하나뿐이고, 이 스펙은 그 사실을 바꾸지 않는다.
- 임포트(카톡·디스코드) 로그. 회원을 대량 생성하지만 개별 회원 변경 이력과 성격이 다르다.
- 로그 검색·필터·페이지네이션. 지금 규모(회원 41명)에서는 전부 불러도 된다.

## 데이터 모델

### 경기: 컬럼 세 개 추가

```prisma
model GameResult {
  id        String   @id @default(uuid())
  playedAt  DateTime
  winner    Team
  createdAt DateTime @default(now())

  createdById   String?    // 입력한 운영진. FK 아님
  cancelledAt   DateTime?  // null이면 살아 있는 경기
  cancelledById String?    // 취소한 운영진. FK 아님

  participants GameParticipant[]
}
```

경기 로그는 **별도 테이블을 두지 않는다.** 「누가 언제 입력/취소했나」는 위 네 컬럼(`createdAt` 포함)에 다 담기고, 점수 변동은 이미 `GameParticipant.eloBefore/eloAfter`에 있다. 로그 테이블을 따로 두면 같은 사실이 두 군데에 저장되어 어긋날 여지만 생긴다.

`cancelledAt`이 세 가지를 동시에 해결한다 — 취소 표시, 취소 시각 로그, 그리고 「살아 있는 경기」 판정.

### 회원 변경: 새 테이블

연결·끊기는 지금 흔적이 남지 않는다. 연결은 `mergedIntoId`를 심고 끊기는 그 값을 지우므로, **끊고 나면 연결했던 사실 자체가 사라진다.** 누가 언제 했는지도 없다. 그래서 여기는 이벤트를 쌓을 자리가 필요하다.

```prisma
model MemberChangeLog {
  id          String             @id @default(uuid())
  memberId    String             // FK 아님 — 회원이 삭제돼도 로그는 남는다
  memberLabel String             // 그 시점의 표시 이름 스냅샷
  adminId     String?            // FK 아님 — null이면 스크립트 실행
  action      MemberChangeAction
  before      String?
  after       String?
  createdAt   DateTime           @default(now())

  @@index([memberId])
  @@index([createdAt])
}

enum MemberChangeAction {
  ABSORB
  RELEASE
  RENAME
  DELETE
  NORMALIZE
}
```

`memberId`와 `adminId` 모두 외래키로 걸지 않는다. `Admin.createdById`가 이미 같은 이유로 그렇게 되어 있다 — 대상이 지워져도 「누가 무엇을 했는지」는 남아야 한다. 조회에 실패하면 화면에서 「삭제된 관리자」/「삭제된 회원」으로 표시하고, `memberLabel` 스냅샷 덕분에 삭제된 회원도 누구였는지 읽힌다.

`before`/`after`에 담는 값:

| action | before | after |
|---|---|---|
| `ABSORB` | 흡수된 회원의 카톡 닉네임 | 생존자의 표시 이름 |
| `RELEASE` | 생존자의 표시 이름 | 풀려난 회원의 카톡 닉네임 |
| `RENAME` | 이전 실명 | 새 실명 |
| `DELETE` | 삭제된 회원의 표시 이름 | `null` |
| `NORMALIZE` | 정규화 전 닉네임 | 정규화 후 닉네임 |

## 되돌리기

### 규칙

취소할 수 있는 경기는 **`cancelledAt IS NULL`인 경기 중 `createdAt`이 가장 늦은 것** 하나뿐이다.

「최근」의 기준은 `playedAt`이 아니라 `createdAt`이다. ELO는 입력한 순서대로 누적되므로, 경기 날짜를 과거로 적어 나중에 입력한 판이 있어도 되돌리기는 입력 역순으로 빠져야 계산이 맞는다.

### 왜 정확한가

취소는 각 참가자의 `elo`를 그 경기의 `eloBefore`로 되돌린다. 재계산하지 않는다.

이게 항상 옳은 이유: 대상이 「살아 있는 것 중 가장 최근」이므로, 그 참가자들이 이후에 뛴 살아 있는 경기가 없다. 이후에 뛴 경기가 있더라도 그것이 이미 취소됐다면 그 취소가 이미 자기 몫을 되돌려 놓았으므로, 현재 `elo`는 정확히 이 경기의 `eloAfter`와 같다.

한 판을 취소하면 그 앞 판이 조건을 만족하게 되어 연달아 되돌릴 수 있다. 스택에서 하나씩 빼는 것과 같다.

**취소는 되살릴 수 없다.** 되살리기를 허용하면 취소가 더 이상 LIFO가 아니게 되고, 위의 정확성 근거가 무너진다.

### 취소가 하는 일

한 트랜잭션 안에서:

1. 대상이 취소 가능한지 확인한다. 아니면 거부한다.
2. 참가자마다 `member.elo = participant.eloBefore`로 되돌린다.
3. `cancelledAt = now()`, `cancelledById = <운영진 id>`를 쓴다.

참가 기록(`GameParticipant`)은 지우지 않는다. 그 경기에 누가 뛰었고 점수가 어떻게 움직였는지가 취소된 뒤에도 보여야 한다. 회원 병합에서 활동 기록을 옮기지 않는 것과 같은 방침이다.

## 화면

### `/match-history` — 「경기 기록」 탭

경기를 `createdAt` 역순으로 나열한다. 한 줄에 날짜, 승리 팀, 입력한 운영진. 펼치면 참가자별 점수 변동을 오른 쪽과 내린 쪽으로 나눠 보여준다.

```
09-01 21:00   블루 승   admin 입력
  ↑ 유대혁 1015→1030   심현석 1002→1017   김하제 998→1013
  ↓ 손민준 1040→1025   윤소영 1010→995    박병준 1001→986

09-01 20:00   레드 승   admin 입력                      [되돌리기]

08-31 21:00   취소됨    admin 입력 · sujin 취소
  ↕ 롤백 — 유대혁 1030→1015 …
```

취소된 경기는 회색으로 낮춰 표시한다. 「되돌리기」 버튼은 취소 가능한 한 경기에만 붙고, 관리자만 볼 수 있다.

이 화면에는 **경기 관련 로그만** 둔다.

### `/link-accounts` 아래 「변경 기록」

`MemberChangeLog`를 시간 역순으로 나열한다. 연결·끊기와 회원 정보 변경(실명 수정, 삭제, 정규화)만 담는다. 경기는 담지 않는다.

```
09-01 20:55  admin   연결    유대혁/95/유대혁#KR1  →  유대혁
09-01 20:40  sujin   삭제    박시형
09-01 19:30  (스크립트) 정규화  윤찬/85/드랍더비추kr3 (8시) → 윤찬/85/드랍더비추kr3
```

### 내비게이션

`AppShell`의 `activeNav` 합집합에 `match-history`를 추가하고 「게임 결과 입력」 다음에 「경기 기록」을 넣는다.

## 기존 코드 영향

### 운영진 귀속을 위한 시그니처 변경

로그를 남기려면 뮤테이션이 운영진을 알아야 한다. 지금 `requireAdmin()`은 서버 액션 층에만 있다. 아래 네 개가 `adminId`를 인자로 받고, 로그를 각자의 트랜잭션 안에서 쓴다.

- `absorbMember(prisma, loserId, survivorId, adminId)`
- `releaseMember(prisma, tombstoneId, adminId)`
- `updateMemberRealName(prisma, memberId, realName, adminId)`
- `deleteMember(prisma, memberId, adminId)`

`saveGameResult`는 `input`에 `createdById`를 더한다.

`normalizeKakaoNicknames`는 CLI 스크립트(`apps/dashboard/scripts/normalize-kakao-nicknames.ts`)로 실행되어 세션이 없다. `adminId`를 `null`로 남기고 화면에서 「스크립트」로 표시한다.

### 취소된 경기를 내전 횟수에서 뺀다

`apps/dashboard/lib/queries/members.ts`와 `apps/dashboard/lib/queries/inactive.ts`가 `_count.participants`를 그냥 세고 있다. 손대지 않으면 취소한 경기가 계속 내전 횟수에 잡힌다. 취소되지 않은 경기의 참가만 세도록 고친다.

`members.ts`의 삭제 확인창 숫자는 예외다. 그 숫자는 「지워질 행이 몇 개인가」이고 취소된 경기의 참가 기록도 함께 지워지므로, 거기서는 취소 여부와 무관하게 전부 센다.

### 매치 풀

`getLinkedMembers`는 바뀌지 않는다. 취소는 참가 자격과 무관하다.

## 에러 처리

취소가 거부되는 경우와 문구:

| 상황 | 문구 |
|---|---|
| 이미 취소된 경기 | 이미 취소된 경기입니다. |
| 가장 최근 경기가 아님 | 가장 최근 경기만 되돌릴 수 있습니다. 뒤에 입력된 경기를 먼저 되돌리세요. |
| 경기가 없음 | 경기를 찾을 수 없습니다. |

`/link-accounts`의 서버 액션이 이미 쓰는 방식을 따른다 — 의도한 문구만 화면에 그대로 보여주고 그 외에는 고정된 한글 폴백을 쓴다.

모든 뮤테이션 서버 액션은 데이터에 손대기 전에 `await requireAdmin()`을 호출한다. `apps/dashboard/lib/auth/action-guards.test.ts`가 이를 검사한다.

## 테스트 전략

DB를 건드리는 테스트는 `DATABASE_URL_TEST` 가드로 시작한다.

**취소의 정확성** — 핵심이다.

- 경기 하나를 취소하면 모든 참가자의 `elo`가 정확히 `eloBefore`로 돌아온다.
- 두 판을 연달아 입력한 뒤 두 번 취소하면 모든 참가자가 첫 경기 이전 값으로 돌아온다.
- 가장 최근이 아닌 경기를 취소하려 하면 거부되고, DB 상태가 변하지 않는다.
- 이미 취소된 경기를 다시 취소하려 하면 거부된다.
- `playedAt`이 과거인 경기를 나중에 입력했을 때, 취소 대상이 `createdAt` 기준으로 정해진다.
- 참가자가 겹치지 않는 두 경기라도 LIFO를 지킨다.

**로그**

- 경기 입력이 `createdById`를 남기고, 취소가 `cancelledById`와 `cancelledAt`을 남긴다.
- 네 뮤테이션이 각각 대응하는 `MemberChangeLog` 행을 남긴다.
- 회원을 삭제해도 그 회원의 로그가 남고 `memberLabel`로 읽힌다.
- 뮤테이션이 실패하면 로그도 남지 않는다(같은 트랜잭션).

**횟수**

- 취소된 경기가 내전 횟수에 잡히지 않는다.
- 삭제 확인창 숫자는 취소된 경기의 참가 기록까지 센다.

## 알려진 한계

- 로그가 무한히 쌓인다. 지금 규모에서는 문제가 아니지만, 언젠가 보존 기간이나 페이지네이션이 필요해진다.
- 임포트는 로그에 남지 않는다. 카톡 임포트가 회원을 새로 만들어도 「누가 언제 올렸나」는 기록되지 않는다.
- `MemberChangeLog`는 회원 변경만 담는다. 관리자 계정 추가·삭제는 담지 않는다.
- 취소를 되살릴 수 없으므로, 취소가 실수였다면 경기를 다시 입력해야 한다. 그러면 `createdAt`이 새로 찍혀 순서가 바뀐다.
