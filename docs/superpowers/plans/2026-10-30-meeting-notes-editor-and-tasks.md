# 회의록 편집 화면 개선 + 할 일 추적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의록에 좌우 분할 편집기·편집 보조·임시저장·충돌 해결 흐름을 넣고, 본문의 체크박스 할 일(`@담당자`, `~기한`)을 체크·모아 보는 기능을 만든다.

**Architecture:** 텍스트 규칙(할 일 추출·물려받기·기한, 줄 토글, 체크 자동 반영, 편집 보조의 글 변형)은 전부 `packages/core`의 순수 함수다. 대시보드는 그 위에 서버 액션(체크 토글, 충돌 시 현재 값 반환), 할 일 화면, 편집기 UI를 얹는다. 스키마 변경 없음 — 할 일은 읽을 때 본문에서 계산한다.

**Tech Stack:** Next.js 14 App Router, React 18, Prisma/Postgres, vitest, `react-markdown` 10 + `remark-gfm` + `remark-breaks`, Tailwind 시맨틱 토큰.

**Spec:** `docs/superpowers/specs/2026-10-30-meeting-notes-editor-and-tasks-design.md`

## Global Constraints

- 읽기·쓰기 모두 관리자 전용. 새 페이지는 `getCurrentAdmin()` 없으면 `redirect(loginPathFor(path))`, `export const dynamic = "force-dynamic"`, `AppShell ... desktopOnly`.
- 서버 액션은 `requireAdmin()`으로 시작한다.
- raw HTML 렌더 금지: `react-markdown`에 `rehype-raw` 등을 넣지 않는다.
- 본문 최대 50,000자(`MEETING_NOTE_BODY_MAX`), 스키마 변경 없음.
- 도메인 로직은 `packages/core` 순수 함수 + 단위 테스트, `packages/core/src/index.ts`에서 export. DB 로직은 `apps/dashboard/lib/{queries,mutations}/`, `prisma` 첫 인자, 다중 쓰기는 `prisma.$transaction`.
- DB 테스트 파일은 `DATABASE_URL_TEST` 가드를 맨 위에 유지(`lib/mutations/meeting-notes.test.ts` 모양 그대로).
- 색은 시맨틱 토큰만: 기한 지남 `text-danger-soft`, 3일 이내 `text-orange`. hex 금지.
- UI 문구 한국어, 코드·주석·커밋 메시지 영어.
- 본문 줄 분리는 언제나 `/\r?\n/` (예전 글에 CRLF가 있을 수 있다). 줄 번호는 0부터; `react-markdown`의 `node.position.start.line`은 1부터이므로 `- 1`.
- 작업 브랜치: `feat/meeting-notes-tasks` (이미 존재, 설계 문서 커밋됨). `main`에 직접 커밋하지 않는다.

## Review Focus

1. **한글 IME 조합 중 Enter/Tab** — 조합 중(`event.nativeEvent.isComposing` 또는 `keyCode === 229`)에는 편집 보조가 아무것도 하지 않아야 한다. → Task 7 수동 확인 항목 + 키 처리 함수가 조합 플래그를 받아 `null`을 돌려주는 단위 테스트(Task 3).
2. **Ctrl+Z** — 편집 보조·툴바·미리보기 체크로 바뀐 글이 한 번의 실행 취소로 돌아와야 한다. → Task 7 수동 확인 항목(`execCommand("insertText")` 경로 사용).
3. **같은 텍스트의 할 일이 두 줄** — 토글은 줄 번호로 정확히 그 줄만, 자동 반영은 모호하면 건너뛴다. → Task 1 `toggleMeetingNoteTaskLine` 테스트, Task 2 중복 테스트.
4. **연말 기한** — 회의일 2026-12-20의 `~1/5`는 2027-01-05. → Task 1 테스트.
5. **CRLF 본문** — `\r\n` 본문에서도 줄 번호·토글·추출이 맞고 토글 뒤 줄바꿈 형식이 유지된다. → Task 1 테스트.

