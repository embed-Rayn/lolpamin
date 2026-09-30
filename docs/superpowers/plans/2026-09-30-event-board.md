# Event Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추첨 그룹 아래에 이벤트 게시판(`/events`)을 만든다 — 운영자는 글·사진 CRUD, 일반인은 보기만, 글마다 버튼으로 공개하는 "추후 공개" 사진.

**Architecture:** `EventPost`/`EventImage` 두 테이블, 사진은 `HomeBanner`처럼 Postgres `Bytes`에 두고 `/api/events/images/[id]`로 내준다. 누가 어떤 사진을 볼 수 있는지·썸네일·날짜 표기는 `packages/core`의 순수 함수, DB 접근은 `lib/{mutations,queries}/event-posts.ts`, 쓰기는 `app/events/actions.ts` 서버 액션(전부 `requireAdmin()`).

**Tech Stack:** Next.js 14 App Router, Prisma 5 + Postgres 16, vitest, Tailwind (semantic colour tokens).

**Spec:** `docs/superpowers/specs/2026-09-30-event-board-design.md`

## Global Constraints

- UI copy is Korean; code, identifiers, comments, commit messages are English.
- Colours in components are never hex — use the semantic Tailwind roles (`bg-surface`, `text-fg`, `text-faint`, `border-ink/[.06]`, `bg-accent`, `text-danger-soft`…). `text-white` only on a solid `bg-accent` button.
- Every page reading the DB (and every page rendering `AppShell`) declares `export const dynamic = "force-dynamic"`.
- DB-touching functions live in `apps/dashboard/lib/{queries,mutations}/` and take `prisma` as their first argument. Multi-row writes go inside `prisma.$transaction`.
- Every DB test file starts with the `DATABASE_URL_TEST` guard and calls `resetDatabase()` in `beforeEach`.
- Image limits: 5MB each (`5 * 1024 * 1024`), types `image/png`, `image/jpeg`, `image/webp`, `image/gif` only (no SVG), at most 20 images per post per kind.
- Title required, 1–100 chars after trim; body at most 5000 chars.
- `bytes` is never selected by list/detail queries.
- An unrevealed `HIDDEN` image is served to admins only; everyone else gets **404**. `HIDDEN` responses are always `Cache-Control: private, no-store`; `MAIN` is `public, max-age=31536000, immutable`; every image response carries `X-Content-Type-Options: nosniff`.
- `/events`, `/events/[id]` work down to 375px; `/events/new`, `/events/[id]/edit` pass `desktopOnly` and redirect signed-out visitors to `/login`.
- `packages/core` must not import from `@lolpamin/db` for this feature (its one db import stays the tier type) — use a string-literal union.

## Review Focus

- A signed-out visitor requesting an unrevealed `HIDDEN` image by its URL → 404, and after 숨기기 the same URL → 404 again. Pinned in Task 3 (`getEventImageForViewer`).
- A title of only spaces → "제목을 입력해 주세요." rather than an empty-titled post. Pinned in Task 2.
- `↑` on the first image / `↓` on the last → nothing moves, no error. Pinned in Task 2.
- Uploading to a post that was deleted in another tab → Korean "글을 찾을 수 없습니다." rather than a Postgres FK error. Pinned in Task 2.
- All `HIDDEN` images deleted after reveal → list thumbnail falls back to the first `MAIN`. Pinned in Task 3.

---

### Task 1: Core — image visibility, thumbnail choice, date label

**Files:**
- Create: `packages/core/src/event-post.ts`
- Create: `packages/core/src/event-post.test.ts`
- Modify: `packages/core/src/index.ts` (append export)

**Interfaces:**
- Produces:
  - `type EventImageKindName = "MAIN" | "HIDDEN"`
  - `canViewEventImage(image: { kind: EventImageKindName; revealedAt: Date | null }, isAdmin: boolean): boolean`
  - `pickEventThumbnailId(images: { id: string; kind: EventImageKindName; position: number }[], revealed: boolean): string | null`
  - `formatEventDate(date: Date): string` — `"2026.09.30"` in Asia/Seoul

- [ ] **Step 1: Write the failing test**

`packages/core/src/event-post.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canViewEventImage, formatEventDate, pickEventThumbnailId } from "./event-post";

describe("canViewEventImage", () => {
  const revealedAt = new Date("2026-09-30T12:00:00Z");

  it("shows a main image to everyone", () => {
    expect(canViewEventImage({ kind: "MAIN", revealedAt: null }, false)).toBe(true);
  });

  it("hides an unrevealed hidden image from a visitor", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: null }, false)).toBe(false);
  });

  it("shows an unrevealed hidden image to an admin", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: null }, true)).toBe(true);
  });

  it("shows a revealed hidden image to everyone", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt }, false)).toBe(true);
  });
});

describe("pickEventThumbnailId", () => {
  const images = [
    { id: "m1", kind: "MAIN" as const, position: 1 },
    { id: "m0", kind: "MAIN" as const, position: 0 },
    { id: "h1", kind: "HIDDEN" as const, position: 1 },
    { id: "h0", kind: "HIDDEN" as const, position: 0 },
  ];

  it("prefers the first hidden image once revealed", () => {
    expect(pickEventThumbnailId(images, true)).toBe("h0");
  });

  it("uses the first main image while unrevealed", () => {
    expect(pickEventThumbnailId(images, false)).toBe("m0");
  });

  it("falls back to main when revealed but no hidden image is left", () => {
    expect(pickEventThumbnailId(images.filter((i) => i.kind === "MAIN"), true)).toBe("m0");
  });

  it("returns null with no usable image", () => {
    expect(pickEventThumbnailId([], true)).toBeNull();
    expect(pickEventThumbnailId([{ id: "h0", kind: "HIDDEN", position: 0 }], false)).toBeNull();
  });
});

describe("formatEventDate", () => {
  it("formats in Korean time, not UTC", () => {
    // 2026-09-30 16:00 UTC is already 10-01 in Seoul.
    expect(formatEventDate(new Date("2026-09-30T16:00:00Z"))).toBe("2026.10.01");
    expect(formatEventDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026.01.05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `packages/core`): `npx vitest run src/event-post.test.ts`
Expected: FAIL — cannot resolve `./event-post`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/event-post.ts`:

