# 운영진 회의록 설계

작성일: 2026-10-02

## 목적

운영진이 회의 내용을 사이트 안에 남기는 게시판. 실시간 동시 편집은 하지 않는다 — 운영진이
몇 명이고 보통 한 사람이 받아 적으므로, 덮어쓰기만 막으면 충분하다. 회원 평가·제재 논의가
담길 수 있어 **읽기까지 관리자 전용**이다. 사이트의 "쓰기는 관리자, 읽기는 공개" 규칙의
첫 예외다.

## 결정 사항 (브레인스토밍 합의)

| 항목 | 결정 |
|---|---|
| 방식 | 사이트 안 게시판, 저장 시 `version` 비교로 충돌 거부 (실시간 편집 없음) |
| 권한 | 읽기·쓰기 모두 관리자. 어느 운영진이든 모든 글 수정·삭제 가능 |
| 위치 | 사이드바 「운영 관리」 그룹, 「회원 관리」 바로 아래 「회의록」 |
| 기기 | PC 전용 (`desktopOnly`) |
| 이미지 | 본문 중간에 삽입. 본문에 `![](이미지id)` 줄로 남는다 |
| 서식 | 마크다운 일부를 직접 렌더링: 제목, 목록, 번호 목록, 체크박스, 굵게. HTML은 해석하지 않음 |
| 이미지 저장 | 별도 테이블, Postgres `Bytes`, 한 장씩 즉시 업로드 |
| 회의일 | 작성일과 별개 필드 (기본값 서울 기준 오늘) |

## 데이터 모델 (`packages/db/prisma/schema.prisma`)

```prisma
// 운영진 회의록. 읽기까지 관리자 전용.
// version은 저장 충돌 검사의 기준이다 — 수정 폼이 연 시점의 값을 보내고, 다르면 거부한다.
// updatedAt이 아닌 이유: 밀리초 단위라 같은 밀리초 안의 두 저장을 구별하지 못한다.
model MeetingNote {
  id          String             @id @default(cuid())
  title       String
  // 회의한 날(서울 날짜, UTC 자정으로 저장). 정리해서 나중에 올리는 일이 많아 작성일과 따로 둔다.
  meetingDate DateTime
  body        String             @default("")
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  version     Int                @default(0)
  // Admin.id. FK가 아니다 — 관리자가 삭제돼도 글은 남고 "삭제된 관리자"로 표시한다.
  createdById String?
  updatedById String?
  images      MeetingNoteImage[]

  @@index([meetingDate])
}

// 회의록 본문에 들어간 이미지. noteId가 null이면 아직 저장하지 않은 글에 올린 이미지다 —
// 글 저장 시 본문이 참조하면 붙고, 24시간 넘게 아무 글에도 붙지 않으면 지운다.
model MeetingNoteImage {
  id          String       @id @default(cuid())
  noteId      String?
  note        MeetingNote? @relation(fields: [noteId], references: [id], onDelete: Cascade)
  bytes       Bytes
  type        String
  createdAt   DateTime     @default(now())
  createdById String?

  @@index([noteId])
}
```

## 화면 (`apps/dashboard/app/meeting-notes/`)

모든 페이지: `export const dynamic = "force-dynamic"`, `desktopOnly`, `activeNav="meeting-notes"`,
`getCurrentAdmin()`이 없으면 `redirect(loginPathFor(현재 경로))`.

| 경로 | 내용 |
|---|---|
| `/meeting-notes` | 목록 표: 회의일 · 제목(보기 링크) · 작성자 · 작성일 · 최종 수정(수정자 · 시각). 회의일 내림차순, 같으면 `createdAt` 내림차순. 20개씩 `?page=N`, 범위 밖은 마지막 페이지로 보정. 「새 회의록」 버튼. 글이 없으면 빈 안내 |
| `/meeting-notes/new` | 작성 폼: 제목, 회의일, 본문 편집기. 저장하면 보기 화면으로 이동 |
| `/meeting-notes/[id]` | 보기: 제목, 회의일, 작성/수정 정보, 렌더링된 본문. 「수정」, 「삭제」(2단계 확인 후 목록으로). 없는 id는 `notFound()` |
| `/meeting-notes/[id]/edit` | 수정 폼: 작성과 같은 폼 + 숨은 `version`. 저장하면 보기 화면으로 |
| `/api/meeting-notes/images/[id]` | 이미지 바이트. 관리자 세션이 없거나 행이 없으면 **404** (403은 존재를 알린다). `Cache-Control: private, no-store` |

