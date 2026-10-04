# Meeting Notes Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only meeting-notes board (`/meeting-notes`) with a list (title, meeting date, author, created, last edit), a markdown-subset body with inline images, and save-conflict rejection.

**Architecture:** Pure parsing/date helpers in `packages/core`; two new Prisma models; DB logic in `lib/mutations/meeting-notes.ts` and `lib/queries/meeting-notes.ts` (prisma as first arg); thin server actions; four pages under `app/meeting-notes/` plus an admin-only image route. Images upload one per server action into `MeetingNoteImage` with `noteId = null` and are attached when the note is saved.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres 16, vitest, Tailwind (semantic colour roles only).

**Spec:** `docs/superpowers/specs/2026-10-02-meeting-notes-design.md`

## Global Constraints

- Every page reading the DB: `export const dynamic = "force-dynamic"`.
- Read **and** write are admin-only. Pages redirect with `redirect(loginPathFor(path))`; actions call `requireAdmin()`; the image route answers 404 to non-admins.
- Colours are never hex; use `bg-surface`, `text-fg`, `text-faint`, `border-ink/[.06]`, `bg-accent` etc. `text-white` only on `bg-accent` buttons.
- UI copy Korean; identifiers, comments, commit messages English.
- Every DB test file starts with the `DATABASE_URL_TEST` guard and calls `resetDatabase()` in `beforeEach`.
- Title 1–100 chars after trim; body ≤ 50,000 chars; image ≤ 5MB, `image/png|jpeg|webp|gif`; unattached image TTL 24h; page size 20.
- Rendering never uses `dangerouslySetInnerHTML`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Plain HTTP deploy** — `crypto.randomUUID` is undefined outside secure contexts; placeholder keys must come from a counter (Task 6 uses a ref counter, never `crypto`).
2. **Two saves in one millisecond** — conflict detection uses an integer `version`, not `updatedAt` (Task 3 test "second save with the same version is rejected").
3. **Body referencing another note's image id** — must not steal it (Task 3 test "does not attach an image owned by another note").
4. **Malformed `version` / `meetingDate` from the form** (empty, `NaN`, `2026-02-30`) — readable Korean validation error, not a Prisma error (Task 3 tests).
5. **Unmatched `**`, `- [ ]` vs `- `, image syntax mid-sentence** — render as literal text, no crash (Task 1 tests).

---

### Task 1: Core — body parser and meeting-date helpers

**Files:**
- Create: `packages/core/src/meeting-note-body.ts`
- Create: `packages/core/src/meeting-note-body.test.ts`
- Create: `packages/core/src/meeting-note-date.ts`
- Create: `packages/core/src/meeting-note-date.test.ts`
- Modify: `packages/core/src/index.ts` (append two exports)

**Interfaces:**
- Produces:
  - `type MeetingNoteSpan = { text: string; bold: boolean }`
  - `type MeetingNoteBlock = { kind: "heading"; level: 1|2|3; spans } | { kind: "bullets"; items: MeetingNoteSpan[][] } | { kind: "numbers"; items: MeetingNoteSpan[][] } | { kind: "checklist"; items: { checked: boolean; spans: MeetingNoteSpan[] }[] } | { kind: "image"; id: string } | { kind: "paragraph"; lines: MeetingNoteSpan[][] }`
  - `parseInlineBold(text: string): MeetingNoteSpan[]`
  - `parseMeetingNoteBody(body: string): MeetingNoteBlock[]`
  - `extractMeetingNoteImageIds(body: string): string[]`
  - `parseMeetingDateInput(value: string): Date | null` (UTC midnight)
  - `toMeetingDateInput(date: Date): string` (`YYYY-MM-DD`)
  - `formatMeetingDate(date: Date): string` (`YYYY.MM.DD`)
  - `seoulTodayInput(now: Date): string`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/meeting-note-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractMeetingNoteImageIds, parseInlineBold, parseMeetingNoteBody } from "./meeting-note-body";

const plain = (text: string) => [{ text, bold: false }];