```ts
// Mirrors the Prisma enum EventImageKind as a string union so core stays free of
// another @lolpamin/db dependency; the Prisma values are assignable to it.
export type EventImageKindName = "MAIN" | "HIDDEN";

// A HIDDEN image stays invisible (not even a placeholder) until the post is revealed.
// Admins always see it so they can check it before pressing 공개.
export function canViewEventImage(
  image: { kind: EventImageKindName; revealedAt: Date | null },
  isAdmin: boolean,
): boolean {
  return image.kind === "MAIN" || image.revealedAt !== null || isAdmin;
}

// The list shows what a visitor would see, admins included: a revealed hidden image
// leads (it goes to the top of the post), otherwise the first main image.
export function pickEventThumbnailId(
  images: { id: string; kind: EventImageKindName; position: number }[],
  revealed: boolean,
): string | null {
  const first = (kind: EventImageKindName) =>
    images.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position)[0];
  if (revealed) {
    const hidden = first("HIDDEN");
    if (hidden) return hidden.id;
  }
  return first("MAIN")?.id ?? null;
}

const EVENT_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The server runs in UTC; the group lives in Seoul.
export function formatEventDate(date: Date): string {
  return EVENT_DATE_PARTS.format(date).replace(/-/g, ".");
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./event-post";
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `packages/core`): `npx vitest run src/event-post.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/event-post.ts packages/core/src/event-post.test.ts packages/core/src/index.ts
git commit -m "feat(core): event image visibility, thumbnail pick, date label"
```

---

### Task 2: Schema + mutations

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append models)
- Create: `packages/db/prisma/migrations/<timestamp>_event_board/migration.sql` (generated)
- Modify: `packages/db/src/test-utils.ts` (reset the two tables)
- Create: `apps/dashboard/lib/mutations/event-posts.ts`
- Create: `apps/dashboard/lib/mutations/event-posts.test.ts`

**Interfaces:**
- Produces (all in `@/lib/mutations/event-posts`):
  - `EVENT_TITLE_MAX = 100`, `EVENT_BODY_MAX = 5000`, `EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024`, `EVENT_IMAGES_PER_KIND = 20`, `ALLOWED_EVENT_IMAGE_TYPES: string[]`
  - `class EventPostValidationError extends Error`
  - `interface EventPostInput { title: string; body: string }`
  - `interface EventImageUpload { bytes: Buffer; type: string }`
  - `createEventPost(prisma, input: EventPostInput, adminId: string | null): Promise<{ id: string }>`
  - `updateEventPost(prisma, id: string, input: EventPostInput, adminId: string | null): Promise<void>`
  - `deleteEventPost(prisma, id: string): Promise<void>`
  - `setEventPostRevealed(prisma, id: string, revealed: boolean, adminId: string | null): Promise<void>`
  - `addEventImage(prisma, postId: string, kind: EventImageKind, upload: EventImageUpload): Promise<{ id: string }>`
  - `deleteEventImage(prisma, imageId: string): Promise<string | null>` — returns the post id, null if already gone
  - `moveEventImage(prisma, imageId: string, direction: "up" | "down"): Promise<string | null>` — returns the post id
  - Prisma: `EventPost`, `EventImage`, enum `EventImageKind { MAIN HIDDEN }`

- [ ] **Step 1: Add the schema**

Append to `packages/db/prisma/schema.prisma`:

```prisma
// 이벤트 게시판 글. revealedAt이 null이면 추후 공개(HIDDEN) 사진은 관리자에게만 보인다.
// 공개/숨기기는 글 단위로 한 번에 적용된다.
model EventPost {
  id          String       @id @default(cuid())
  title       String
  body        String       @default("")
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

// 이벤트 글의 사진. 행은 고치지 않는다 — 교체는 삭제 + 추가라 id(= URL)가 곧 버전이다.
// position은 같은 글·같은 kind 안의 순서이며 빈 번호가 있어도 된다.
model EventImage {
  id        String         @id @default(cuid())
  postId    String
  post      EventPost      @relation(fields: [postId], references: [id], onDelete: Cascade)
  kind      EventImageKind
  position  Int
  bytes     Bytes
  type      String
  createdAt DateTime       @default(now())

  @@index([postId])
}
```

- [ ] **Step 2: Migrate dev and test DBs, regenerate the client**

Postgres must be up (`docker compose up -d` from PowerShell). Then (Git Bash, repo root):

```bash
npm run migrate --workspace=@lolpamin/db -- --name event_board
cd packages/db && DATABASE_URL="$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d= -f2- | tr -d '"\r')" npx prisma migrate deploy; cd ../..
npm run generate --workspace=@lolpamin/db
```

Expected: a new `packages/db/prisma/migrations/*_event_board/migration.sql` creating `EventPost`, `EventImage`, the `EventImageKind` enum, the FK with `ON DELETE CASCADE`; `migrate deploy` reports it applied to the test DB.

- [ ] **Step 3: Reset the new tables in tests**

In `packages/db/src/test-utils.ts`, add after `await client.homeBanner.deleteMany();`:

```ts
  await client.eventImage.deleteMany();
  await client.eventPost.deleteMany();
```

- [ ] **Step 4: Write the failing tests**

`apps/dashboard/lib/mutations/event-posts.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  addEventImage,
  createEventPost,
  deleteEventImage,
  deleteEventPost,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGES_PER_KIND,
  EventPostValidationError,
  moveEventImage,
  setEventPostRevealed,
  updateEventPost,
} from "./event-posts";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

async function positions(postId: string, kind: "MAIN" | "HIDDEN") {
  const rows = await prisma.eventImage.findMany({
    where: { postId, kind },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

describe("createEventPost / updateEventPost", () => {
  it("trims and stores title and body", async () => {
    const { id } = await createEventPost(prisma, { title: "  9월 이벤트 ", body: " 본문\n둘째 줄 " }, null);
    const row = await prisma.eventPost.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe("9월 이벤트");
    expect(row.body).toBe("본문\n둘째 줄");
    expect(row.revealedAt).toBeNull();

    await updateEventPost(prisma, id, { title: "10월 이벤트", body: "" }, null);
    const updated = await prisma.eventPost.findUniqueOrThrow({ where: { id } });
    expect(updated.title).toBe("10월 이벤트");
    expect(updated.body).toBe("");
  });

  it("rejects a blank title, a too-long title and a too-long body", async () => {
    await expect(createEventPost(prisma, { title: "   ", body: "" }, null)).rejects.toThrow("제목을 입력해 주세요.");
    await expect(createEventPost(prisma, { title: "가".repeat(101), body: "" }, null)).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(createEventPost(prisma, { title: "제목", body: "가".repeat(5001) }, null)).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(createEventPost(prisma, { title: "가".repeat(100), body: "가".repeat(5000) }, null)).resolves.toBeDefined();
  });

  it("refuses to update a missing post", async () => {
    await expect(updateEventPost(prisma, "missing", { title: "제목", body: "" }, null)).rejects.toThrow(
      "글을 찾을 수 없습니다.",
    );
  });
});

describe("deleteEventPost", () => {
  it("removes the post with its images and is a no-op when already gone", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    await addEventImage(prisma, id, "MAIN", png);
    await addEventImage(prisma, id, "HIDDEN", png);

    await deleteEventPost(prisma, id);
    await deleteEventPost(prisma, id);

    expect(await prisma.eventPost.count()).toBe(0);
    expect(await prisma.eventImage.count()).toBe(0);
  });
});

describe("setEventPostRevealed", () => {
  it("reveals and hides again", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);

    await setEventPostRevealed(prisma, id, true, null);
    expect((await prisma.eventPost.findUniqueOrThrow({ where: { id } })).revealedAt).toBeInstanceOf(Date);

    await setEventPostRevealed(prisma, id, false, null);
    expect((await prisma.eventPost.findUniqueOrThrow({ where: { id } })).revealedAt).toBeNull();
  });

  it("refuses a missing post", async () => {
    await expect(setEventPostRevealed(prisma, "missing", true, null)).rejects.toThrow("글을 찾을 수 없습니다.");
  });
});

describe("addEventImage", () => {
  it("appends at the end of its own kind", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    const h = await addEventImage(prisma, id, "HIDDEN", png);

    expect(await positions(id, "MAIN")).toEqual([a.id, b.id]);
    expect(await positions(id, "HIDDEN")).toEqual([h.id]);
  });

  it("keeps appending after a deletion left a gap", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    await deleteEventImage(prisma, a.id);
    const c = await addEventImage(prisma, id, "MAIN", png);

    expect(await positions(id, "MAIN")).toEqual([b.id, c.id]);
  });

  it("rejects a disallowed type, an oversized file and an unknown kind", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    await expect(addEventImage(prisma, id, "MAIN", { bytes: png.bytes, type: "image/svg+xml" })).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(
      addEventImage(prisma, id, "MAIN", { bytes: Buffer.alloc(EVENT_IMAGE_MAX_BYTES + 1), type: "image/png" }),
    ).rejects.toThrow(EventPostValidationError);
    // @ts-expect-error — the server action receives this from the browser unchecked
    await expect(addEventImage(prisma, id, "BANNER", png)).rejects.toThrow(EventPostValidationError);
  });

  it("caps each kind at the limit", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    for (let i = 0; i < EVENT_IMAGES_PER_KIND; i++) await addEventImage(prisma, id, "MAIN", png);

    await expect(addEventImage(prisma, id, "MAIN", png)).rejects.toThrow(EventPostValidationError);
    await expect(addEventImage(prisma, id, "HIDDEN", png)).resolves.toBeDefined();
  });

  it("gives a Korean error for a post deleted meanwhile", async () => {
    await expect(addEventImage(prisma, "missing", "MAIN", png)).rejects.toThrow("글을 찾을 수 없습니다.");
  });
});

describe("deleteEventImage", () => {
  it("returns the post id, then null once gone", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);

    expect(await deleteEventImage(prisma, a.id)).toBe(id);
    expect(await deleteEventImage(prisma, a.id)).toBeNull();
  });
});

describe("moveEventImage", () => {
  it("swaps with the neighbour of the same kind only", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const h = await addEventImage(prisma, id, "HIDDEN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    const c = await addEventImage(prisma, id, "MAIN", png);

    expect(await moveEventImage(prisma, c.id, "up")).toBe(id);
    expect(await positions(id, "MAIN")).toEqual([a.id, c.id, b.id]);

    await moveEventImage(prisma, a.id, "down");
    expect(await positions(id, "MAIN")).toEqual([c.id, a.id, b.id]);
    expect(await positions(id, "HIDDEN")).toEqual([h.id]);
  });

  it("does nothing at either end", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);

    await moveEventImage(prisma, a.id, "up");
    await moveEventImage(prisma, b.id, "down");
    expect(await positions(id, "MAIN")).toEqual([a.id, b.id]);
  });

  it("returns null for a missing image and rejects an unknown direction", async () => {
    expect(await moveEventImage(prisma, "missing", "up")).toBeNull();
    // @ts-expect-error — the server action receives this from the browser unchecked
    await expect(moveEventImage(prisma, "missing", "left")).rejects.toThrow(EventPostValidationError);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/event-posts.test.ts`
Expected: FAIL — cannot resolve `./event-posts`.

- [ ] **Step 6: Write the implementation**

`apps/dashboard/lib/mutations/event-posts.ts`:

```ts
import type { EventImageKind, PrismaClient } from "@lolpamin/db";

export const EVENT_TITLE_MAX = 100;
export const EVENT_BODY_MAX = 5000;
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_IMAGES_PER_KIND = 20;
export const ALLOWED_EVENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const EVENT_IMAGE_KINDS: EventImageKind[] = ["MAIN", "HIDDEN"];

export class EventPostValidationError extends Error {}

export interface EventPostInput {
  title: string;
  body: string;
}

export interface EventImageUpload {
  bytes: Buffer;
  type: string;
}

const POST_NOT_FOUND = "글을 찾을 수 없습니다.";

function cleanInput(input: EventPostInput): EventPostInput {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new EventPostValidationError("제목을 입력해 주세요.");
  if (title.length > EVENT_TITLE_MAX) {
    throw new EventPostValidationError(`제목은 ${EVENT_TITLE_MAX}자를 넘을 수 없습니다.`);
  }
  if (body.length > EVENT_BODY_MAX) {
    throw new EventPostValidationError(`본문은 ${EVENT_BODY_MAX}자를 넘을 수 없습니다.`);
  }
  return { title, body };
}

export async function createEventPost(
  prisma: PrismaClient,
  input: EventPostInput,
  adminId: string | null,
): Promise<{ id: string }> {
  const data = cleanInput(input);
  return prisma.eventPost.create({
    data: { ...data, createdById: adminId, updatedById: adminId },
    select: { id: true },
  });
}

export async function updateEventPost(
  prisma: PrismaClient,
  id: string,
  input: EventPostInput,
  adminId: string | null,
): Promise<void> {
  const data = cleanInput(input);
  const { count } = await prisma.eventPost.updateMany({ where: { id }, data: { ...data, updatedById: adminId } });
  if (count === 0) throw new EventPostValidationError(POST_NOT_FOUND);
}

// Images go with it (onDelete: Cascade). Deleting twice is harmless.
export async function deleteEventPost(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.eventPost.deleteMany({ where: { id } });
}

export async function setEventPostRevealed(
  prisma: PrismaClient,
  id: string,
  revealed: boolean,
  adminId: string | null,
): Promise<void> {
  const { count } = await prisma.eventPost.updateMany({
    where: { id },
    data: { revealedAt: revealed ? new Date() : null, updatedById: adminId },
  });
  if (count === 0) throw new EventPostValidationError(POST_NOT_FOUND);
}

export async function addEventImage(
  prisma: PrismaClient,
  postId: string,
  kind: EventImageKind,
  upload: EventImageUpload,
): Promise<{ id: string }> {
  // kind arrives from the browser; the type alone does not stop "BANNER".
  if (!EVENT_IMAGE_KINDS.includes(kind)) throw new EventPostValidationError("잘못된 사진 구역입니다.");
  if (!ALLOWED_EVENT_IMAGE_TYPES.includes(upload.type)) {
    throw new EventPostValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > EVENT_IMAGE_MAX_BYTES) {
    throw new EventPostValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }

  return prisma.$transaction(async (tx) => {
    // Checked here rather than left to the FK so a post deleted in another tab
    // gives a readable message instead of a Postgres error.
    const post = await tx.eventPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new EventPostValidationError(POST_NOT_FOUND);

    const current = await tx.eventImage.aggregate({
      where: { postId, kind },
      _count: { _all: true },
      _max: { position: true },
    });
    if (current._count._all >= EVENT_IMAGES_PER_KIND) {
      throw new EventPostValidationError(`사진은 구역마다 ${EVENT_IMAGES_PER_KIND}장까지 올릴 수 있습니다.`);
    }

    return tx.eventImage.create({
      data: { postId, kind, position: (current._max.position ?? -1) + 1, bytes: upload.bytes, type: upload.type },
      select: { id: true },
    });
  });
}

// Returns the owning post id so the caller can revalidate its page; null if already gone.
export async function deleteEventImage(prisma: PrismaClient, imageId: string): Promise<string | null> {
  const image = await prisma.eventImage.findUnique({ where: { id: imageId }, select: { postId: true } });
  if (!image) return null;
  await prisma.eventImage.deleteMany({ where: { id: imageId } });
  return image.postId;
}

// Swaps positions with the nearest image of the same post and kind; at either end
// there is no neighbour and nothing changes.
export async function moveEventImage(
  prisma: PrismaClient,
  imageId: string,
  direction: "up" | "down",
): Promise<string | null> {
  if (direction !== "up" && direction !== "down") throw new EventPostValidationError("잘못된 이동 방향입니다.");

  return prisma.$transaction(async (tx) => {
    const image = await tx.eventImage.findUnique({
      where: { id: imageId },
      select: { id: true, postId: true, kind: true, position: true },
    });
    if (!image) return null;

    const neighbour = await tx.eventImage.findFirst({
      where: {
        postId: image.postId,
        kind: image.kind,
        position: direction === "up" ? { lt: image.position } : { gt: image.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (neighbour) {
      await tx.eventImage.update({ where: { id: image.id }, data: { position: neighbour.position } });
      await tx.eventImage.update({ where: { id: neighbour.id }, data: { position: image.position } });
    }
    return image.postId;
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/event-posts.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts apps/dashboard/lib/mutations/event-posts.ts apps/dashboard/lib/mutations/event-posts.test.ts
git commit -m "feat(events): EventPost/EventImage schema and mutations"
```

---

### Task 3: Queries

**Files:**
- Create: `apps/dashboard/lib/queries/event-posts.ts`
- Create: `apps/dashboard/lib/queries/event-posts.test.ts`

**Interfaces:**
- Consumes: `canViewEventImage`, `pickEventThumbnailId` (Task 1); `createEventPost`, `addEventImage`, `setEventPostRevealed`, `deleteEventImage` (Task 2, tests only).
- Produces (all in `@/lib/queries/event-posts`):
  - `eventImageSrc(id: string): string` → `"/api/events/images/<id>"`
  - `interface EventPostCard { id: string; title: string; createdAt: Date; thumbnailSrc: string | null }`
  - `interface EventImageRef { id: string; src: string }`
  - `interface EventPostDetail { id: string; title: string; body: string; createdAt: Date; revealed: boolean; hiddenImages: EventImageRef[]; mainImages: EventImageRef[] }`
  - `listEventPosts(prisma): Promise<EventPostCard[]>` — newest first
  - `getEventPost(prisma, id: string, isAdmin: boolean): Promise<EventPostDetail | null>`
  - `getEventImageForViewer(prisma, id: string, isAdmin: boolean): Promise<{ bytes: Buffer; type: string; kind: EventImageKind } | null>`

- [ ] **Step 1: Write the failing tests**

`apps/dashboard/lib/queries/event-posts.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { addEventImage, createEventPost, deleteEventImage, setEventPostRevealed } from "../mutations/event-posts";
import { eventImageSrc, getEventImageForViewer, getEventPost, listEventPosts } from "./event-posts";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

async function postWithImages() {
  const { id } = await createEventPost(prisma, { title: "9월 이벤트", body: "본문" }, null);
  const main = await addEventImage(prisma, id, "MAIN", png);
  const hidden = await addEventImage(prisma, id, "HIDDEN", png);
  return { id, main: main.id, hidden: hidden.id };
}

describe("getEventPost", () => {
  it("leaves unrevealed hidden images out for a visitor", async () => {
    const { id, main } = await postWithImages();
    const post = await getEventPost(prisma, id, false);

    expect(post?.revealed).toBe(false);
    expect(post?.hiddenImages).toEqual([]);
    expect(post?.mainImages).toEqual([{ id: main, src: eventImageSrc(main) }]);
  });

  it("includes unrevealed hidden images for an admin", async () => {
    const { id, hidden } = await postWithImages();
    const post = await getEventPost(prisma, id, true);
    expect(post?.hiddenImages.map((i) => i.id)).toEqual([hidden]);
  });

  it("includes hidden images for everyone once revealed", async () => {
    const { id, hidden } = await postWithImages();
    await setEventPostRevealed(prisma, id, true, null);
    const post = await getEventPost(prisma, id, false);
    expect(post?.revealed).toBe(true);
    expect(post?.hiddenImages.map((i) => i.id)).toEqual([hidden]);
  });

  it("returns null for a missing id", async () => {
    expect(await getEventPost(prisma, "missing", true)).toBeNull();
  });
});

describe("listEventPosts", () => {
  it("lists newest first with the visitor-view thumbnail", async () => {
    const first = await postWithImages();
    await new Promise((r) => setTimeout(r, 5));
    const second = await createEventPost(prisma, { title: "사진 없음", body: "" }, null);

    let list = await listEventPosts(prisma);
    expect(list.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(list[0].thumbnailSrc).toBeNull();
    expect(list[1].thumbnailSrc).toBe(eventImageSrc(first.main));

    await setEventPostRevealed(prisma, first.id, true, null);
    list = await listEventPosts(prisma);
    expect(list[1].thumbnailSrc).toBe(eventImageSrc(first.hidden));
  });

  it("falls back to the main image when every hidden image is deleted after reveal", async () => {
    const post = await postWithImages();
    await setEventPostRevealed(prisma, post.id, true, null);
    await deleteEventImage(prisma, post.hidden);

    const [card] = await listEventPosts(prisma);
    expect(card.thumbnailSrc).toBe(eventImageSrc(post.main));
  });
});

describe("getEventImageForViewer", () => {
  it("serves a main image to anyone", async () => {
    const { main } = await postWithImages();
    const image = await getEventImageForViewer(prisma, main, false);
    expect(image?.type).toBe("image/png");
    expect(image?.kind).toBe("MAIN");
    expect(Buffer.from(image!.bytes).equals(png.bytes)).toBe(true);
  });

  it("refuses an unrevealed hidden image to a visitor, before reveal and after hiding again", async () => {
    const { id, hidden } = await postWithImages();
    expect(await getEventImageForViewer(prisma, hidden, false)).toBeNull();
    expect(await getEventImageForViewer(prisma, hidden, true)).not.toBeNull();

    await setEventPostRevealed(prisma, id, true, null);
    expect(await getEventImageForViewer(prisma, hidden, false)).not.toBeNull();

    await setEventPostRevealed(prisma, id, false, null);
    expect(await getEventImageForViewer(prisma, hidden, false)).toBeNull();
  });

  it("returns null for a missing id", async () => {
    expect(await getEventImageForViewer(prisma, "missing", true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/event-posts.test.ts`
Expected: FAIL — cannot resolve `./event-posts`.

- [ ] **Step 3: Write the implementation**

`apps/dashboard/lib/queries/event-posts.ts`:

```ts
import { canViewEventImage, pickEventThumbnailId } from "@lolpamin/core";
import type { EventImageKind, PrismaClient } from "@lolpamin/db";

export function eventImageSrc(id: string): string {
  return `/api/events/images/${id}`;
}

export interface EventPostCard {
  id: string;
  title: string;
  createdAt: Date;
  thumbnailSrc: string | null;
}

export interface EventImageRef {
  id: string;
  src: string;
}

export interface EventPostDetail {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  revealed: boolean;
  hiddenImages: EventImageRef[];
  mainImages: EventImageRef[];
}

// Never `bytes` — a list of posters would drag every image through the query.
const IMAGE_REFS = {
  select: { id: true, kind: true, position: true },
  orderBy: { position: "asc" as const },
};

export async function listEventPosts(prisma: PrismaClient): Promise<EventPostCard[]> {
  const posts = await prisma.eventPost.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, createdAt: true, revealedAt: true, images: IMAGE_REFS },
  });
  return posts.map((post) => {
    const thumbnailId = pickEventThumbnailId(post.images, post.revealedAt !== null);
    return {
      id: post.id,
      title: post.title,
      createdAt: post.createdAt,
      thumbnailSrc: thumbnailId ? eventImageSrc(thumbnailId) : null,
    };
  });
}

// For a visitor an unrevealed hidden image is dropped here, so its id never reaches the HTML.
export async function getEventPost(
  prisma: PrismaClient,
  id: string,
  isAdmin: boolean,
): Promise<EventPostDetail | null> {
  const post = await prisma.eventPost.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, createdAt: true, revealedAt: true, images: IMAGE_REFS },
  });
  if (!post) return null;

  const visible = post.images.filter((image) =>
    canViewEventImage({ kind: image.kind, revealedAt: post.revealedAt }, isAdmin),
  );
  const refs = (kind: EventImageKind) =>
    visible.filter((image) => image.kind === kind).map((image) => ({ id: image.id, src: eventImageSrc(image.id) }));

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    revealed: post.revealedAt !== null,
    hiddenImages: refs("HIDDEN"),
    mainImages: refs("MAIN"),
  };
}

// null covers both "no such image" and "not yours to see" — the route answers 404
// either way so a visitor cannot learn that a hidden image exists.
export async function getEventImageForViewer(
  prisma: PrismaClient,
  id: string,
  isAdmin: boolean,
): Promise<{ bytes: Buffer; type: string; kind: EventImageKind } | null> {
  const image = await prisma.eventImage.findUnique({
    where: { id },
    select: { bytes: true, type: true, kind: true, post: { select: { revealedAt: true } } },
  });
  if (!image || !canViewEventImage({ kind: image.kind, revealedAt: image.post.revealedAt }, isAdmin)) return null;
  return { bytes: image.bytes, type: image.type, kind: image.kind };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/queries/event-posts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/event-posts.ts apps/dashboard/lib/queries/event-posts.test.ts
git commit -m "feat(events): list, detail and per-viewer image queries"
```

---

### Task 4: Image route, nav entry, public list and detail pages

**Files:**
- Create: `apps/dashboard/app/api/events/images/[id]/route.ts`
- Modify: `apps/dashboard/components/nav-icons.tsx` (add `megaphone`)
- Modify: `apps/dashboard/components/AppShell.tsx` (`activeNav` union + 추첨 group item + desktopOnly notice copy unchanged)
- Create: `apps/dashboard/app/events/page.tsx`
- Create: `apps/dashboard/app/events/[id]/page.tsx`

**Interfaces:**
- Consumes: `getEventImageForViewer`, `listEventPosts`, `getEventPost` (Task 3); `formatEventDate` (Task 1); `getCurrentAdmin` (`@/lib/auth/current-admin`).
- Produces: `AppShellProps["activeNav"]` accepts `"events"`; `NavIconName` includes `"megaphone"`; the detail page renders a slot `{isAdmin && <EventAdminBar … />}` that Task 5 fills — in this task, render nothing there yet (the component does not exist until Task 5).

No automated test: the route's decision is `getEventImageForViewer` (tested in Task 3) and the pages are rendering only. Verify by hand in Step 6.

- [ ] **Step 1: Image route**

`apps/dashboard/app/api/events/images/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventImageForViewer } from "@/lib/queries/event-posts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  const image = await getEventImageForViewer(prisma, params.id, admin !== null);
  // 404 rather than 403: a 403 would tell a visitor that a hidden image exists.
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

  // A main image row never changes (replacing = new id), so its URL can be cached forever.
  // A hidden one can be hidden again after reveal, and an admin's preview must not land
  // in a shared cache, so it is never cached.
  const cacheControl = image.kind === "MAIN" ? "public, max-age=31536000, immutable" : "private, no-store";
  // Buffer is a valid BodyInit at runtime; only this lib config's DOM types disagree.
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.type, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
  });
}
```

- [ ] **Step 2: Megaphone icon**

In `apps/dashboard/components/nav-icons.tsx`, add `| "megaphone"` to the `NavIconName` union (after `| "home"`), and add to `PATHS` after the `home` entry:

```ts
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
```

- [ ] **Step 3: Nav entry**

In `apps/dashboard/components/AppShell.tsx`:

1. Add `| "events"` to the `activeNav` union after `| "draw-plinko"`.
2. In the `draw` group's `items`, after the `draw-plinko` item, add:

```ts
        { key: "events", href: "/events", label: "이벤트", icon: "megaphone" },
```

- [ ] **Step 4: List page**

`apps/dashboard/app/events/page.tsx`:

```tsx
import Link from "next/link";
import { formatEventDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { NavIcon } from "@/components/nav-icons";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { listEventPosts } from "@/lib/queries/event-posts";

// AppShell과 글 목록 모두 살아 있는 DB 행을 읽는다.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [posts, currentAdmin] = await Promise.all([listEventPosts(prisma), getCurrentAdmin()]);

  return (
    <AppShell activeNav="events" pageTitle="이벤트" pageDesc="내전 이벤트 소식">
      <div className="flex flex-col gap-4 px-4 pb-10 pt-5 md:px-7 md:pt-6">
        {currentAdmin && (
          <div className="flex justify-end">
            <Link
              href="/events/new"
              className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
            >
              새 글
            </Link>
          </div>
        )}
        {posts.length === 0 ? (
          <div className="rounded-xl border border-ink/[.06] bg-surface px-4 py-16 text-center text-[13.5px] text-faint">
            아직 등록된 이벤트가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/events/${post.id}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink/[.06] bg-surface hover:border-ink/[.14]"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
                  {post.thumbnailSrc ? (
                    <img src={post.thumbnailSrc} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <NavIcon name="megaphone" size={36} className="text-faint" />
                  )}
                </div>
                <div className="flex flex-col gap-1 px-4 py-3">
                  <div className="truncate text-[15px] font-bold text-fg group-hover:text-accent">{post.title}</div>
                  <div className="text-[12.5px] text-faint">{formatEventDate(post.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Detail page**

`apps/dashboard/app/events/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEventDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventPost } from "@/lib/queries/event-posts";

export const dynamic = "force-dynamic";

export default async function EventPostPage({ params }: { params: { id: string } }) {
  const currentAdmin = await getCurrentAdmin();
  const isAdmin = currentAdmin !== null;
  const post = await getEventPost(prisma, params.id, isAdmin);
  if (!post) notFound();

  return (
    <AppShell activeNav="events" pageTitle="이벤트" pageDesc={post.title}>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 pt-5 md:px-7 md:pt-6">
        <Link href="/events" className="text-[13px] text-faint hover:text-fg-2">
          ← 목록
        </Link>
        <header className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] font-extrabold tracking-tight text-fg md:text-[24px]">{post.title}</h2>
          <div className="text-[12.5px] text-faint">{formatEventDate(post.createdAt)}</div>
        </header>

        {/* Task 5: admin bar goes here */}

        {post.hiddenImages.map((image) => (
          <figure key={image.id} className="relative m-0">
            {/* Only admins receive unrevealed hidden images (getEventPost), so the badge is theirs alone. */}
            {!post.revealed && (
              <span className="absolute left-2 top-2 rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-danger-soft shadow-sm">
                공개 전
              </span>
            )}
            <img src={image.src} alt="" className="w-full rounded-xl border border-ink/[.06]" />
          </figure>
        ))}
        {post.mainImages.map((image) => (
          <img key={image.id} src={image.src} alt="" className="w-full rounded-xl border border-ink/[.06]" />
        ))}
        {post.body && (
          <p className="m-0 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-fg-2">{post.body}</p>
        )}
      </article>
    </AppShell>
  );
}
```

- [ ] **Step 6: Verify by hand**

Run: `npm run dev --workspace=dashboard` (no posts exist yet — creating them is Task 5). Check:
- Sidebar 추첨 group shows 이벤트 under 핀볼 뽑기 with the megaphone icon, signed in and signed out.
- `/events` shows the empty-state card; at 375px width it is one column with no horizontal scroll.
- `/events/nonexistent` shows Next's 404.
- `curl -i http://localhost:3000/api/events/images/nonexistent` → `404` with `Cache-Control: private, no-store`.