날짜 표시는 서울 시간. 작성자·수정자 이름은 `Admin.username`, 조회 실패 시 "삭제된 관리자".

### 편집기 (`components/meeting-notes/MeetingNoteEditor.tsx`, 클라이언트)

- 일반 `<textarea>` + 「편집 / 미리보기」 탭. 미리보기는 보기 화면과 같은 렌더러.
- 이미지 넣기 세 경로: 「이미지 추가」 버튼(파일 선택, 여러 장 가능), textarea에 클립보드
  이미지 붙여넣기(Ctrl+V), textarea에 파일 드래그 앤 드롭.
- 이미지마다 server action 한 번으로 업로드 (20mb 본문 한도 회피). 커서 위치에
  `![업로드 중…](pending-<임시키>)` 줄을 끼우고, 성공하면 `![](<id>)`로, 실패하면 그 줄을
  지우고 오류를 보여준다. 업로드가 하나라도 진행 중이면 저장 버튼을 막는다.
- 저장 안 된 변경이 있으면 `beforeunload` 경고.
- 충돌로 거부되면 입력 내용을 그대로 두고 안내를 띄운다:
  「다른 운영진(<이름>)이 <시각>에 먼저 수정했습니다. 내 내용은 화면에 남아 있으니 복사해 두고
  새로 고침한 뒤 다시 반영해 주세요.」

### 본문 렌더러

`packages/core/src/meeting-note-body.ts` (순수 함수):

- `parseMeetingNoteBody(body: string): MeetingNoteBlock[]` — 줄 단위로 블록을 만든다.
  - `# `, `## `, `### ` → 제목(레벨 1–3)
  - `- [ ] ` / `- [x] ` (대소문자 `X` 허용) → 체크박스 항목. 연속 줄은 한 목록
  - `- ` → 글머리 목록 항목. 연속 줄은 한 목록
  - `숫자. ` → 번호 목록 항목. 연속 줄은 한 목록. 적힌 숫자는 무시하고 목록 안 순서대로 1, 2, 3…을 표시한다
  - 줄 전체가 `![...](id)` → 이미지 블록
  - 빈 줄 → 문단 구분
  - 나머지 → 문단. 연속된 일반 줄은 한 문단으로 합치고 줄바꿈 유지
  - 줄 앞 공백(들여쓰기)은 무시한다 — 중첩 목록은 지원하지 않는다
- 줄 안 서식: `**굵게**`만. 짝이 맞지 않는 `**`는 글자 그대로. 결과는
  `{ text: string, bold: boolean }[]` 조각 배열.
- `extractMeetingNoteImageIds(body: string): string[]` — 이미지 블록의 id, 중복 제거, 순서 유지.

`components/meeting-notes/MeetingNoteBody.tsx`가 블록 배열을 React 요소로 그린다. HTML을 해석하는
경로가 없고(`dangerouslySetInnerHTML` 없음) 텍스트는 React가 이스케이프한다. 이미지 블록의 id가
그 글에 붙은 이미지 목록에 없으면 「이미지 없음」 칸을 그린다(미리보기에서는 아직 미첨부
상태인 방금 올린 이미지도 허용한다 — 편집기가 업로드 결과로 받은 id 목록을 함께 넘긴다).
체크박스는 보기 전용 `disabled` 표시다.

## 서버 로직

### Mutations (`apps/dashboard/lib/mutations/meeting-notes.ts`, 첫 인자 `prisma`)

- `MeetingNoteValidationError` — 운영자용 한국어 메시지.
- `MeetingNoteConflictError` — `updatedAt`, `updatedByName`을 담는다.
- 입력 검증: 제목은 앞뒤 공백 제거 후 1–100자, 본문 50,000자 이하, 회의일은 `YYYY-MM-DD`
  형식의 유효한 날짜(UTC 자정으로 저장).
- `createMeetingNote(prisma, input, adminId)` — 트랜잭션: 글 생성 → 본문이 참조하는 이미지 중
  `noteId = null`인 것만 이 글로 붙인다.