describe("parseInlineBold", () => {
  it("splits matched ** pairs", () => {
    expect(parseInlineBold("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });

  it("keeps an unmatched ** literal", () => {
    expect(parseInlineBold("a**b")).toEqual(plain("a**b"));
    expect(parseInlineBold("a**b**c**d")).toEqual([
      { text: "a", bold: false },
      { text: "b", bold: true },
      { text: "c**d", bold: false },
    ]);
  });

  it("drops empty pieces", () => {
    expect(parseInlineBold("**x**")).toEqual([{ text: "x", bold: true }]);
    expect(parseInlineBold("")).toEqual([]);
  });
});

describe("parseMeetingNoteBody", () => {
  it("parses headings of three levels", () => {
    expect(parseMeetingNoteBody("# 안건\n## 세부\n### 메모")).toEqual([
      { kind: "heading", level: 1, spans: plain("안건") },
      { kind: "heading", level: 2, spans: plain("세부") },
      { kind: "heading", level: 3, spans: plain("메모") },
    ]);
  });

  it("treats #### and #text as paragraph text", () => {
    expect(parseMeetingNoteBody("#### x\n#y")).toEqual([
      { kind: "paragraph", lines: [plain("#### x"), plain("#y")] },
    ]);
  });

  it("groups consecutive bullet, number and checklist lines", () => {
    expect(parseMeetingNoteBody("- a\n- b\n1. c\n5. d\n- [ ] e\n- [x] f\n- [X] g")).toEqual([
      { kind: "bullets", items: [plain("a"), plain("b")] },
      { kind: "numbers", items: [plain("c"), plain("d")] },
      {
        kind: "checklist",
        items: [
          { checked: false, spans: plain("e") },
          { checked: true, spans: plain("f") },
          { checked: true, spans: plain("g") },
        ],
      },
    ]);
  });

  it("splits lists of the same kind on a blank line", () => {
    expect(parseMeetingNoteBody("- a\n\n- b")).toEqual([
      { kind: "bullets", items: [plain("a")] },
      { kind: "bullets", items: [plain("b")] },
    ]);
  });

  it("ignores leading indentation", () => {
    expect(parseMeetingNoteBody("   - a\n\t- b")).toEqual([{ kind: "bullets", items: [plain("a"), plain("b")] }]);
  });

  it("joins consecutive plain lines into one paragraph and splits on blank lines", () => {
    expect(parseMeetingNoteBody("one\ntwo\n\n\nthree")).toEqual([
      { kind: "paragraph", lines: [plain("one"), plain("two")] },
      { kind: "paragraph", lines: [plain("three")] },
    ]);
  });

  it("reads a whole-line image and leaves a mid-sentence one as text", () => {
    expect(parseMeetingNoteBody("![](img1)\n![캡처](img2)\n이건 ![](img3) 글자")).toEqual([
      { kind: "image", id: "img1" },
      { kind: "image", id: "img2" },
      { kind: "paragraph", lines: [plain("이건 ![](img3) 글자")] },
    ]);
  });

  it("handles CRLF and an empty body", () => {
    expect(parseMeetingNoteBody("a\r\nb")).toEqual([{ kind: "paragraph", lines: [plain("a"), plain("b")] }]);
    expect(parseMeetingNoteBody("")).toEqual([]);
    expect(parseMeetingNoteBody("\n\n")).toEqual([]);
  });

  it("keeps bold inside list items", () => {
    expect(parseMeetingNoteBody("- **결정**: 진행")).toEqual([
      { kind: "bullets", items: [[{ text: "결정", bold: true }, { text: ": 진행", bold: false }]] },
    ]);
  });
});

describe("extractMeetingNoteImageIds", () => {
  it("returns whole-line image ids, deduplicated, in order", () => {
    expect(extractMeetingNoteImageIds("![](b)\ntext ![](x) text\n![](a)\n![](b)")).toEqual(["b", "a"]);
  });
});
```

`packages/core/src/meeting-note-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMeetingDate, parseMeetingDateInput, seoulTodayInput, toMeetingDateInput } from "./meeting-note-date";

describe("meeting date", () => {
  it("parses a calendar day to UTC midnight and back", () => {
    const date = parseMeetingDateInput("2026-10-02");
    expect(date?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(toMeetingDateInput(date!)).toBe("2026-10-02");
    expect(formatMeetingDate(date!)).toBe("2026.10.02");
  });

  it("rejects malformed or impossible days", () => {
    expect(parseMeetingDateInput("")).toBeNull();
    expect(parseMeetingDateInput("2026-2-3")).toBeNull();
    expect(parseMeetingDateInput("2026-02-30")).toBeNull();
    expect(parseMeetingDateInput("2026-10-02T00:00")).toBeNull();
  });

  it("gives today's Seoul date even when UTC is still yesterday", () => {
    expect(seoulTodayInput(new Date("2026-10-01T16:30:00Z"))).toBe("2026-10-02");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (cwd `packages/core`): `npx vitest run src/meeting-note-body.test.ts src/meeting-note-date.test.ts`
Expected: FAIL — cannot resolve `./meeting-note-body` / `./meeting-note-date`.

- [ ] **Step 3: Implement**

`packages/core/src/meeting-note-body.ts`:

```ts
// The meeting-notes body is a markdown subset rendered by our own code: headings (# ## ###),
// bullets (-), numbered items (1.), checkboxes (- [ ] / - [x]), whole-line images (![](id))
// and **bold**. Anything else is literal text — there is no HTML path at all.

export interface MeetingNoteSpan {
  text: string;
  bold: boolean;
}

export type MeetingNoteBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: MeetingNoteSpan[] }
  | { kind: "bullets"; items: MeetingNoteSpan[][] }
  | { kind: "numbers"; items: MeetingNoteSpan[][] }
  | { kind: "checklist"; items: Array<{ checked: boolean; spans: MeetingNoteSpan[] }> }
  | { kind: "image"; id: string }
  | { kind: "paragraph"; lines: MeetingNoteSpan[][] };

const HEADING = /^(#{1,3}) (.*)$/;
const CHECK = /^- \[([ xX])\] (.*)$/;
const BULLET = /^- (.*)$/;
const NUMBER = /^\d+\. (.*)$/;
const IMAGE = /^!\[[^\]]*\]\(([^)\s]+)\)$/;

export function parseInlineBold(text: string): MeetingNoteSpan[] {
  const parts = text.split("**");
  // An odd number of markers leaves the last one without a partner: it stays literal.
  if (parts.length % 2 === 0) {
    const last = parts.pop()!;
    parts[parts.length - 1] += `**${last}`;
  }
  const spans: MeetingNoteSpan[] = [];
  parts.forEach((part, i) => {
    if (part) spans.push({ text: part, bold: i % 2 === 1 });
  });
  return spans;
}

export function parseMeetingNoteBody(body: string): MeetingNoteBlock[] {
  const blocks: MeetingNoteBlock[] = [];
  // The block still accepting lines; a blank line, a heading or an image closes it.
  let open: MeetingNoteBlock | null = null;

  const push = (block: MeetingNoteBlock) => {
    blocks.push(block);
    open = block;
  };

  for (const raw of body.split(/\r?\n/)) {
    // Indentation is ignored: nested lists are out of scope.
    const line = raw.trim();
    if (!line) {
      open = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, spans: parseInlineBold(heading[2]) });
      open = null;
      continue;
    }

    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ kind: "image", id: image[1] });
      open = null;
      continue;
    }

    const current = open as MeetingNoteBlock | null;
    const check = CHECK.exec(line);
    if (check) {
      const item = { checked: check[1] !== " ", spans: parseInlineBold(check[2]) };
      if (current?.kind === "checklist") current.items.push(item);
      else push({ kind: "checklist", items: [item] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      const spans = parseInlineBold(bullet[1]);
      if (current?.kind === "bullets") current.items.push(spans);
      else push({ kind: "bullets", items: [spans] });
      continue;
    }

    const number = NUMBER.exec(line);
    if (number) {
      const spans = parseInlineBold(number[1]);
      if (current?.kind === "numbers") current.items.push(spans);
      else push({ kind: "numbers", items: [spans] });
      continue;
    }

    const spans = parseInlineBold(line);
    if (current?.kind === "paragraph") current.lines.push(spans);
    else push({ kind: "paragraph", lines: [spans] });
  }

  return blocks;
}

export function extractMeetingNoteImageIds(body: string): string[] {
  const ids: string[] = [];
  for (const block of parseMeetingNoteBody(body)) {
    if (block.kind === "image" && !ids.includes(block.id)) ids.push(block.id);
  }
  return ids;
}
```

`packages/core/src/meeting-note-date.ts`:

```ts
import { toSeoulDateTimeInput } from "./played-at";

// A meeting date is a calendar day, stored as UTC midnight so it reads the same in any zone.
// Unlike playedAt it never carries a time.

export function parseMeetingDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  // 2026-02-30 parses to March 2nd; the round trip catches it.
  if (Number.isNaN(date.getTime()) || toMeetingDateInput(date) !== value) return null;
  return date;
}

export function toMeetingDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatMeetingDate(date: Date): string {
  return toMeetingDateInput(date).replace(/-/g, ".");
}

// The new-note form's default.
export function seoulTodayInput(now: Date): string {
  return toSeoulDateTimeInput(now).slice(0, 10);
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./meeting-note-body";
export * from "./meeting-note-date";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (cwd `packages/core`): `npx vitest run`
Expected: all core tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/meeting-note-body.ts packages/core/src/meeting-note-body.test.ts packages/core/src/meeting-note-date.ts packages/core/src/meeting-note-date.test.ts packages/core/src/index.ts
git commit -m "feat(core): meeting note body parser and date helpers"
```

---

### Task 2: Schema, migration, test reset

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append after `EventImage`)
- Create: `packages/db/prisma/migrations/<timestamp>_meeting_notes/migration.sql` (generated)
- Modify: `packages/db/src/test-utils.ts`

**Interfaces:**
- Produces: Prisma models `meetingNote` (`id, title, meetingDate, body, createdAt, updatedAt, version, createdById, updatedById, images`) and `meetingNoteImage` (`id, noteId, bytes, type, createdAt, createdById`).

- [ ] **Step 1: Append the models to `schema.prisma`**

```prisma
// 운영진 회의록. 읽기까지 관리자 전용.
// version은 저장 충돌 검사의 기준이다 — 수정 폼이 연 시점의 값을 보내고, 다르면 거부한다.
// updatedAt이 아닌 이유: 밀리초 단위라 같은 밀리초 안의 두 저장을 구별하지 못한다.
model MeetingNote {
  id          String             @id @default(cuid())
  title       String
  // 회의한 날(UTC 자정으로 저장한 달력 날짜). 정리해서 나중에 올리는 일이 많아 작성일과 따로 둔다.
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
// 행은 고치지 않는다: 교체는 삭제 + 추가다.
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

- [ ] **Step 2: Generate and apply the migration (dev + test DB)**

Run (repo root, Bash; Docker Postgres must be up):

```bash
npm run migrate --workspace=@lolpamin/db -- --name meeting_notes
cd packages/db && DATABASE_URL="$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d= -f2- | tr -d '"\r')" npx prisma migrate deploy; cd ../..
```

Expected: a new `packages/db/prisma/migrations/*_meeting_notes/migration.sql` creating `MeetingNote`, `MeetingNoteImage`, both indexes and the FK with `ON DELETE CASCADE`; `migrate deploy` reports it applied to the test DB. `prisma migrate dev` also runs `prisma generate`.

- [ ] **Step 3: Reset the new tables in tests**

In `packages/db/src/test-utils.ts`, append inside `resetDatabase` after `await client.eventPost.deleteMany();`:

```ts
  await client.meetingNoteImage.deleteMany();
  await client.meetingNote.deleteMany();
```

- [ ] **Step 4: Verify the existing suite still passes**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/event-posts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts
git commit -m "feat(db): MeetingNote and MeetingNoteImage models"
```

---

### Task 3: Queries and mutations

**Files:**
- Create: `apps/dashboard/lib/queries/meeting-notes.ts`
- Create: `apps/dashboard/lib/queries/meeting-notes.test.ts`
- Create: `apps/dashboard/lib/mutations/meeting-notes.ts`
- Create: `apps/dashboard/lib/mutations/meeting-notes.test.ts`

**Interfaces:**
- Consumes: Task 1 `extractMeetingNoteImageIds`, `parseMeetingDateInput`; `formatEventDateTime` (existing, core); Task 2 models.
- Produces (queries):
  - `MEETING_NOTES_PAGE_SIZE = 20`, `DELETED_ADMIN_LABEL = "삭제된 관리자"`
  - `parseMeetingNotesPage(value: string | undefined): number`
  - `adminNames(prisma: Pick<PrismaClient, "admin">, ids: Array<string | null>): Promise<Map<string, string>>`
  - `adminLabel(names: Map<string, string>, id: string | null): string`
  - `interface MeetingNoteListRow { id; title; meetingDate: Date; createdAt: Date; createdByName: string; updatedAt: Date; updatedByName: string; edited: boolean }`
  - `listMeetingNotes(prisma, page: number): Promise<{ rows: MeetingNoteListRow[]; page: number; pageCount: number; total: number }>`
  - `interface MeetingNoteDetail { id; title; meetingDate: Date; body: string; createdAt: Date; createdByName: string; updatedAt: Date; updatedByName: string; version: number; edited: boolean; imageIds: string[] }`
  - `getMeetingNote(prisma, id: string): Promise<MeetingNoteDetail | null>`
  - `getMeetingNoteImage(prisma, id: string): Promise<{ bytes: Buffer; type: string } | null>`
- Produces (mutations):
  - constants `MEETING_NOTE_TITLE_MAX = 100`, `MEETING_NOTE_BODY_MAX = 50_000`, `MEETING_NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024`, `ALLOWED_MEETING_NOTE_IMAGE_TYPES`, `UNATTACHED_IMAGE_TTL_MS = 24 * 60 * 60 * 1000`
  - `class MeetingNoteValidationError extends Error`
  - `class MeetingNoteConflictError extends Error` (message is the Korean notice)
  - `interface MeetingNoteInput { title: string; meetingDate: string; body: string }`
  - `createMeetingNote(prisma, input, adminId: string | null): Promise<{ id: string }>`
  - `updateMeetingNote(prisma, id, input, expectedVersion: number, adminId: string | null): Promise<void>`
  - `deleteMeetingNote(prisma, id): Promise<void>`
  - `addMeetingNoteImage(prisma, upload: { bytes: Buffer; type: string }, adminId: string | null, now?: Date): Promise<{ id: string }>`

- [ ] **Step 1: Write the failing mutation tests**

`apps/dashboard/lib/mutations/meeting-notes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  addMeetingNoteImage,
  createMeetingNote,
  deleteMeetingNote,
  MEETING_NOTE_BODY_MAX,
  MEETING_NOTE_IMAGE_MAX_BYTES,
  MeetingNoteConflictError,
  MeetingNoteValidationError,
  UNATTACHED_IMAGE_TTL_MS,
  updateMeetingNote,
} from "./meeting-notes";

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
const input = (body = "", title = "10월 운영 회의") => ({ title, meetingDate: "2026-10-02", body });

async function imageNoteId(id: string) {
  return (await prisma.meetingNoteImage.findUnique({ where: { id }, select: { noteId: true } }))?.noteId;
}

describe("createMeetingNote", () => {
  it("trims and stores the note with its author and meeting date", async () => {
    const admin = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, { title: "  회의 ", meetingDate: "2026-10-02", body: " 본문 " }, admin.id);
    const row = await prisma.meetingNote.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe("회의");
    expect(row.body).toBe("본문");
    expect(row.meetingDate.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(row.createdById).toBe(admin.id);
    expect(row.updatedById).toBe(admin.id);
    expect(row.version).toBe(0);
  });

  it("attaches unattached images the body references, and only those", async () => {
    const used = await addMeetingNoteImage(prisma, png, null);
    const unused = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`앞\n![](${used.id})\n뒤`), null);
    expect(await imageNoteId(used.id)).toBe(id);
    expect(await imageNoteId(unused.id)).toBeNull();
  });

  it("does not attach an image owned by another note", async () => {
    const image = await addMeetingNoteImage(prisma, png, null);
    const first = await createMeetingNote(prisma, input(`![](${image.id})`), null);
    await createMeetingNote(prisma, input(`![](${image.id})`, "다른 회의"), null);
    expect(await imageNoteId(image.id)).toBe(first.id);
  });

  it("rejects a blank title, a long title, a long body and a bad date", async () => {
    await expect(createMeetingNote(prisma, input("", "   "), null)).rejects.toThrow("제목을 입력해 주세요.");
    await expect(createMeetingNote(prisma, input("", "가".repeat(101)), null)).rejects.toThrow(MeetingNoteValidationError);
    await expect(createMeetingNote(prisma, input("가".repeat(MEETING_NOTE_BODY_MAX + 1)), null)).rejects.toThrow(
      MeetingNoteValidationError,
    );
    for (const meetingDate of ["", "2026-02-30", "nope"]) {
      await expect(createMeetingNote(prisma, { title: "t", meetingDate, body: "" }, null)).rejects.toThrow(
        "회의 날짜가 올바르지 않습니다.",
      );
    }
  });
});

describe("updateMeetingNote", () => {
  it("saves with the current version and bumps it", async () => {
    const admin = await prisma.admin.create({ data: { username: "editor", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("처음"), null);
    await updateMeetingNote(prisma, id, input("고침"), 0, admin.id);
    const row = await prisma.meetingNote.findUniqueOrThrow({ where: { id } });
    expect(row.body).toBe("고침");
    expect(row.version).toBe(1);
    expect(row.updatedById).toBe(admin.id);
  });

  it("rejects a second save with the same version and names who saved first", async () => {
    const admin = await prisma.admin.create({ data: { username: "빠른운영진", passwordHash: "x" } });
    const { id } = await createMeetingNote(prisma, input("처음"), null);
    await updateMeetingNote(prisma, id, input("A"), 0, admin.id);
    const attempt = updateMeetingNote(prisma, id, input("B"), 0, null);
    await expect(attempt).rejects.toThrow(MeetingNoteConflictError);
    await expect(updateMeetingNote(prisma, id, input("B"), 0, null)).rejects.toThrow("빠른운영진");
    expect((await prisma.meetingNote.findUniqueOrThrow({ where: { id } })).body).toBe("A");
  });

  it("rejects a missing note and a malformed version", async () => {
    await expect(updateMeetingNote(prisma, "nope", input(), 0, null)).rejects.toThrow("회의록을 찾을 수 없습니다.");
    const { id } = await createMeetingNote(prisma, input(), null);
    await expect(updateMeetingNote(prisma, id, input(), Number.NaN, null)).rejects.toThrow(MeetingNoteValidationError);
  });

  it("attaches newly referenced images and deletes ones the body dropped", async () => {
    const kept = await addMeetingNoteImage(prisma, png, null);
    const dropped = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`![](${kept.id})\n![](${dropped.id})`), null);
    const added = await addMeetingNoteImage(prisma, png, null);
    await updateMeetingNote(prisma, id, input(`![](${kept.id})\n![](${added.id})`), 0, null);
    expect(await imageNoteId(kept.id)).toBe(id);
    expect(await imageNoteId(added.id)).toBe(id);
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: dropped.id } })).toBeNull();
  });
});

describe("deleteMeetingNote", () => {
  it("removes the note and its images, and is harmless twice", async () => {
    const image = await addMeetingNoteImage(prisma, png, null);
    const { id } = await createMeetingNote(prisma, input(`![](${image.id})`), null);
    await deleteMeetingNote(prisma, id);
    await deleteMeetingNote(prisma, id);
    expect(await prisma.meetingNote.count()).toBe(0);
    expect(await prisma.meetingNoteImage.count()).toBe(0);
  });
});

describe("addMeetingNoteImage", () => {
  it("rejects a wrong type and an oversized file", async () => {
    await expect(addMeetingNoteImage(prisma, { bytes: Buffer.from("x"), type: "image/svg+xml" }, null)).rejects.toThrow(
      MeetingNoteValidationError,
    );
    await expect(
      addMeetingNoteImage(prisma, { bytes: Buffer.alloc(MEETING_NOTE_IMAGE_MAX_BYTES + 1), type: "image/png" }, null),
    ).rejects.toThrow("5MB");
  });

  it("sweeps unattached images older than the TTL and keeps recent and attached ones", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const old = new Date(now.getTime() - UNATTACHED_IMAGE_TTL_MS - 1000);
    const stale = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: old } });
    const fresh = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: now } });
    const note = await prisma.meetingNote.create({ data: { title: "t", meetingDate: now } });
    const attached = await prisma.meetingNoteImage.create({ data: { ...png, createdAt: old, noteId: note.id } });

    await addMeetingNoteImage(prisma, png, null, now);

    expect(await prisma.meetingNoteImage.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await prisma.meetingNoteImage.findUnique({ where: { id: attached.id } })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing query tests**

`apps/dashboard/lib/queries/meeting-notes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  DELETED_ADMIN_LABEL,
  getMeetingNote,
  getMeetingNoteImage,
  listMeetingNotes,
  MEETING_NOTES_PAGE_SIZE,
  parseMeetingNotesPage,
} from "./meeting-notes";

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

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe("parseMeetingNotesPage", () => {
  it("accepts positive integers only", () => {
    expect(parseMeetingNotesPage("3")).toBe(3);
    expect(parseMeetingNotesPage(undefined)).toBe(1);
    expect(parseMeetingNotesPage("0")).toBe(1);
    expect(parseMeetingNotesPage("x")).toBe(1);
  });
});

describe("listMeetingNotes", () => {
  it("orders by meeting date then creation, newest first, with author names", async () => {
    const admin = await prisma.admin.create({ data: { username: "op", passwordHash: "x" } });
    await prisma.meetingNote.create({ data: { title: "old", meetingDate: day("2026-09-01"), createdById: admin.id, updatedById: admin.id } });
    // Explicit createdAt: rows created in one millisecond would otherwise tie.
    await prisma.meetingNote.create({
      data: { title: "new-a", meetingDate: day("2026-10-01"), createdAt: new Date("2026-10-01T10:00:00Z"), createdById: "gone", updatedById: "gone" },
    });
    await prisma.meetingNote.create({
      data: { title: "new-b", meetingDate: day("2026-10-01"), createdAt: new Date("2026-10-01T11:00:00Z"), version: 2, updatedById: admin.id },
    });

    const list = await listMeetingNotes(prisma, 1);
    expect(list.rows.map((r) => r.title)).toEqual(["new-b", "new-a", "old"]);
    expect(list.rows[1].createdByName).toBe(DELETED_ADMIN_LABEL);
    expect(list.rows[2].createdByName).toBe("op");
    expect(list.rows[0].edited).toBe(true);
    expect(list.rows[2].edited).toBe(false);
    expect(list.total).toBe(3);
    expect(list.pageCount).toBe(1);
  });

  it("clamps an out-of-range page to the last page", async () => {
    await prisma.meetingNote.createMany({
      data: Array.from({ length: MEETING_NOTES_PAGE_SIZE + 1 }, (_, i) => ({ title: `n${i}`, meetingDate: day("2026-10-01") })),
    });
    const list = await listMeetingNotes(prisma, 99);
    expect(list.page).toBe(2);
    expect(list.pageCount).toBe(2);
    expect(list.rows).toHaveLength(1);
  });

  it("returns page 1 of 1 when empty", async () => {
    expect(await listMeetingNotes(prisma, 5)).toEqual({ rows: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("getMeetingNote / getMeetingNoteImage", () => {
  it("returns the body, version and attached image ids", async () => {
    const note = await prisma.meetingNote.create({ data: { title: "t", meetingDate: day("2026-10-02"), body: "b", version: 3 } });
    const image = await prisma.meetingNoteImage.create({
      data: { noteId: note.id, bytes: Buffer.from([1, 2]), type: "image/png" },
    });
    const detail = await getMeetingNote(prisma, note.id);
    expect(detail).toMatchObject({ title: "t", body: "b", version: 3, imageIds: [image.id], createdByName: DELETED_ADMIN_LABEL });
    expect(await getMeetingNote(prisma, "nope")).toBeNull();

    const bytes = await getMeetingNoteImage(prisma, image.id);
    expect(bytes?.type).toBe("image/png");
    expect(Buffer.from(bytes!.bytes)).toEqual(Buffer.from([1, 2]));
    expect(await getMeetingNoteImage(prisma, "nope")).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/meeting-notes.test.ts lib/queries/meeting-notes.test.ts`
Expected: FAIL — cannot resolve `./meeting-notes`.

- [ ] **Step 4: Implement the queries**

`apps/dashboard/lib/queries/meeting-notes.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";

export const MEETING_NOTES_PAGE_SIZE = 20;
// Author ids are not FKs: a deleted admin's notes stay and show this instead.
export const DELETED_ADMIN_LABEL = "삭제된 관리자";

export function parseMeetingNotesPage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export async function adminNames(
  prisma: Pick<PrismaClient, "admin">,
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const admins = await prisma.admin.findMany({ where: { id: { in: wanted } }, select: { id: true, username: true } });
  return new Map(admins.map((a) => [a.id, a.username]));
}

export function adminLabel(names: Map<string, string>, id: string | null): string {
  return (id && names.get(id)) || DELETED_ADMIN_LABEL;
}

export interface MeetingNoteListRow {
  id: string;
  title: string;
  meetingDate: Date;
  createdAt: Date;
  createdByName: string;
  updatedAt: Date;
  updatedByName: string;
  // False until the first save after creation — the list shows "-" for 최종 수정.
  edited: boolean;
}

export interface MeetingNoteList {
  rows: MeetingNoteListRow[];
  page: number;
  pageCount: number;
  total: number;
}

// Never reads body or images: a list of notes would drag every body through the query.
export async function listMeetingNotes(prisma: PrismaClient, requestedPage: number): Promise<MeetingNoteList> {
  const total = await prisma.meetingNote.count();
  const pageCount = Math.max(1, Math.ceil(total / MEETING_NOTES_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const notes = await prisma.meetingNote.findMany({
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * MEETING_NOTES_PAGE_SIZE,
    take: MEETING_NOTES_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      meetingDate: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      createdById: true,
      updatedById: true,
    },
  });
  const names = await adminNames(prisma, notes.flatMap((n) => [n.createdById, n.updatedById]));
  return {
    rows: notes.map((n) => ({
      id: n.id,
      title: n.title,
      meetingDate: n.meetingDate,
      createdAt: n.createdAt,
      createdByName: adminLabel(names, n.createdById),
      updatedAt: n.updatedAt,
      updatedByName: adminLabel(names, n.updatedById),
      edited: n.version > 0,
    })),
    page,
    pageCount,
    total,
  };
}

export interface MeetingNoteDetail {
  id: string;
  title: string;
  meetingDate: Date;
  body: string;
  createdAt: Date;
  createdByName: string;
  updatedAt: Date;
  updatedByName: string;
  version: number;
  edited: boolean;
  imageIds: string[];
}

export async function getMeetingNote(prisma: PrismaClient, id: string): Promise<MeetingNoteDetail | null> {
  const note = await prisma.meetingNote.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      meetingDate: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      createdById: true,
      updatedById: true,
      images: { select: { id: true } },
    },
  });
  if (!note) return null;
  const names = await adminNames(prisma, [note.createdById, note.updatedById]);
  return {
    id: note.id,
    title: note.title,
    meetingDate: note.meetingDate,
    body: note.body,
    createdAt: note.createdAt,
    createdByName: adminLabel(names, note.createdById),
    updatedAt: note.updatedAt,
    updatedByName: adminLabel(names, note.updatedById),
    version: note.version,
    edited: note.version > 0,
    imageIds: note.images.map((i) => i.id),
  };
}

export async function getMeetingNoteImage(
  prisma: PrismaClient,
  id: string,
): Promise<{ bytes: Buffer; type: string } | null> {
  const image = await prisma.meetingNoteImage.findUnique({ where: { id }, select: { bytes: true, type: true } });
  return image ? { bytes: Buffer.from(image.bytes), type: image.type } : null;
}
```

- [ ] **Step 5: Implement the mutations**

`apps/dashboard/lib/mutations/meeting-notes.ts`:

```ts
import { extractMeetingNoteImageIds, formatEventDateTime, parseMeetingDateInput } from "@lolpamin/core";
import type { Prisma, PrismaClient } from "@lolpamin/db";
import { adminLabel, adminNames } from "@/lib/queries/meeting-notes";

export const MEETING_NOTE_TITLE_MAX = 100;
export const MEETING_NOTE_BODY_MAX = 50_000;
export const MEETING_NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MEETING_NOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const UNATTACHED_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;

export class MeetingNoteValidationError extends Error {}

// The message is shown to the operator as is; their typed text stays in the editor.
export class MeetingNoteConflictError extends Error {
  constructor(updatedAt: Date, updatedByName: string) {
    super(
      `다른 운영진(${updatedByName})이 ${formatEventDateTime(updatedAt)}에 먼저 수정했습니다. ` +
        "내 내용은 화면에 남아 있으니 복사해 두고 새로 고침한 뒤 다시 반영해 주세요.",
    );
  }
}

export interface MeetingNoteInput {
  title: string;
  meetingDate: string;
  body: string;
}

export interface MeetingNoteImageUpload {
  bytes: Buffer;
  type: string;
}

const NOTE_NOT_FOUND = "회의록을 찾을 수 없습니다.";

function cleanInput(input: MeetingNoteInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new MeetingNoteValidationError("제목을 입력해 주세요.");
  if (title.length > MEETING_NOTE_TITLE_MAX) {
    throw new MeetingNoteValidationError(`제목은 ${MEETING_NOTE_TITLE_MAX}자를 넘을 수 없습니다.`);
  }
  if (body.length > MEETING_NOTE_BODY_MAX) {
    throw new MeetingNoteValidationError(`본문은 ${MEETING_NOTE_BODY_MAX.toLocaleString("ko-KR")}자를 넘을 수 없습니다.`);
  }
  const meetingDate = parseMeetingDateInput(input.meetingDate);
  if (!meetingDate) throw new MeetingNoteValidationError("회의 날짜가 올바르지 않습니다.");
  return { title, body, meetingDate };
}

// Only images nobody owns yet: an id copied from another note's body must not move that image.
async function attachReferencedImages(tx: Prisma.TransactionClient, noteId: string, imageIds: string[]) {
  if (imageIds.length === 0) return;
  await tx.meetingNoteImage.updateMany({ where: { id: { in: imageIds }, noteId: null }, data: { noteId } });
}

export async function createMeetingNote(
  prisma: PrismaClient,
  input: MeetingNoteInput,
  adminId: string | null,
): Promise<{ id: string }> {
  const data = cleanInput(input);
  return prisma.$transaction(async (tx) => {
    const note = await tx.meetingNote.create({
      data: { ...data, createdById: adminId, updatedById: adminId },
      select: { id: true },
    });
    await attachReferencedImages(tx, note.id, extractMeetingNoteImageIds(data.body));
    return note;
  });
}

// expectedVersion is the version the editor was opened at. Anything else means someone saved
// in between; the save is refused rather than silently overwriting their text.
export async function updateMeetingNote(
  prisma: PrismaClient,
  id: string,
  input: MeetingNoteInput,
  expectedVersion: number,
  adminId: string | null,
): Promise<void> {
  const data = cleanInput(input);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new MeetingNoteValidationError("저장 정보가 올바르지 않습니다. 새로 고침한 뒤 다시 시도해 주세요.");
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.meetingNote.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, updatedById: adminId, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await tx.meetingNote.findUnique({ where: { id }, select: { updatedAt: true, updatedById: true } });
      if (!current) throw new MeetingNoteValidationError(NOTE_NOT_FOUND);
      const names = await adminNames(tx, [current.updatedById]);
      throw new MeetingNoteConflictError(current.updatedAt, adminLabel(names, current.updatedById));
    }

    const imageIds = extractMeetingNoteImageIds(data.body);
    await attachReferencedImages(tx, id, imageIds);
    // An image the body no longer mentions is gone from the note for good.
    await tx.meetingNoteImage.deleteMany({ where: { noteId: id, id: { notIn: imageIds } } });
  });
}

// Images go with it (onDelete: Cascade). Deleting twice is harmless.
export async function deleteMeetingNote(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.meetingNote.deleteMany({ where: { id } });
}

// Uploaded before the note is saved, so it starts unowned; the save attaches it. Each upload
// also sweeps unowned images older than the TTL — the leftovers of abandoned drafts.
export async function addMeetingNoteImage(
  prisma: PrismaClient,
  upload: MeetingNoteImageUpload,
  adminId: string | null,
  now: Date = new Date(),
): Promise<{ id: string }> {
  if (!ALLOWED_MEETING_NOTE_IMAGE_TYPES.includes(upload.type)) {
    throw new MeetingNoteValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > MEETING_NOTE_IMAGE_MAX_BYTES) {
    throw new MeetingNoteValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.meetingNoteImage.deleteMany({
      where: { noteId: null, createdAt: { lt: new Date(now.getTime() - UNATTACHED_IMAGE_TTL_MS) } },
    });
    return tx.meetingNoteImage.create({
      data: { bytes: upload.bytes, type: upload.type, createdById: adminId },
      select: { id: true },
    });
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (cwd `apps/dashboard`): `npx vitest run lib/mutations/meeting-notes.test.ts lib/queries/meeting-notes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/queries/meeting-notes.ts apps/dashboard/lib/queries/meeting-notes.test.ts apps/dashboard/lib/mutations/meeting-notes.ts apps/dashboard/lib/mutations/meeting-notes.test.ts
git commit -m "feat(meeting-notes): queries and mutations with version-checked saves"
```

---

### Task 4: Server actions and image route

**Files:**
- Create: `apps/dashboard/app/meeting-notes/actions.ts`
- Create: `apps/dashboard/app/api/meeting-notes/images/[id]/route.ts`

**Interfaces:**
- Consumes: Task 3 mutations/queries, `requireAdmin`, `getCurrentAdmin`.
- Produces:
  - `createMeetingNoteAction(formData: FormData): Promise<{ error: string | null; id?: string }>` — fields `title`, `meetingDate`, `body`
  - `updateMeetingNoteAction(id: string, formData: FormData): Promise<{ error: string | null }>` — plus field `version`
  - `deleteMeetingNoteAction(id: string): Promise<{ error: string | null }>`
  - `addMeetingNoteImageAction(formData: FormData): Promise<{ error: string | null; id?: string }>` — field `file`
  - `GET /api/meeting-notes/images/[id]`

- [ ] **Step 1: Write the actions**

`apps/dashboard/app/meeting-notes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import {
  addMeetingNoteImage,
  createMeetingNote,
  deleteMeetingNote,
  MeetingNoteConflictError,
  MeetingNoteValidationError,
  updateMeetingNote,
} from "@/lib/mutations/meeting-notes";

interface MeetingNoteActionResult {
  error: string | null;
}

// Validation and conflict messages are written for the operator; anything else (a Prisma
// error in English) is replaced by a short Korean fallback.
function toMessage(error: unknown, fallback: string): string {
  return error instanceof MeetingNoteValidationError || error instanceof MeetingNoteConflictError
    ? error.message
    : fallback;
}

function revalidateNote(id: string) {
  revalidatePath("/meeting-notes");
  revalidatePath(`/meeting-notes/${id}`);
  revalidatePath(`/meeting-notes/${id}/edit`);
}

function readInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    meetingDate: String(formData.get("meetingDate") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
}

// Returns the new id instead of calling redirect(): a redirecting action resolves the
// client's promise with undefined, which the editor would then read as a result.
export async function createMeetingNoteAction(
  formData: FormData,
): Promise<MeetingNoteActionResult & { id?: string }> {
  const acting = await requireAdmin();
  let id: string;
  try {
    id = (await createMeetingNote(prisma, readInput(formData), acting.id)).id;
  } catch (error) {
    return { error: toMessage(error, "회의록을 저장하지 못했습니다.") };
  }
  revalidatePath("/meeting-notes");
  return { error: null, id };
}

export async function updateMeetingNoteAction(id: string, formData: FormData): Promise<MeetingNoteActionResult> {
  const acting = await requireAdmin();
  // Number("") is 0, which would pass as a real version; an empty field must fail validation.
  const rawVersion = String(formData.get("version") ?? "");
  const version = rawVersion === "" ? Number.NaN : Number(rawVersion);
  try {
    await updateMeetingNote(prisma, id, readInput(formData), version, acting.id);
  } catch (error) {
    return { error: toMessage(error, "회의록을 저장하지 못했습니다.") };
  }
  revalidateNote(id);
  return { error: null };
}

export async function deleteMeetingNoteAction(id: string): Promise<MeetingNoteActionResult> {
  await requireAdmin();
  try {
    await deleteMeetingNote(prisma, id);
  } catch (error) {
    return { error: toMessage(error, "회의록을 삭제하지 못했습니다.") };
  }
  revalidateNote(id);
  return { error: null };
}

// One file per call: each stays under the 20mb server-action body limit.
export async function addMeetingNoteImageAction(
  formData: FormData,
): Promise<MeetingNoteActionResult & { id?: string }> {
  const acting = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라 주세요." };
  try {
    const { id } = await addMeetingNoteImage(
      prisma,
      { bytes: Buffer.from(await file.arrayBuffer()), type: file.type },
      acting.id,
    );
    return { error: null, id };
  } catch (error) {
    return { error: toMessage(error, "이미지를 올리지 못했습니다.") };
  }
}
```

- [ ] **Step 2: Write the image route**

`apps/dashboard/app/api/meeting-notes/images/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getMeetingNoteImage } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

// Meeting notes are admin-only to read. Never cached: the response is per-session.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // 404 rather than 403 to a visitor: a 403 would confirm the image exists.
  if (!(await getCurrentAdmin())) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const image = await getMeetingNoteImage(prisma, params.id);
  if (!image) return new NextResponse(null, { status: 404, headers: NO_STORE });

  // Buffer is a valid BodyInit at runtime; only this lib config's DOM types disagree.
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { ...NO_STORE, "Content-Type": image.type, "X-Content-Type-Options": "nosniff" },
  });
}
```

- [ ] **Step 3: Type-check**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/meeting-notes/actions.ts "apps/dashboard/app/api/meeting-notes/images/[id]/route.ts"
git commit -m "feat(meeting-notes): server actions and admin-only image route"
```

---

### Task 5: Body renderer and read pages (list, view, delete, nav)

**Files:**
- Create: `apps/dashboard/components/meeting-notes/MeetingNoteBody.tsx`
- Create: `apps/dashboard/components/meeting-notes/MeetingNoteDeleteButton.tsx`
- Create: `apps/dashboard/app/meeting-notes/page.tsx`
- Create: `apps/dashboard/app/meeting-notes/[id]/page.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx` (activeNav union, desktop-only comment, ops group item)

**Interfaces:**
- Consumes: Task 1 `parseMeetingNoteBody`, `formatMeetingDate`; `formatEventDate`, `formatEventDateTime` (core, Seoul); Task 3 queries; Task 4 `deleteMeetingNoteAction`.
- Produces:
  - `meetingNoteImageSrc(id: string): string`
  - `<MeetingNoteBody body: string imageIds: string[] />` (client-safe: no directive, no server imports)
  - `<MeetingNoteDeleteButton noteId: string />`
  - `activeNav="meeting-notes"`

- [ ] **Step 1: Renderer**

`apps/dashboard/components/meeting-notes/MeetingNoteBody.tsx`:

```tsx
import { Fragment } from "react";
import { parseMeetingNoteBody, type MeetingNoteSpan } from "@lolpamin/core";

export function meetingNoteImageSrc(id: string): string {
  return `/api/meeting-notes/images/${id}`;
}

function Spans({ spans }: { spans: MeetingNoteSpan[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.bold ? (
          <strong key={i} className="font-bold text-fg">
            {span.text}
          </strong>
        ) : (
          <Fragment key={i}>{span.text}</Fragment>
        ),
      )}
    </>
  );
}

const HEADING_CLASS = {
  1: "text-[19px] font-extrabold",
  2: "text-[16.5px] font-extrabold",
  3: "text-[14.5px] font-bold",
} as const;

// Used by the view page (server) and the editor's preview (client). Text only ever reaches
// the DOM as React text nodes. imageIds is the set this note may show; an id outside it
// (a typo, another note's image) renders as an empty box rather than fetching it.
export function MeetingNoteBody({ body, imageIds }: { body: string; imageIds: string[] }) {
  const blocks = parseMeetingNoteBody(body);
  if (blocks.length === 0) return <p className="m-0 text-[13.5px] text-faint">내용이 없습니다.</p>;
  const allowed = new Set(imageIds);

  return (
    <div className="flex flex-col gap-3 break-words text-[14.5px] leading-relaxed text-fg-2">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const Tag = (`h${block.level + 1}`) as "h2" | "h3" | "h4";
            return (
              <Tag key={i} className={`m-0 mt-1 tracking-tight text-fg ${HEADING_CLASS[block.level]}`}>
                <Spans spans={block.spans} />
              </Tag>
            );
          }
          case "bullets":
            return (
              <ul key={i} className="m-0 flex list-disc flex-col gap-0.5 pl-5">
                {block.items.map((spans, j) => (
                  <li key={j}>
                    <Spans spans={spans} />
                  </li>
                ))}
              </ul>
            );
          case "numbers":
            return (
              <ol key={i} className="m-0 flex list-decimal flex-col gap-0.5 pl-5">
                {block.items.map((spans, j) => (
                  <li key={j}>
                    <Spans spans={spans} />
                  </li>
                ))}
              </ol>
            );
          case "checklist":
            return (
              <ul key={i} className="m-0 flex list-none flex-col gap-1 p-0">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <input type="checkbox" checked={item.checked} disabled readOnly className="mt-[5px] accent-accent" />
                    <span className={item.checked ? "text-faint line-through" : undefined}>
                      <Spans spans={item.spans} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "image":
            return allowed.has(block.id) ? (
              <img
                key={i}
                src={meetingNoteImageSrc(block.id)}
                alt=""
                className="max-w-full self-start rounded-lg border border-ink/[.06]"
              />
            ) : (
              <div
                key={i}
                className="flex h-24 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12.5px] text-faint"
              >
                이미지 없음
              </div>
            );
          case "paragraph":
            return (
              <p key={i} className="m-0">
                {block.lines.map((spans, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Spans spans={spans} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
```

- [ ] **Step 2: Delete button**

`apps/dashboard/components/meeting-notes/MeetingNoteDeleteButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeetingNoteAction } from "@/app/meeting-notes/actions";

// Two steps: the first click arms the button, the second deletes. Not undoable.
export function MeetingNoteDeleteButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteMeetingNoteAction(noteId);
      if (result.error) {
        setError(result.error);
        setArmed(false);
        return;
      }
      router.push("/meeting-notes");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {armed && !isPending && (
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
        >
          취소
        </button>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12.5px] font-bold text-danger-soft hover:bg-danger/10 disabled:opacity-50"
      >
        {isPending ? "삭제 중…" : armed ? "정말 삭제 (되돌릴 수 없음)" : "삭제"}
      </button>
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: List page**

`apps/dashboard/app/meeting-notes/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatEventDate, formatEventDateTime, formatMeetingDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { listMeetingNotes, parseMeetingNotesPage } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

function pageHref(page: number): string {
  return page > 1 ? `/meeting-notes?page=${page}` : "/meeting-notes";
}

export default async function MeetingNotesPage({ searchParams }: { searchParams: { page?: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/meeting-notes"));
  const list = await listMeetingNotes(prisma, parseMeetingNotesPage(searchParams.page));

  const pagerLink = "rounded-md border border-ink/[.09] px-2.5 py-1 text-[12.5px] text-faint hover:text-fg-2";
  const pagerOff = "rounded-md border border-ink/[.05] px-2.5 py-1 text-[12.5px] text-ghost-2";

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록" pageDesc="운영진 전용 · 관리자만 볼 수 있습니다" desktopOnly>
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-faint">
            총 {list.total}건{list.pageCount > 1 && ` · ${list.page}/${list.pageCount}쪽`}
          </div>
          <Link
            href="/meeting-notes/new"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
          >
            새 회의록
          </Link>
        </div>

        {list.rows.length === 0 ? (
          <div className="rounded-xl border border-ink/[.06] bg-surface px-5 py-10 text-center text-[13.5px] text-faint">
            아직 회의록이 없습니다. 「새 회의록」으로 첫 글을 남겨 보세요.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-ink/[.06] text-left text-[12px] font-bold text-faint">
                  <th className="w-[110px] px-4 py-2.5">회의일</th>
                  <th className="px-4 py-2.5">제목</th>
                  <th className="w-[130px] px-4 py-2.5">작성자</th>
                  <th className="w-[110px] px-4 py-2.5">작성일</th>
                  <th className="w-[200px] px-4 py-2.5">최종 수정</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink/[.04] last:border-b-0 hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-fg-2">{formatMeetingDate(row.meetingDate)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/meeting-notes/${row.id}`} className="font-semibold text-fg hover:text-accent">
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-fg-2">{row.createdByName}</td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-faint">{formatEventDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-faint">
                      {row.edited ? `${row.updatedByName} · ${formatEventDateTime(row.updatedAt)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.pageCount > 1 && (
          <nav className="flex items-center justify-center gap-1.5" aria-label="쪽">
            {list.page > 1 ? (
              <Link href={pageHref(list.page - 1)} className={pagerLink}>
                ‹ 이전
              </Link>
            ) : (
              <span className={pagerOff}>‹ 이전</span>
            )}
            <span className="px-2 font-mono text-[12.5px] text-fg-2">
              {list.page} / {list.pageCount}
            </span>
            {list.page < list.pageCount ? (
              <Link href={pageHref(list.page + 1)} className={pagerLink}>
                다음 ›
              </Link>
            ) : (
              <span className={pagerOff}>다음 ›</span>
            )}
          </nav>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: View page**

`apps/dashboard/app/meeting-notes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatEventDate, formatEventDateTime, formatMeetingDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteBody } from "@/components/meeting-notes/MeetingNoteBody";
import { MeetingNoteDeleteButton } from "@/components/meeting-notes/MeetingNoteDeleteButton";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { getMeetingNote } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

export default async function MeetingNotePage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor(`/meeting-notes/${params.id}`));
  const note = await getMeetingNote(prisma, params.id);
  if (!note) notFound();

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록" pageDesc={note.title} desktopOnly>
      <article className="flex max-w-4xl flex-col gap-4 px-7 pb-10 pt-6">
        <Link href="/meeting-notes" className="text-[13px] text-faint hover:text-fg-2">
          ← 회의록
        </Link>
        <header className="flex items-start justify-between gap-4 border-b border-ink/[.06] pb-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-extrabold tracking-tight text-fg">{note.title}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-faint">
              <span>회의일 {formatMeetingDate(note.meetingDate)}</span>
              <span>
                작성 {note.createdByName} · {formatEventDate(note.createdAt)}
              </span>
              {note.edited && (
                <span>
                  수정 {note.updatedByName} · {formatEventDateTime(note.updatedAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`/meeting-notes/${note.id}/edit`}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-accent-hover"
            >
              수정
            </Link>
            <MeetingNoteDeleteButton noteId={note.id} />
          </div>
        </header>
        <MeetingNoteBody body={note.body} imageIds={note.imageIds} />
      </article>
    </AppShell>
  );
}
```

- [ ] **Step 5: Nav and activeNav**

In `apps/dashboard/components/AppShell.tsx`:

1. Add `| "meeting-notes"` to the `activeNav` union (after `| "member-admin"`).
2. Update the desktop-only comment to list 회의록: `// 연결, 회원 관리, 회의록, 관리자, 뽑기 두 개).`
3. In the `ops` group, right after the `member-admin` item:

```ts
        { key: "meeting-notes", href: "/meeting-notes", label: "회의록", icon: "file-text" },
```

- [ ] **Step 6: Type-check and run the dev server**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .`
Expected: no errors.

Run `npm run dev --workspace=dashboard`, log in, open `/meeting-notes`: the empty-state notice shows, 회의록 sits under 회원 관리 in 운영 관리. Log out and open `/meeting-notes`: redirected to `/login?next=%2Fmeeting-notes`.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/meeting-notes apps/dashboard/app/meeting-notes/page.tsx "apps/dashboard/app/meeting-notes/[id]/page.tsx" apps/dashboard/components/AppShell.tsx
git commit -m "feat(meeting-notes): list and view pages, body renderer, nav entry"
```

---

### Task 6: Editor and write pages

**Files:**
- Create: `apps/dashboard/components/meeting-notes/MeetingNoteEditor.tsx`
- Create: `apps/dashboard/app/meeting-notes/new/page.tsx`
- Create: `apps/dashboard/app/meeting-notes/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 4 actions; Task 5 `MeetingNoteBody`; Task 1 `seoulTodayInput`, `toMeetingDateInput`; Task 3 `getMeetingNote`.
- Produces: `<MeetingNoteEditor noteId?: string version?: number initialTitle initialMeetingDate initialBody initialImageIds />`

- [ ] **Step 1: Editor**

`apps/dashboard/components/meeting-notes/MeetingNoteEditor.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMeetingNoteImageAction,
  createMeetingNoteAction,
  updateMeetingNoteAction,
} from "@/app/meeting-notes/actions";
import { MeetingNoteBody } from "./MeetingNoteBody";

const TITLE_MAX = 100;
const BODY_MAX = 50_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Replaces (or with null removes) the first line equal to `line`. Placeholders are unique,
// so the line the upload inserted is found wherever the operator's typing has pushed it.
function replaceLine(body: string, line: string, next: string | null): string {
  const lines = body.split("\n");
  const index = lines.indexOf(line);
  if (index < 0) return body;
  if (next === null) lines.splice(index, 1);
  else lines[index] = next;
  return lines.join("\n");
}

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1 text-[12.5px] font-bold ${active ? "bg-accent/[.15] text-accent-soft" : "text-faint hover:text-fg-2"}`;

// New note when noteId is absent; otherwise an edit opened at `version`.
export function MeetingNoteEditor({
  noteId,
  version,
  initialTitle,
  initialMeetingDate,
  initialBody,
  initialImageIds,
}: {
  noteId?: string;
  version?: number;
  initialTitle: string;
  initialMeetingDate: string;
  initialBody: string;
  initialImageIds: string[];
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // crypto.randomUUID needs a secure context and the site is served over plain HTTP.
  const placeholderSeq = useRef(0);
  const [title, setTitle] = useState(initialTitle);
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate);
  const [body, setBody] = useState(initialBody);
  const [imageIds, setImageIds] = useState(initialImageIds);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = title !== initialTitle || meetingDate !== initialMeetingDate || body !== initialBody;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Puts `text` on its own line(s) at the cursor (or over the selection).
  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    setBody((current) => {
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const lead = before === "" || before.endsWith("\n") ? "" : "\n";
      const trail = after.startsWith("\n") ? "" : "\n";
      return `${before}${lead}${text}${trail}${after}`;
    });
  }

  async function uploadOne(file: File, placeholder: string) {
    const formData = new FormData();
    formData.set("file", file);
    try {
      const result = await addMeetingNoteImageAction(formData);
      if (result.id) {
        const id = result.id;
        setImageIds((ids) => [...ids, id]);
        setBody((current) => replaceLine(current, placeholder, `![](${id})`));
      } else {
        setError(result.error ?? "이미지를 올리지 못했습니다.");
        setBody((current) => replaceLine(current, placeholder, null));
      }
    } catch {
      setError("이미지를 올리지 못했습니다.");
      setBody((current) => replaceLine(current, placeholder, null));
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function uploadFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setError(null);
    const accepted: File[] = [];
    for (const file of images) {
      if (!IMAGE_TYPES.includes(file.type)) setError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
      else if (file.size > IMAGE_MAX_BYTES) setError("이미지 용량은 5MB를 넘을 수 없습니다.");
      else accepted.push(file);
    }
    if (accepted.length === 0) return;
    const placeholders = accepted.map(() => `![업로드 중…](pending-${Date.now()}-${++placeholderSeq.current})`);
    insertAtCursor(placeholders.join("\n"));
    setTab("edit");
    setUploading((n) => n + accepted.length);
    accepted.forEach((file, i) => void uploadOne(file, placeholders[i]));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (uploading > 0) return;
    const formData = new FormData();
    formData.set("title", title);
    formData.set("meetingDate", meetingDate);
    formData.set("body", body);
    setError(null);
    startTransition(async () => {
      if (noteId) {
        formData.set("version", String(version ?? ""));
        const result = await updateMeetingNoteAction(noteId, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.push(`/meeting-notes/${noteId}`);
        router.refresh();
        return;
      }
      const result = await createMeetingNoteAction(formData);
      if (result.error || !result.id) {
        setError(result.error ?? "회의록을 저장하지 못했습니다.");
        return;
      }
      router.push(`/meeting-notes/${result.id}`);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-bold text-fg-2">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            required
            className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
          />
        </label>
        <label className="flex w-[180px] flex-col gap-1.5">
          <span className="text-[13px] font-bold text-fg-2">회의일</span>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            required
            className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button type="button" className={tabClass(tab === "edit")} onClick={() => setTab("edit")}>
            편집
          </button>
          <button type="button" className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
        <div className="flex items-center gap-2">
          {uploading > 0 && <span className="text-[12px] text-faint">이미지 {uploading}장 올리는 중…</span>}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
          >
            이미지 추가
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            hidden
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {tab === "edit" ? (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.some((file) => file.type.startsWith("image/"))) {
              e.preventDefault();
              uploadFiles(files);
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
              e.preventDefault();
              uploadFiles(files);
            }
          }}
          maxLength={BODY_MAX}
          rows={22}
          placeholder={"# 안건\n- 논의 내용\n1. 결정 사항\n- [ ] 할 일\n**굵게**\n\n이미지는 붙여넣기(Ctrl+V)나 끌어다 놓기로 넣을 수 있습니다."}
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 font-mono text-[13.5px] leading-relaxed text-fg"
        />
      ) : (
        <div className="min-h-[300px] rounded-lg border border-ink/[.06] bg-inset px-4 py-3">
          <MeetingNoteBody body={body} imageIds={imageIds} />
        </div>
      )}

      <div className="text-[11.5px] text-faint">
        서식: <code># 제목</code> · <code>- 목록</code> · <code>1. 번호</code> · <code>- [ ] 할 일</code> ·{" "}
        <code>**굵게**</code> · 이미지 붙여넣기/끌어다 놓기
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || uploading > 0}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
        {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: New page**

`apps/dashboard/app/meeting-notes/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { seoulTodayInput } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteEditor } from "@/components/meeting-notes/MeetingNoteEditor";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";

export default async function NewMeetingNotePage() {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/meeting-notes/new"));

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록 작성" pageDesc="새 회의록" desktopOnly>
      <div className="flex max-w-4xl flex-col gap-3 px-7 pb-10 pt-6">
        <MeetingNoteEditor
          initialTitle=""
          initialMeetingDate={seoulTodayInput(new Date())}
          initialBody=""
          initialImageIds={[]}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Edit page**

`apps/dashboard/app/meeting-notes/[id]/edit/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toMeetingDateInput } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteEditor } from "@/components/meeting-notes/MeetingNoteEditor";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { getMeetingNote } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

export default async function EditMeetingNotePage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor(`/meeting-notes/${params.id}/edit`));
  const note = await getMeetingNote(prisma, params.id);
  if (!note) notFound();

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록 수정" pageDesc={note.title} desktopOnly>
      <div className="flex max-w-4xl flex-col gap-3 px-7 pb-10 pt-6">
        <Link href={`/meeting-notes/${note.id}`} className="text-[13px] text-faint hover:text-fg-2">
          ← 보기로 돌아가기
        </Link>
        <MeetingNoteEditor
          noteId={note.id}
          version={note.version}
          initialTitle={note.title}
          initialMeetingDate={toMeetingDateInput(note.meetingDate)}
          initialBody={note.body}
          initialImageIds={note.imageIds}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Type-check, full test run**

Run (cwd `apps/dashboard`): `npx tsc --noEmit -p .` — no errors.
Run (repo root): `npm test` — all workspaces PASS.

- [ ] **Step 5: Manual check in the browser**

`npm run dev --workspace=dashboard`, logged in as admin:
1. 새 회의록 → title, date defaults to today → type `# 안건`, `- a`, `1. b`, `- [ ] c`, `**굵게**` → 미리보기 renders each.
2. Paste a screenshot (Ctrl+V) → `![업로드 중…](pending-…)` turns into `![](id)`, preview shows the image. Save → view page shows it.
3. Open the edit page in two tabs; save in tab A, then save in tab B → B shows the 「다른 운영진(…)이 …에 먼저 수정했습니다」 notice and keeps its text.
4. Remove an image line, save → `/api/meeting-notes/images/<old id>` returns 404.
5. Log out → `/api/meeting-notes/images/<id>` returns 404; `/meeting-notes/<id>` redirects to login.
6. 삭제 twice-click on the view page → back to the list, note gone.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/meeting-notes/MeetingNoteEditor.tsx apps/dashboard/app/meeting-notes/new "apps/dashboard/app/meeting-notes/[id]/edit"
git commit -m "feat(meeting-notes): editor with inline image paste and write pages"
```

---

### Task 7: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a domain paragraph** after the `/events` paragraph (the one ending "a poster is shown whole, never cropped."):

```markdown
`/meeting-notes` (회의록, under 운영 관리 right after 회원 관리) is the one screen where
**reading** is admin-only too — notes can carry member evaluations, so the pages redirect to
login and `/api/meeting-notes/images/[id]` answers 404 (never 403, never cached) to anyone
without a session. There is no live co-editing: the editor sends the `MeetingNote.version`
it was opened at and `updateMeetingNote` refuses the save if it moved
(`MeetingNoteConflictError`, naming who saved first; the typed text stays on screen).
`version`, not `updatedAt`, because two saves can land in one millisecond. The body is a
markdown subset rendered by our own parser (`parseMeetingNoteBody` in `packages/core`:
`#`–`###`, `-`, `1.`, `- [ ]`/`- [x]`, whole-line `![](imageId)`, `**bold**`) — no HTML path
at all. Images upload one per server action into `MeetingNoteImage` with `noteId = null`
before the note exists; a save attaches the unowned ones its body references (never one
owned by another note) and deletes the note's images the body dropped. Unowned images older
than 24h are swept on the next upload. `meetingDate` (회의일) is a calendar day stored as UTC
midnight, separate from `createdAt`.
```

- [ ] **Step 2: Update the Mobile section's operator list** — change "the eleven operator screens (`matches`, … `events/new`, `events/[id]/edit`)" to "the fifteen operator screens (… `events/new`, `events/[id]/edit`, `meeting-notes`, `meeting-notes/new`, `meeting-notes/[id]`, `meeting-notes/[id]/edit`)" (11 existing + 4).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: meeting notes in CLAUDE.md"
```
