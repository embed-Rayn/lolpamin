# 이벤트 게시판 설계

작성일: 2026-09-30

## 목적

운영자가 내전 이벤트 포스터(예: `sample/before.png`, `sample/after.png`)를 올리는 게시판.
일반인은 보기만 한다. 글마다 **추후 공개 사진**을 미리 올려 둘 수 있고, 운영자가 공개 버튼을
누르면 그 사진이 글 맨 위에 나타난다 — "1라운드 경기 후 홈페이지에서 공개!" 같은 깜짝 이벤트용.

## 결정 사항 (브레인스토밍 합의)

| 항목 | 결정 |
|---|---|
| 공개 전 표시 | 완전 숨김. 일반인에게는 추후 공개 사진의 존재조차 보이지 않는다 |
| 본문 형식 | 텍스트 한 칸 + 사진 목록(순서 지정). 리치 에디터 없음 |
| 목록 형태 | 카드 그리드, 썸네일 있음 |
| 추후 공개 사진 | 여러 장 허용. 공개 버튼 하나로 전부 공개, 숨기기로 되돌릴 수 있음 |
| 사진 저장 | Postgres `Bytes` + 서빙 라우트 (`HomeBanner`와 같은 방식) |

## 데이터 모델 (`packages/db/prisma/schema.prisma`)

```prisma
model EventPost {
  id          String       @id @default(cuid())
  title       String
  body        String       @default("")
  // null = 추후 공개 사진이 숨겨진 상태. 공개/숨기기는 글 단위로 한 번에 적용된다.
  revealedAt  DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  createdById String?
  updatedById String?
  images      EventImage[]
}

enum EventImageKind {
  MAIN
  HIDDEN
}

model EventImage {
  id        String         @id @default(cuid())
  postId    String
  post      EventPost      @relation(fields: [postId], references: [id], onDelete: Cascade)
  kind      EventImageKind
  // 같은 글·같은 kind 안에서의 순서. 0부터, 빈 번호가 있어도 정렬만 맞으면 된다.
  position  Int
  bytes     Bytes
  type      String
  createdAt DateTime       @default(now())

  @@index([postId])
}
```

- 사진 행은 고치지 않는다. 교체는 삭제 + 추가이고 새 id가 생기므로 URL이 곧 버전이다.
- 제한: 장당 5MB, `image/png`·`image/jpeg`·`image/webp`·`image/gif`(SVG 불가), 글당 kind별 최대 20장.
- 제목 필수 1~100자(앞뒤 공백 제거 후), 본문 최대 5000자.

## 표시 규칙

**상세 화면 쌓는 순서**
1. 추후 공개 사진(`HIDDEN`, position 순) — `revealedAt`이 있을 때만 일반인에게 보인다. 운영자에게는
   공개 전에도 보이되 "공개 전" 배지를 붙인다.
2. 일반 사진(`MAIN`, position 순)
3. 본문 텍스트 — `whitespace-pre-wrap`, React 이스케이프 그대로. 링크 자동 변환 없음.

**목록**: 작성일 최신순 카드 그리드. 썸네일 우선순위는 공개된 `HIDDEN` 첫 장 → `MAIN` 첫 장 →
기본 아이콘 타일. 운영자에게도 같은 규칙(공개 전 `HIDDEN`은 썸네일로 쓰지 않는다 — 목록은
공개 화면을 미리 보여 주는 곳이다).

## 페이지

사이드바 새 그룹 `이벤트`(`key: "event-board"`, 새 아이콘 `megaphone`, 추첨 다음) 안의 유일한 항목
`공지사항`(`key: "events"`, 아이콘 `file-text`). 화면 제목도 `공지사항`.
모두에게 보인다. `AppShell`의 `activeNav` 유니언에 `"events"` 추가.

| 경로 | 권한 | 모바일 | 내용 |
|---|---|---|---|
| `/events` | 모두 | 지원 | 카드 그리드. 운영자에게 `새 글` 버튼 |
| `/events/[id]` | 모두 | 지원 | 상세. 운영자에게 `공개`/`숨기기`, `수정`, `삭제` |
| `/events/new` | 운영자 | `desktopOnly` | 제목·본문 입력, 저장 후 편집 화면으로 이동 |
| `/events/[id]/edit` | 운영자 | `desktopOnly` | 제목·본문 수정 + 사진 관리 |

- 모든 페이지는 `export const dynamic = "force-dynamic"`.
- 운영자 페이지는 비로그인 시 `/login`으로 리다이렉트(기존 운영 화면과 같은 방식).
- 없는 id는 `notFound()`.