---

### Task 1: core — 할 일 추출과 줄 토글

**Files:**
- Create: `packages/core/src/meeting-note-tasks.ts`
- Create: `packages/core/src/meeting-note-tasks.test.ts`
- Modify: `packages/core/src/index.ts` (export 추가)

**Interfaces:**
- Produces:
  ```ts
  export interface MeetingNoteTask {
    line: number;            // 0-based line index in the body
    checked: boolean;
    text: string;            // without checkbox, @assignees and ~due; trimmed; `**` kept
    assignees: string[];     // as written (without "@"), own or inherited, deduped case-insensitively
    due: string | null;      // "YYYY-MM-DD", own or inherited
    parentText: string | null; // display text of the nearest ancestor list item
  }
  export function extractMeetingNoteTasks(body: string, meetingDate: Date): MeetingNoteTask[];
  export function normalizeAssignee(name: string): string; // lower-cased, for grouping
  // Returns the new body, or null when line `line` is not a task whose MeetingNoteTask.text
  // (token-stripped, as extracted with the same body) equals expectedText.
  export function toggleMeetingNoteTaskLine(body: string, line: number, expectedText: string, checked: boolean): string | null;
  ```

- [ ] **Step 1: Write failing tests** in `meeting-note-tasks.test.ts` (`const md = new Date("2026-10-30T00:00:00Z")`):
  - `"reads checked state, assignees and due"`: `"- [ ] @소영 @병준 날짜 후보 ~11/14\n- [x] 끝난 일"` → `[{line:0, checked:false, text:"날짜 후보", assignees:["소영","병준"], due:"2026-11-14", parentText:null}, {line:1, checked:true, text:"끝난 일", assignees:[], due:null, parentText:null}]`.
  - `"accepts * + and numbered bullets, X and indentation"`: `"* [X] a\n+ [ ] b\n1. [ ] c\n   - [ ] d"` → lines 0..3 all tasks, first `checked:true`.
  - `"inherits assignee and due separately from the nearest ancestor that names them"` — spec example:
    `"2. 캠핑 @병준 ~11/14\n   - [ ] 후보 날짜 정리\n   - [ ] @소영 장소 알아보기 ~11/10\n     - [ ] 펜션 전화"` →
    line1 `{assignees:["병준"], due:"2026-11-14", parentText:"캠핑"}`, line2 `{assignees:["소영"], due:"2026-11-10", parentText:"캠핑"}`, line3 `{assignees:["소영"], due:"2026-11-10", parentText:"장소 알아보기"}`.
  - `"own @ replaces inherited assignees, siblings are not ancestors"`: `"- [ ] @a 부모\n  - [ ] @b 자식\n  - [ ] 형제"` → line1 `["b"]`, line2 `["a"]`.
  - `"a heading or an unindented non-list line cuts the ancestor chain; a blank line does not"`: `"- 상위 @a\n\n  - [ ] x\n# 제목\n  - [ ] y\n- 상위2 @b\n문단\n  - [ ] z"` → x `["a"]`, y `[]`, z `[]`.
  - `"skips fenced code and blockquotes"`: `` "```\n- [ ] no\n```\n~~~\n- [ ] no\n~~~\n> - [ ] no\n- [ ] yes" `` → only `text:"yes"`.
  - `"due year rolls over before the meeting date"`: meetingDate `2026-12-20`, `"- [ ] a ~1/5"` → `"2027-01-05"`; `"- [ ] a ~2026/3/1"` → `"2026-03-01"`.
  - `"invalid due stays as text"`: `"- [ ] a ~13/40"` → `{text:"a ~13/40", due:null}`.
  - `"handles CRLF"`: `"- [ ] a\r\n- [ ] b"` → lines 0 and 1, texts `"a"`,`"b"`.
  - `"dedupes assignees case-insensitively, keeping first spelling"`: `"- [ ] @Rayn @rayn x"` → `["Rayn"]`; `normalizeAssignee("Rayn") === "rayn"`.
  - `toggleMeetingNoteTaskLine`:
    - `"- [ ] a\n- [ ] a"`, line 1, `"a"`, true → `"- [ ] a\n- [x] a"`.
    - `"  1. [x] @b c ~11/1"`, line 0, `"c"`, false → `"  1. [ ] @b c ~11/1"`.
    - text mismatch → `null`; non-task line → `null`; line out of range → `null`.
    - CRLF: `"- [ ] a\r\n- [ ] b"`, line 1, `"b"`, true → `"- [ ] a\r\n- [x] b"`.