- `updateMeetingNote(prisma, id, input, expectedVersion, adminId)` — 트랜잭션:
  `updateMany({ where: { id, version: expectedVersion }, data: { …, version: { increment: 1 } } })` → 0행이면 글이 있는지 확인해
  없으면 `MeetingNoteValidationError("회의록을 찾을 수 없습니다.")`, 있으면
  `MeetingNoteConflictError` → 본문이 참조하는 미첨부 이미지를 붙임 → 이 글의 이미지 중 본문이
  참조하지 않는 것을 삭제.
- `deleteMeetingNote(prisma, id)` — 이미지는 cascade.
- `addMeetingNoteImage(prisma, { bytes, type }, adminId, now)` — 5MB 이하, png/jpeg/webp/gif.
  `noteId = null`로 생성하고 id를 돌려준다. 같은 호출에서 `noteId = null`이고 24시간 넘은
  이미지를 삭제한다.

다른 글에 붙은 이미지 id를 본문에 적어도 붙지 않는다 (`noteId = null`만 대상). 보기 화면에서도
그 글의 이미지가 아니므로 「이미지 없음」으로 나온다.

### Queries (`apps/dashboard/lib/queries/meeting-notes.ts`)

- `listMeetingNotes(prisma, page)` — 본문·이미지는 읽지 않는다. 작성자·수정자 이름을 `Admin`에서
  한 번에 조회해 붙인다. `{ rows, page, pageCount, total }`.
- `getMeetingNote(prisma, id)` — 본문, 회의일, 작성/수정 정보, 붙은 이미지 id 목록. 없으면 `null`.
- `getMeetingNoteImage(prisma, id)` — 바이트와 타입.

### Server actions (`apps/dashboard/app/meeting-notes/actions.ts`)

모두 `requireAdmin()` 먼저. `MeetingNoteValidationError`·`MeetingNoteConflictError`의 메시지만
그대로 내보내고 나머지 오류는 한국어 기본 문구로 바꾼다 (`/events` 액션과 같은 모양). 생성·수정·
삭제 후 `/meeting-notes` 관련 경로를 `revalidatePath`. 생성은 `redirect` 대신 id를 돌려준다
(`createEventPostAction`과 같은 이유).

### 메뉴 (`components/AppShell.tsx`)

`ops` 그룹의 `member-admin` 바로 다음에
`{ key: "meeting-notes", href: "/meeting-notes", label: "회의록", icon: "file-text" }`.
`ops` 그룹은 이미 관리자에게만 보인다. `AppShell`의 desktop-only 화면 목록 주석도 갱신.

## 테스트

- `packages/core/src/meeting-note-body.test.ts` — 블록 종류별 파싱, 연속 줄 묶기, 빈 줄 구분,
  체크박스와 글머리 목록 구분, 번호 목록, 이미지 줄(줄 중간의 `![]()`는 문단 텍스트),
  `**` 짝 맞음/안 맞음, 이미지 id 추출(중복 제거).
- `apps/dashboard/lib/mutations/meeting-notes.test.ts` (DB, `DATABASE_URL_TEST` 가드 +
  `resetDatabase`) — 생성 시 미첨부 이미지 붙임, 다른 글 이미지는 안 붙음, 수정 충돌 거부,
  없는 글 수정, 참조 빠진 이미지 삭제, 24시간 지난 미첨부 이미지 정리(최근 것은 유지),
  검증 오류(빈 제목, 긴 본문, 잘못된 날짜, 큰 이미지, 잘못된 타입), 삭제 시 이미지 cascade.
- `apps/dashboard/lib/queries/meeting-notes.test.ts` — 정렬, 페이지 보정, 삭제된 관리자 이름.
- `resetDatabase()`가 새 테이블도 비우는지 확인하고, 아니면 추가한다.

## 문서

CLAUDE.md에 회의록 단락 추가: 읽기 공개 규칙의 첫 예외라는 점, 이미지 404 규칙, `version`
충돌 규칙, 미첨부 이미지 수명. Mobile 단락의 운영 화면 목록에 회의록 화면 셋을 더한다.

## 범위 밖

실시간 편집·편집 중 표시, 댓글, 검색, 수정 이력, 보기 화면에서 체크박스 토글, 중첩 목록,
링크·표·인용, 모바일 화면.