Also run: `npm run test --workspace=dashboard` → all pass (no regressions from the `AppShell` union change).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/api/events apps/dashboard/app/events apps/dashboard/components/nav-icons.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(events): image route, nav entry, public list and detail pages"
```

---

### Task 5: Admin actions, editor pages, reveal/delete controls

**Files:**
- Create: `apps/dashboard/app/events/actions.ts`
- Create: `apps/dashboard/components/events/EventPostForm.tsx`
- Create: `apps/dashboard/components/events/EventImageManager.tsx`
- Create: `apps/dashboard/components/events/EventAdminBar.tsx`
- Create: `apps/dashboard/app/events/new/page.tsx`
- Create: `apps/dashboard/app/events/[id]/edit/page.tsx`
- Modify: `apps/dashboard/app/events/[id]/page.tsx` (render `EventAdminBar`)

**Interfaces:**
- Consumes: every mutation from Task 2; `getEventPost` (Task 3); `requireAdmin`, `getCurrentAdmin`.
- Produces (server actions in `@/app/events/actions`, all return `Promise<{ error: string | null }>` unless noted):
  - `createEventPostAction(formData: FormData)` — fields `title`, `body`; on success **redirects** to `/events/<id>/edit` (never returns)
  - `updateEventPostAction(id: string, formData: FormData)`
  - `deleteEventPostAction(id: string)`
  - `setEventPostRevealedAction(id: string, revealed: boolean)`
  - `addEventImageAction(formData: FormData)` — fields `postId`, `kind`, `file`
  - `deleteEventImageAction(imageId: string)`
  - `moveEventImageAction(imageId: string, direction: "up" | "down")`

No new automated test: every decision lives in Task 2/3 functions; this task is wiring. Verify by hand in Step 8.

- [ ] **Step 1: Server actions**

`apps/dashboard/app/events/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventImageKind } from "@lolpamin/db";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import {
  addEventImage,
  createEventPost,
  deleteEventImage,
  deleteEventPost,
  EventPostValidationError,
  moveEventImage,
  setEventPostRevealed,
  updateEventPost,
} from "@/lib/mutations/event-posts";