- [ ] **Step 2: Run** `npx vitest run src/meeting-note-tasks.test.ts` (cwd `packages/core`). Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `meeting-note-tasks.ts`. Line regex for list items: `^(\s*)([-*+]|\d+[.)])\s+(.*)$`; a task when the rest matches `^\[([ xX])\]\s+(.*)$`. Ancestor stack of `{indent, assignees|null, due|null, text}` popped while `indent >= current indent`. Track fences (```` ``` ```` / `~~~` opening/closing at line start after optional indent); skip lines starting with `>` after indent. Assignee token `/(^|\s)@(\S+)/g`; due token `/(^|\s)~(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?=\s|$)/`, validated by UTC round trip; year rule compares `MM-DD` with the meeting date's `MM-DD`. Display text = rest with those tokens removed and spaces collapsed. Toggle replaces only the `[ ]`/`[x]` of that line and re-joins with the original separators (split with a capturing `/(\r?\n)/`).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): extract meeting-note tasks with inherited assignee and due`.

### Task 2: core — 체크 자동 반영

**Files:**
- Create: `packages/core/src/meeting-note-rebase.ts`, `packages/core/src/meeting-note-rebase.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 line/task regex (export an internal `parseTaskLine(line: string): { checked: boolean; text: string } | null` from `meeting-note-tasks.ts` for reuse; it returns the raw rest after the checkbox, not the token-stripped text).
- Produces:
  ```ts
  // null: server differs from base by more than checkbox state → real conflict.
  export function rebaseMeetingNoteToggles(baseBody: string, serverBody: string, myBody: string): { body: string; applied: number } | null;
  ```

- [ ] **Step 1: Failing tests**:
  - identical base/server → `{ body: myBody, applied: 0 }`.
  - base `"- [ ] a\n- [ ] b"`, server `"- [x] a\n- [ ] b"`, mine `"새 줄\n- [ ] a\n- [ ] b\n추가"` → `{ body: "새 줄\n- [x] a\n- [ ] b\n추가", applied: 1 }`.
  - server unchecks: base `"- [x] a"`, server `"- [ ] a"`, mine `"- [x] a 수정"` (I edited the text) → `{ body: "- [x] a 수정", applied: 0 }` (skipped).
  - ambiguous: base/server toggle `a`, mine has two `- [ ] a` lines → skipped, `applied: 0`.
  - mine already matches server state → not counted, body unchanged.
  - server changed text: base `"- [ ] a"`, server `"- [ ] b"` → `null`; different line count → `null`; a non-task line changed → `null`.
- [ ] **Step 2: Run** `npx vitest run src/meeting-note-rebase.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Compare base/server line by line (split `/\r?\n/`, same length required; each pair equal after replacing a task line's `[x]`/`[X]` with `[ ]`). For each line whose checked state differs, find in mine the lines whose `parseTaskLine` text equals base's and whose checked equals base's; exactly one → set it to server's state.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): rebase checkbox toggles onto an edited meeting note`.

### Task 3: core — 편집 보조 글 변형

**Files:**
- Create: `packages/core/src/meeting-note-editing.ts`, `packages/core/src/meeting-note-editing.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces (all pure; `selStart/selEnd` are textarea offsets):
  ```ts
  export interface TextEdit { start: number; end: number; insert: string; selStart: number; selEnd: number }
  // The replacement of [start,end) with insert, and where the selection lands afterwards.
  export function indentEdit(text: string, selStart: number, selEnd: number, outdent: boolean): TextEdit;
  export function enterEdit(text: string, caret: number, composing: boolean): TextEdit | null; // null = let the browser handle Enter
  export type LinePrefix = "heading" | "bullet" | "number" | "task";
  export function togglePrefixEdit(text: string, selStart: number, selEnd: number, prefix: LinePrefix): TextEdit;
  export function toggleBoldEdit(text: string, selStart: number, selEnd: number): TextEdit;
  export function inFencedCode(text: string, caret: number): boolean;
  ```

- [ ] **Step 1: Failing tests** (apply helper in the test: `text.slice(0,e.start)+e.insert+text.slice(e.end)`):
  - indent under `"1. a\nb"` caret on line 1 → `"1. a\n   b"`; under `"- a\nb"` → 2 spaces; under `"10. a\nb"` → 4; previous line not a list → 2; multi-line selection indents every selected line; outdent removes up to that width (or what's there) and never goes below 0.
  - `enterEdit`: `"- a"` caret end → inserts `"\n- "`; `"  3. a"` → `"\n  4. "`; `"- [x] a"` → `"\n- [ ] "`; empty `"- "` at col 0 → removes the bullet (result `""`), caret 0; empty indented `"   - "` → outdents to `"- "`; plain line → `null`; `composing: true` → `null`; inside a fenced block → `null`; caret mid-line on a list item → splits and continues the bullet on the new line.
  - `togglePrefixEdit`: `"a"` + bullet → `"- a"`; `"- a"` + bullet → `"a"`; `"- a"` + task → `"- [ ] a"`; heading adds/removes `"## "`; number over a 3-line selection → `"1. "`,`"2. "`,`"3. "`; indentation is kept.
  - `toggleBoldEdit`: selection `"b"` in `"a b c"` → `"a **b** c"`, selection stays on `b`; selection already wrapped → unwrapped; empty selection → inserts `"****"` with caret in the middle.
  - `inFencedCode("```\nx\n```\ny", 5)` true, at `y` false.
- [ ] **Step 2: Run** `npx vitest run src/meeting-note-editing.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Indent width = length of the previous non-blank list line's marker prefix (`indent + marker + spaces`) minus its own indent; reuse Task 1's list-item regex.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): list-aware editing helpers for the meeting-note editor`.

### Task 4: dashboard — 체크 토글 저장, 충돌 시 현재 값 반환

**Files:**
- Modify: `apps/dashboard/lib/mutations/meeting-notes.ts`
- Modify: `apps/dashboard/lib/mutations/meeting-notes.test.ts`
- Modify: `apps/dashboard/app/meeting-notes/actions.ts`

**Interfaces:**
- Consumes: Task 1 `toggleMeetingNoteTaskLine`.
- Produces:
  ```ts
  export interface MeetingNoteSnapshot { title: string; meetingDate: string /* YYYY-MM-DD */; body: string; version: number; updatedByName: string; updatedAt: Date }
  // MeetingNoteConflictError gains `readonly current: MeetingNoteSnapshot` (message unchanged).
  export class MeetingNoteTaskChangedError extends Error {} // message "회의록이 바뀌었습니다. 새로 고침해 주세요."
  export async function toggleMeetingNoteTask(prisma: PrismaClient, noteId: string, line: number, expectedText: string, checked: boolean, adminId: string | null): Promise<void>;
  // actions.ts
  export async function updateMeetingNoteAction(id: string, formData: FormData): Promise<{ error: string | null; conflict?: MeetingNoteSnapshotDto }>;
  // MeetingNoteSnapshotDto = MeetingNoteSnapshot with updatedAt as ISO string
  export async function toggleMeetingNoteTaskAction(noteId: string, line: number, expectedText: string, checked: boolean): Promise<{ error: string | null }>;
  ```

- [ ] **Step 1: Failing integration tests** in `meeting-notes.test.ts`:
  - `"toggleMeetingNoteTask flips only that line, bumps version and records the admin"`: body `"- [ ] a\n- [ ] a"`, toggle line 1 `"a"` true → body `"- [ ] a\n- [x] a"`, `version` 1, `updatedById` = admin.
  - `"toggleMeetingNoteTask refuses when the line no longer holds that task"` → rejects `MeetingNoteTaskChangedError`, body unchanged.
  - `"toggleMeetingNoteTask on a missing note"` → `MeetingNoteValidationError("회의록을 찾을 수 없습니다.")`.
  - `"conflict error carries the current note"`: update at version 0 after another update → caught error `instanceof MeetingNoteConflictError` and `error.current` equals `{ title, meetingDate: "2026-10-02", body, version: 1, updatedByName: "op" }` (plus `updatedAt`).
- [ ] **Step 2: Run** `npx vitest run lib/mutations/meeting-notes.test.ts` (cwd `apps/dashboard`). Expected: FAIL.
- [ ] **Step 3: Implement.** Toggle: in a transaction read `{body, version}`, compute with `toggleMeetingNoteTaskLine`, `updateMany({ where: { id, version }, data: { body, updatedById, version: { increment: 1 } } })`; `count === 0` → `MeetingNoteTaskChangedError`. Image attachment unaffected (a toggle never changes image references). Conflict: load the snapshot fields in the existing `count === 0` branch. Action: return `conflict` (ISO `updatedAt`) on `MeetingNoteConflictError`; toggle action maps both error classes to their messages, revalidates `/meeting-notes`, `/meeting-notes/tasks`, `/meeting-notes/${id}`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(meeting-notes): save task toggles and return the current note on conflict`.

### Task 5: 체크 가능한 렌더러 + 보기 화면

**Files:**
- Modify: `apps/dashboard/components/meeting-notes/MeetingNoteBody.tsx`
- Create: `apps/dashboard/components/meeting-notes/MeetingNoteViewBody.tsx` (client)
- Modify: `apps/dashboard/app/meeting-notes/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1 `extractMeetingNoteTasks`, Task 4 `toggleMeetingNoteTaskAction`.
- Produces:
  ```ts
  // MeetingNoteBody gains optional props:
  //   onToggleTask?: (task: { line: number; text: string; checked: boolean }) => void
  //   meetingDate?: Date   (needed to know which lines are tasks)
  // Without onToggleTask checkboxes stay disabled (current behaviour).
  // Every block-level element rendered gets data-line={node.position.start.line - 1}.
  export function MeetingNoteViewBody(props: { noteId: string; body: string; meetingDate: string; imageIds: string[] }): JSX.Element;
  ```

- [ ] **Step 1:** In `MeetingNoteBody`, compute `tasks = extractMeetingNoteTasks(body, meetingDate)` keyed by line. The `input` component reads its `li`'s line (pass via the `li` override: render the checkbox inside `li` using `node.position.start.line - 1`); a checkbox is enabled only when `onToggleTask` is set and that line is in `tasks`. Clicking calls `onToggleTask({ line, text: task.text, checked: !task.checked })` — `task.text` is the token-stripped `MeetingNoteTask.text`, which is what `toggleMeetingNoteTaskLine`'s `expectedText` compares against. Add `data-line` to `p, h1–h6, ul, ol, li, blockquote, pre, table, img` wrappers.
- [ ] **Step 2:** `MeetingNoteViewBody` (client): holds `body` state; on toggle, optimistic `toggleMeetingNoteTaskLine` locally, call the action, on error revert and show the message under the body; on success `router.refresh()`.
- [ ] **Step 3:** View page renders `MeetingNoteViewBody` with `toMeetingDateInput(note.meetingDate)`.
- [ ] **Step 4: Verify** `npx tsc --noEmit -p .` (cwd `apps/dashboard`) shows only the two pre-existing `lib/draw/candidates.test.ts` errors. Manual: `npm run dev --workspace=dashboard`, open a note with tasks, tick one, reload → persists; a `> - [ ] x` checkbox is not clickable.
- [ ] **Step 5: Commit** `feat(meeting-notes): tick tasks from the note view`.

### Task 6: 할 일 화면

**Files:**
- Create: `apps/dashboard/lib/queries/meeting-note-tasks.ts`, `apps/dashboard/lib/queries/meeting-note-tasks.test.ts`
- Create: `apps/dashboard/app/meeting-notes/tasks/page.tsx`
- Create: `apps/dashboard/components/meeting-notes/MeetingNotesTabs.tsx`, `apps/dashboard/components/meeting-notes/TaskRowCheckbox.tsx` (client)
- Modify: `apps/dashboard/app/meeting-notes/page.tsx` (tabs on top)

**Interfaces:**
- Consumes: Task 1 `extractMeetingNoteTasks`, `normalizeAssignee`; Task 4 `toggleMeetingNoteTaskAction`; core `seoulTodayInput`.
- Produces:
  ```ts
  export interface MeetingNoteTaskRow extends MeetingNoteTask { noteId: string; noteTitle: string; meetingDate: Date; dueLevel: "overdue" | "soon" | null }
  export interface MeetingNoteTaskGroup { key: string /* normalized, "" for 미지정 */; label: string /* first spelling or "미지정" */; open: number; rows: MeetingNoteTaskRow[] }
  export async function listMeetingNoteTaskGroups(prisma: PrismaClient, opts: { includeDone: boolean; now: Date }): Promise<MeetingNoteTaskGroup[]>;
  ```

- [ ] **Step 1: Failing integration tests** (`DATABASE_URL_TEST` guard, `resetDatabase` in `beforeEach`), `now = 2026-10-30T03:00:00Z` (Seoul 10-30):
  - groups by assignee case-insensitively, a two-assignee task appears in both groups, unassigned group label `"미지정"` is last.
  - group order: more open tasks first.
  - row order inside a group: due ascending first, then no-due by meetingDate desc.
  - `dueLevel`: due `2026-10-29` → `"overdue"`, `2026-11-02` → `"soon"` (≤ 3 days), `2026-11-03` → `null`.
  - `includeDone: false` drops checked tasks (and a group left empty); `true` keeps them.
- [ ] **Step 2: Run** `npx vitest run lib/queries/meeting-note-tasks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the query (one `findMany` selecting `id,title,meetingDate,body`), then the page: `searchParams.done === "1"` → includeDone; tabs component (`회의록` → `/meeting-notes`, `할 일` → `/meeting-notes/tasks`) on both pages; each row: `TaskRowCheckbox` (optimistic, calls the action, `router.refresh()`), faint `parentText ›`, text, due (`M/D`, coloured by `dueLevel`), source link `formatMeetingDate · title` → `/meeting-notes/{id}`; done rows faint + line-through; empty state shows `- [ ] @이름 할 일 ~11/14`. Toggle link 「완료 포함」 flips `?done=1`.
- [ ] **Step 4: Run** tests (PASS) and `npx tsc --noEmit -p .` (only pre-existing errors). Manual: page renders, tick works.
- [ ] **Step 5: Commit** `feat(meeting-notes): task board grouped by assignee`.

### Task 7: 편집기 — 좌우 분할, 편집 보조, 툴바

**Files:**
- Modify: `apps/dashboard/components/meeting-notes/MeetingNoteEditor.tsx`
- Create: `apps/dashboard/components/meeting-notes/EditorToolbar.tsx`
- Modify: `apps/dashboard/app/meeting-notes/[id]/edit/page.tsx`, `apps/dashboard/app/meeting-notes/new/page.tsx` (widen container from `max-w-4xl` so two columns fit; e.g. `max-w-[1400px]`)

**Interfaces:**
- Consumes: Task 3 edits, Task 5 `MeetingNoteBody` `onToggleTask`/`data-line`, Task 1 `toggleMeetingNoteTaskLine`.
- Produces: an internal `applyEdit(edit: TextEdit)` in the editor that focuses the textarea, selects `[start,end)`, runs `document.execCommand("insertText", false, insert)` (fallback: `setBody` + `pendingCaret` when it returns false), then sets the selection to `selStart/selEnd`.

- [ ] **Step 1:** Remove the 편집/미리보기 tabs; lay out `grid grid-cols-2 gap-4`, each column its own scroll (`h-[70vh] overflow-y-auto`). Preview passes `onToggleTask` that rewrites the line locally via `applyEdit` (so Ctrl+Z works) and `meetingDate`.
- [ ] **Step 2:** `onKeyDown` on the textarea: Tab/Shift+Tab → `indentEdit` (always `preventDefault`); Enter (no modifier) → `enterEdit(text, caret, e.nativeEvent.isComposing || e.keyCode === 229)`, apply when non-null; Ctrl/Cmd+B → `toggleBoldEdit`.
- [ ] **Step 3:** `EditorToolbar` buttons 제목, 굵게, 목록, 번호, 할 일, 들여쓰기, 내어쓰기, 이미지 (이미지 = existing file input). Each calls the matching Task 3 function through `applyEdit`. Shorten the 서식 안내 line to shortcuts: `Tab 들여쓰기 · Shift+Tab 내어쓰기 · Ctrl+B 굵게 · Enter 목록 이어 쓰기 · 할 일: - [ ] @이름 내용 ~11/14`.
- [ ] **Step 4:** Scroll follow: on caret move (`onSelect`/`onKeyUp`/`onClick`), compute caret line, find the preview element with the greatest `data-line <= caretLine`, `scrollIntoView({ block: "nearest" })` on the preview column only.
- [ ] **Step 5: Verify** `npx tsc --noEmit -p .`. Manual checklist in the browser: Tab under `1. ` gives 3 spaces and the preview nests; Enter continues `3.` → `4.`; Enter on empty bullet ends the list; 한글 typing then Enter does not duplicate the last syllable; Ctrl+Z after Tab, Enter, toolbar and preview tick each undoes one step; Tab inside a ``` block inserts indentation without list logic.
- [ ] **Step 6: Commit** `feat(meeting-notes): split editor with list-aware keys and toolbar`.

### Task 8: 편집기 — 임시저장과 충돌 흐름

**Files:**
- Create: `apps/dashboard/lib/meeting-notes/draft-storage.ts`, `apps/dashboard/lib/meeting-notes/draft-storage.test.ts`
- Create: `apps/dashboard/components/meeting-notes/ConflictPanel.tsx`
- Modify: `apps/dashboard/components/meeting-notes/MeetingNoteEditor.tsx`
- Modify: `apps/dashboard/app/meeting-notes/[id]/edit/page.tsx` (pass `updatedByName`), `apps/dashboard/components/meeting-notes/MeetingNoteDeleteButton.tsx` (clear keys on delete)

**Interfaces:**
- Consumes: Task 2 `rebaseMeetingNoteToggles`; Task 4 `updateMeetingNoteAction` `conflict`.
- Produces:
  ```ts
  export interface MeetingNoteDraft { title: string; meetingDate: string; body: string; imageIds: string[]; baseVersion: number | null; baseTitle: string | null; baseMeetingDate: string | null; baseBody: string | null; savedAt: string }
  export const draftKey: (noteId?: string) => string;   // "lolpamin.meeting-note.draft.new" | `lolpamin.meeting-note.draft.${id}`
  export const stashKey: (noteId: string) => string;    // `lolpamin.meeting-note.stash.${id}`
  export function readDraft(storage: Storage | null, key: string): MeetingNoteDraft | null; // null on missing/corrupt JSON
  export function writeDraft(storage: Storage | null, key: string, draft: MeetingNoteDraft): void; // swallows quota/security errors
  export function clearDraft(storage: Storage | null, key: string): void;
  ```
- MeetingNoteEditor gains prop `updatedByName?: string` and keeps `base` state `{ version, title, meetingDate, body }` (initialised from props).

- [ ] **Step 1: Failing unit tests** for `draft-storage.ts` (plain object implementing `Storage`): round trip; corrupt JSON → `null`; `null` storage → no throw; `setItem` throwing (quota) → no throw.
- [ ] **Step 2: Run** `npx vitest run lib/meeting-notes/draft-storage.test.ts`. Expected: FAIL → implement → PASS.
- [ ] **Step 3: Autosave.** Debounced 2s write while `dirty`; on mount read the draft; show the banner `저장하지 않은 내용이 있습니다 (M/D HH:mm) — 불러오기 / 버리기` only if its title/meetingDate/body differ from the server's; if `draft.baseVersion !== version` append `· 그 사이 {updatedByName}님이 수정했습니다`. 불러오기 sets fields and `base` from the draft (`baseBody ?? initialBody`). Clear on save success, 버리기, and note delete. Stash banner: if `stashKey(id)` exists show a collapsed 「보관한 내 글」 panel with a read-only textarea and 「보관 삭제」.
- [ ] **Step 4: Conflict flow** in `save()`: on `result.conflict` with an edit — if `conflict.title === base.title && conflict.meetingDate === base.meetingDate`, try `rebaseMeetingNoteToggles(base.body, conflict.body, body)`; non-null → set body, set `base` to the conflict snapshot, resubmit once with `conflict.version`; on success show `다른 운영진의 체크 {applied}건을 반영해 저장했습니다` (only if `applied > 0`) before navigating. A second conflict repeats the check once more; otherwise (or `null`) open `ConflictPanel`: `{updatedByName}님이 {HH:mm}에 수정했습니다`, two read-only textareas (상대 버전 / 내 버전), buttons 「내 것으로 덮어쓰기」 (`window.confirm` then save with `conflict.version`) and 「상대 것 불러오기」 (write stash, load conflict values into fields and `base`).
- [ ] **Step 5: Verify** `npx tsc --noEmit -p .`. Manual with two browsers logged in as admins: (a) A edits, B ticks a task on the view page, A saves → saved with notice, B's tick kept; (b) B edits text and saves, A saves → panel; overwrite works; "상대 것 불러오기" keeps A's text in 「보관한 내 글」; (c) close the tab mid-edit, reopen → banner, 불러오기 restores.
- [ ] **Step 6: Commit** `feat(meeting-notes): drafts and a conflict screen in the editor`.

### Task 9: 문서와 전체 확인

**Files:**
- Modify: `CLAUDE.md` (the `/meeting-notes` paragraph)

- [ ] **Step 1:** Rewrite the `/meeting-notes` paragraph: tasks (`- [ ]` + `@이름` + `~M/D`, inheritance, `extractMeetingNoteTasks`, computed at read time, `/meeting-notes/tasks`), toggles bump `version` without a version check but verify the line text, conflict flow (`rebaseMeetingNoteToggles` auto-applies others' ticks, otherwise the side-by-side panel, stash key), drafts in `localStorage` (`lolpamin.meeting-note.draft.*`), split editor helpers in `meeting-note-editing.ts`. Add `meeting-notes/tasks` to the Mobile section's operator-screen list (count fifteen → sixteen).
- [ ] **Step 2: Run** `npm test --workspace=@lolpamin/core` and `npm run test --workspace=dashboard`. Expected: all pass (the dashboard needs the test DB; record the counts).
- [ ] **Step 3: Commit** `docs: meeting-notes tasks, drafts and conflict flow in CLAUDE.md`.