**사진 관리(편집 화면)**: 일반 사진 / 추후 공개 사진 두 구역. 구역마다 `+ 사진 추가`(다중 선택,
파일마다 서버 액션 한 번), 사진마다 `↑` `↓` `삭제`. 폼의 저장과 별개로 즉시 반영
(`BannerSlotGrid`와 같은 방식). 한 번에 한 장이라 20MB 바디 상한과 부딪히지 않는다. 새 글이
"제목·본문 저장 → 편집 화면에서 사진"의 두 단계인 이유는 사진이 붙을 글 id가 먼저 있어야 해서다.

**공개/숨기기**: 상세 화면 버튼, 확인 한 번. 추후 공개 사진이 0장이면 버튼을 그리지 않는다.
마지막 추후 공개 사진을 지우면 `revealedAt`도 비운다 — 같은 글에 다음 깜짝 사진을 올릴 때
공개 상태가 남아 있으면 올리자마자 노출되고, 0장이라 숨기기 버튼도 없다.

**삭제**: 두 단계 확인, 글과 사진 함께 삭제(cascade), 되돌릴 수 없다. 삭제 후 `/events`로 이동.

## 사진 서빙 `/api/events/images/[id]`

- 조회 가능 여부는 `packages/core`의 순수 함수 `canViewEventImage({ kind, revealedAt }, isAdmin)`:
  `kind === "MAIN" || revealedAt !== null || isAdmin`.
- 불가하거나 없는 id면 **404** — 403은 숨긴 사진의 존재를 알려 준다.
- 캐시: `MAIN`은 `public, max-age=31536000, immutable`. `HIDDEN`은 공개 여부와 무관하게
  `private, no-store` — 숨기기로 되돌린 뒤 캐시로 계속 보이거나, 운영자 미리보기가 공유 캐시에
  남는 것을 막는다.
- 모든 응답에 `X-Content-Type-Options: nosniff`.

## 코드 배치

- `packages/core/src/event-post.ts` (+ test) — `canViewEventImage`, `pickEventThumbnailId`(목록 썸네일),
  `formatEventDate`(서울 시각 `YYYY.MM.DD`)
- `apps/dashboard/lib/mutations/event-posts.ts` (+ test) — 모두 `prisma`를 첫 인자로 받는다:
  `createEventPost`, `updateEventPost`, `deleteEventPost`, `addEventImage`, `deleteEventImage`,
  `moveEventImage`(인접 행과 position 교환, 트랜잭션), `setEventPostRevealed`.
  검증 실패는 `EventPostValidationError`(한국어 메시지).
- `apps/dashboard/lib/queries/event-posts.ts` (+ test) — `listEventPosts(prisma)`(썸네일 규칙이 누구에게나 같아 isAdmin 불필요),
  `getEventPost(prisma, id, isAdmin)`, `getEventImageForViewer(prisma, id, isAdmin)`(라우트용). **`bytes`는 select하지 않는다.** 비관리자 쿼리는 공개 전
  `HIDDEN` 행을 아예 제외해 사진 id가 HTML에 실리지 않게 한다.
- `apps/dashboard/app/events/actions.ts` — 서버 액션. 모두 첫 줄 `requireAdmin()`, 끝에서
  `/events`와 해당 글 경로 `revalidatePath`.
- `apps/dashboard/app/events/**/page.tsx`, `app/api/events/images/[id]/route.ts`
- 클라이언트 컴포넌트: `EventImageManager`(편집 화면 사진 구역), `EventRevealButton`,
  `EventDeleteButton`.

## 테스트

- `packages/core`: `canViewEventImage` — 네 조합.
- `lib/mutations/event-posts.test.ts` (실DB, `DATABASE_URL_TEST` 가드 유지):
  생성·수정·삭제와 cascade, 추가 시 position이 끝번호, `↑`/`↓` 교환과 맨 끝에서의 무동작,
  공개/숨기기, 검증 오류(형식·용량·제목 누락/길이·본문 길이·장수 초과).
- `lib/queries/event-posts.test.ts`: 비관리자에게 공개 전 `HIDDEN` 제외, 관리자에게 포함,
  썸네일 우선순위, 최신순 정렬, 없는 id → null.

## 문서

`CLAUDE.md`에 이벤트 게시판 절 추가, Mobile 절의 읽기 화면(`/events`, `/events/[id]`)과
운영 화면(`events/new`, `events/[id]/edit`) 목록 갱신.

## 범위 밖

리치 에디터, 댓글, 좋아요, 예약 공개(시각 지정 자동 공개), 홈 화면 노출, 디스코드 알림.