interface EventActionResult {
  error: string | null;
}

// Validation messages are written for the operator; anything else (a Prisma error in
// English) is replaced by a short Korean fallback.
function toMessage(error: unknown, fallback: string): string {
  return error instanceof EventPostValidationError ? error.message : fallback;
}

function revalidatePost(postId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${postId}`);
  revalidatePath(`/events/${postId}/edit`);
}

function readInput(formData: FormData) {
  return { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") };
}

export async function createEventPostAction(formData: FormData): Promise<EventActionResult> {
  const acting = await requireAdmin();
  let id: string;
  try {
    id = (await createEventPost(prisma, readInput(formData), acting.id)).id;
  } catch (error) {
    return { error: toMessage(error, "글을 저장하지 못했습니다.") };
  }
  revalidatePath("/events");
  // Outside try: redirect() works by throwing.
  redirect(`/events/${id}/edit`);
}

export async function updateEventPostAction(id: string, formData: FormData): Promise<EventActionResult> {
  const acting = await requireAdmin();
  try {
    await updateEventPost(prisma, id, readInput(formData), acting.id);
  } catch (error) {
    return { error: toMessage(error, "글을 저장하지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

export async function deleteEventPostAction(id: string): Promise<EventActionResult> {
  await requireAdmin();
  try {
    await deleteEventPost(prisma, id);
  } catch (error) {
    return { error: toMessage(error, "글을 삭제하지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

export async function setEventPostRevealedAction(id: string, revealed: boolean): Promise<EventActionResult> {
  const acting = await requireAdmin();
  try {
    await setEventPostRevealed(prisma, id, revealed === true, acting.id);
  } catch (error) {
    return { error: toMessage(error, revealed ? "공개하지 못했습니다." : "숨기지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

// One file per call: each stays under the 20mb server-action body limit.
export async function addEventImageAction(formData: FormData): Promise<EventActionResult> {
  await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라주세요." };
  try {
    await addEventImage(prisma, postId, String(formData.get("kind")) as EventImageKind, {
      bytes: Buffer.from(await file.arrayBuffer()),
      type: file.type,
    });
  } catch (error) {
    return { error: toMessage(error, "사진을 올리지 못했습니다.") };
  }
  revalidatePost(postId);
  return { error: null };
}

export async function deleteEventImageAction(imageId: string): Promise<EventActionResult> {
  await requireAdmin();
  let postId: string | null;
  try {
    postId = await deleteEventImage(prisma, imageId);
  } catch (error) {
    return { error: toMessage(error, "사진을 삭제하지 못했습니다.") };
  }
  if (postId) revalidatePost(postId);
  return { error: null };
}

export async function moveEventImageAction(imageId: string, direction: "up" | "down"): Promise<EventActionResult> {
  await requireAdmin();
  let postId: string | null;
  try {
    postId = await moveEventImage(prisma, imageId, direction);
  } catch (error) {
    return { error: toMessage(error, "사진 순서를 바꾸지 못했습니다.") };
  }
  if (postId) revalidatePost(postId);
  return { error: null };
}
```

- [ ] **Step 2: Title/body form**

`apps/dashboard/components/events/EventPostForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TITLE_MAX = 100;
const BODY_MAX = 5000;

// Shared by /events/new (create redirects on success) and the edit page (stays put).
export function EventPostForm({
  initialTitle = "",
  initialBody = "",
  submitLabel,
  onSubmit,
}: {
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-fg-2">제목</span>
        <input
          name="title"
          defaultValue={initialTitle}
          maxLength={TITLE_MAX}
          required
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-fg-2">내용</span>
        <textarea
          name="body"
          defaultValue={initialBody}
          maxLength={BODY_MAX}
          rows={6}
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] leading-relaxed text-fg"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "저장 중…" : submitLabel}
        </button>
        {saved && !error && <span className="text-[12.5px] text-faint">저장했습니다.</span>}
        {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Image manager**

`apps/dashboard/components/events/EventImageManager.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventImageKind } from "@lolpamin/db";
import { addEventImageAction, deleteEventImageAction, moveEventImageAction } from "@/app/events/actions";
import type { EventImageRef } from "@/lib/queries/event-posts";

// One section (일반 사진 or 추후 공개 사진) of the edit page. Each change applies
// immediately, apart from the title/body form's 저장 — like BannerSlotGrid.
export function EventImageManager({
  postId,
  kind,
  label,
  hint,
  images,
}: {
  postId: string;
  kind: EventImageKind;
  label: string;
  hint: string;
  images: EventImageRef[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(status: string, work: () => Promise<string | null>) {
    setError(null);
    setBusy(status);
    startTransition(async () => {
      const failure = await work();
      setBusy(null);
      if (failure) setError(failure);
      router.refresh();
    });
  }

  // Sequential on purpose: parallel uploads would race for the same next position.
  function upload(files: File[]) {
    if (files.length === 0) return;
    run("올리는 중…", async () => {
      for (const [index, file] of files.entries()) {
        const formData = new FormData();
        formData.set("postId", postId);
        formData.set("kind", kind);
        formData.set("file", file);
        const result = await addEventImageAction(formData);
        if (result.error) return `${file.name}: ${result.error}${index < files.length - 1 ? " (나머지는 올리지 않았습니다)" : ""}`;
      }
      return null;
    });
  }

  function remove(imageId: string, index: number) {
    if (!window.confirm(`${label} ${index + 1}번을 삭제할까요?`)) return;
    run("삭제 중…", async () => (await deleteEventImageAction(imageId)).error);
  }

  function move(imageId: string, direction: "up" | "down") {
    run("옮기는 중…", async () => (await moveEventImageAction(imageId, direction)).error);
  }

  const disabled = busy !== null;
  const buttonClass =
    "rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-fg-2 shadow-sm hover:bg-surface disabled:opacity-40";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold text-fg">{label}</span>
        <span className="text-[12px] text-faint">{hint}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="ml-auto rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50"
        >
          {busy ?? "+ 사진 추가"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          // Let the same file be picked again.
          e.target.value = "";
        }}
      />
      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/[.14] px-4 py-8 text-center text-[12.5px] text-faint">
          사진이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div key={image.id} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-ink/[.06] bg-inset">
              <img src={image.src} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-md bg-surface/90 px-1.5 text-[11.5px] font-bold text-fg-2">
                {index + 1}
              </span>
              <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                <button type="button" onClick={() => move(image.id, "up")} disabled={disabled || index === 0} className={buttonClass} aria-label="앞으로">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(image.id, "down")}
                  disabled={disabled || index === images.length - 1}
                  className={buttonClass}
                  aria-label="뒤로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(image.id, index)}
                  disabled={disabled}
                  className={`${buttonClass} text-danger-soft`}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </section>
  );
}
```

- [ ] **Step 4: Admin bar (reveal / edit / delete)**

`apps/dashboard/components/events/EventAdminBar.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEventPostAction, setEventPostRevealedAction } from "@/app/events/actions";

export function EventAdminBar({
  postId,
  revealed,
  hiddenCount,
}: {
  postId: string;
  revealed: boolean;
  hiddenCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleReveal() {
    const message = revealed
      ? "추후 공개 사진을 다시 숨길까요? 일반 회원에게 보이지 않게 됩니다."
      : `추후 공개 사진 ${hiddenCount}장을 공개할까요? 글 맨 위에 바로 나타납니다.`;
    if (!window.confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const result = await setEventPostRevealedAction(postId, !revealed);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  // Not undoable, so two confirms — the same guard as the rating resets.
  function remove() {
    if (!window.confirm("이 글과 사진을 모두 삭제합니다. 되돌릴 수 없습니다.")) return;
    if (!window.confirm("정말 삭제합니까?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEventPostAction(postId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/events");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/[.06] bg-surface-3 px-3 py-2.5">
      <span className="text-[12.5px] font-bold text-faint">운영자</span>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={toggleReveal}
          disabled={isPending}
          className={
            revealed
              ? "rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50"
              : "rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
          }
        >
          {revealed ? "추후 공개 숨기기" : `추후 공개 사진 공개 (${hiddenCount})`}
        </button>
      )}
      <Link
        href={`/events/${postId}/edit`}
        className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
      >
        수정
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-danger-soft hover:bg-hover disabled:opacity-50"
      >
        삭제
      </button>
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Wire the admin bar into the detail page**

In `apps/dashboard/app/events/[id]/page.tsx`, add the import:

```tsx
import { EventAdminBar } from "@/components/events/EventAdminBar";
```

and replace `{/* Task 5: admin bar goes here */}` with:

```tsx
        {isAdmin && (
          <EventAdminBar postId={post.id} revealed={post.revealed} hiddenCount={post.hiddenImages.length} />
        )}
```

(`hiddenImages` holds every hidden image for an admin — `getEventPost(…, true)` — so its length is the count to reveal.)

- [ ] **Step 6: New-post page**

`apps/dashboard/app/events/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EventPostForm } from "@/components/events/EventPostForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { createEventPostAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPostPage() {
  if (!(await getCurrentAdmin())) redirect("/login");

  return (
    <AppShell activeNav="events" pageTitle="이벤트 글쓰기" pageDesc="새 이벤트 글" desktopOnly>
      <div className="flex max-w-3xl flex-col gap-3 px-7 pb-10 pt-6">
        <p className="m-0 text-[13px] text-faint">
          제목과 내용을 먼저 저장하면 사진(일반 · 추후 공개)을 올리는 화면으로 넘어갑니다.
        </p>
        <EventPostForm submitLabel="저장하고 사진 올리기" onSubmit={createEventPostAction} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: Edit page**

`apps/dashboard/app/events/[id]/edit/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EventImageManager } from "@/components/events/EventImageManager";
import { EventPostForm } from "@/components/events/EventPostForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventPost } from "@/lib/queries/event-posts";
import { updateEventPostAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEventPostPage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect("/login");
  const post = await getEventPost(prisma, params.id, true);
  if (!post) notFound();

  return (
    <AppShell activeNav="events" pageTitle="이벤트 수정" pageDesc={post.title} desktopOnly>
      <div className="flex max-w-4xl flex-col gap-4 px-7 pb-10 pt-6">
        <Link href={`/events/${post.id}`} className="text-[13px] text-faint hover:text-fg-2">
          ← 글 보기
        </Link>
        <EventPostForm
          initialTitle={post.title}
          initialBody={post.body}
          submitLabel="저장"
          onSubmit={updateEventPostAction.bind(null, post.id)}
        />
        <EventImageManager
          postId={post.id}
          kind="MAIN"
          label="일반 사진"
          hint="바로 보입니다 · 장당 5MB"
          images={post.mainImages}
        />
        <EventImageManager
          postId={post.id}
          kind="HIDDEN"
          label="추후 공개 사진"
          hint={post.revealed ? "공개됨 · 글 맨 위에 보입니다" : "공개 버튼을 누르기 전까지 운영자만 봅니다"}
          images={post.hiddenImages}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 8: Verify by hand**

Run: `npm run dev --workspace=dashboard`, sign in as admin.
1. `/events` → 새 글 → title "9월 이벤트", body two lines → 저장하고 사진 올리기 → lands on `/events/<id>/edit`.
2. 일반 사진: add `sample/before.png`. 추후 공개 사진: add `sample/after.png`. Add two more to 일반, use ↑/↓, delete one; order sticks after reload. Try a `.svg` renamed file or >5MB file → Korean error, nothing added.
3. `/events/<id>` as admin: after.png on top with 공개 전 badge, then before.png, then body with the line break. Button reads `추후 공개 사진 공개 (1)`.
4. In a private window (signed out): `/events/<id>` shows before.png only, no badge, no trace of after.png in page source (search the HTML for its image id). Opening the after.png URL copied from the admin window → 404.
5. Admin presses 공개 → confirm → after.png now visible in the private window on reload, at the top; `/events` card thumbnail is after.png. Response header for it: `Cache-Control: private, no-store`.
6. 추후 공개 숨기기 → private window again 404s on that URL and no longer shows it.
7. 삭제 → two confirms → back on `/events`, card gone.
8. Signed out, `/events/new` and `/events/<id>/edit` redirect to `/login`. At 375px, `/events/<id>` is readable with no horizontal scroll; the edit page shows the PC notice.

Run: `npm test` → all workspaces pass.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/app/events apps/dashboard/components/events
git commit -m "feat(events): admin editor, image manager, reveal and delete controls"
```

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an event board paragraph**

In `CLAUDE.md`, after the `/player-stats` paragraph (the one beginning "`/player-stats` aggregates rift results…"), add:

```markdown
`/events` (이벤트, under 추첨) is a poster board: admins write, everyone reads. A post is
a title, a plain-text body and two ordered image lists — `MAIN` (shown at once) and
`HIDDEN` (추후 공개). `EventPost.revealedAt` gates every `HIDDEN` image of the post at
once: while null, visitors get neither the image nor its id (`getEventPost` drops it)
and `/api/events/images/[id]` answers 404 — not 403, which would admit it exists.
Revealing puts them at the top of the post and is undoable (숨기기), which is why a
`HIDDEN` response is always `private, no-store` while `MAIN` is immutable: image rows
are never edited, a replacement is a new id. Images live in Postgres `Bytes` like
`HomeBanner` (5MB, png/jpg/webp/gif, 20 per kind) and are uploaded one per server
action so the 20mb body limit never bites. The rule is `canViewEventImage` in
`packages/core`; the list thumbnail (`pickEventThumbnailId`) shows what a visitor
would see, admins included.
```

- [ ] **Step 2: Update the Mobile section lists**

In `CLAUDE.md` § Mobile, replace the opening of the first paragraph

"Six read screens plus `/login` (`/`, `/member-info`, `/rift`, `/aram`,
`/match-history`, `/inactive`, `/player-stats`) work down to a 375px phone; the nine operator
screens (`matches`, `replay-import`, `team-builder`, `kakao-import`,
`link-accounts`, `member-admin`, `admins`, `draw/cannon`, `draw/plinko`)"

with

"Nine read screens plus `/login` (`/`, `/member-info`, `/rift`, `/aram`,
`/match-history`, `/inactive`, `/player-stats`, `/events`, `/events/[id]`) work down to a
375px phone; the eleven operator screens (`matches`, `replay-import`, `team-builder`,
`kakao-import`, `link-accounts`, `member-admin`, `admins`, `draw/cannon`, `draw/plinko`,
`events/new`, `events/[id]/edit`)"

(The old "Six" was already one short of its seven paths.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: event board"
```
