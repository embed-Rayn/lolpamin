# 사이트 개편 · 회원 정보 페이지 Implementation Plan

**Goal:** Give the dashboard a public front door (banner landing + logo link), split the sidebar into member-facing and operator-only halves with real route guards, and fill the new 1.1 slot with a 회원 정보 페이지 (roster table with search and column sorting).

**Architecture:** No new subsystem. The sidebar already computes its `1.1 / 2.2` numbering from array position in `AppShell.tsx`, so hiding operator items is just leaving them out of the array for a signed-out visitor. Route guards copy the `/admins` pattern (`getCurrentAdmin()` → `redirect("/login")`). The roster page is a new query module (`lib/queries/member-info.ts`) plus a new table component; it reuses `getCountedGameFilter` for its record tallies and `MemberTierCell` for the tier column so the numbers match the MMR ranking pages.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres, vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-site-navigation-and-member-info-design.md`

## Global Constraints

- Every DB-touching test file in `apps/dashboard` starts with the `DATABASE_URL_TEST` guard — copy it verbatim from a sibling test file. Without it Prisma falls back to `DATABASE_URL` and `resetDatabase()` wipes dev data.
- `apps/dashboard/vitest.config.ts` has `fileParallelism: false`; do not change it.
- Any page rendering `AppShell` must declare `export const dynamic = "force-dynamic"` — `AppShell` itself queries Postgres for the sidebar badge.
- UI copy is Korean; code, identifiers, comments and commit messages are English.
- Record tallies must stay consistent with `queries/members.ts` and `apps/discord-bot`: cancelled games and pre-reset games are excluded via `getCountedGameFilter`, and tombstone participation counts toward the survivor.
- `data/` is gitignored (real chat exports). The banner is copied into `apps/dashboard/public/` so it is served and committed.
- Deferred by the spec: 주 역할군 / 부 역할군 / 최고티어 columns and the header-click category filter. Do not stub empty columns for them.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `apps/dashboard/public/banner.png` | Banner asset, copied from the gitignored `data/배너.png` |
| `apps/dashboard/lib/queries/member-info.ts` | Roster rows: per-mode records, search, sort |
| `apps/dashboard/lib/queries/member-info.test.ts` | Integration test for the above |
| `apps/dashboard/lib/mutations/update-member-note.ts` | Writes `Member.note` (trim; empty → null) |
| `apps/dashboard/lib/mutations/update-member-note.test.ts` | Integration test for the above |
| `apps/dashboard/app/member-info/page.tsx` | 1.1 회원 정보 페이지 |
| `apps/dashboard/app/member-info/actions.ts` | `updateMemberNoteAction`, `requireAdmin`-gated |
| `apps/dashboard/components/MemberInfoTable.tsx` | Sortable header row + rows |
| `apps/dashboard/components/MemberInfoSearch.tsx` | Search box (client, updates `?q=`) |
| `apps/dashboard/components/MemberNoteCell.tsx` | Inline-editable 비고 cell |

**Modified files**

| File | What changes |
|---|---|
| `packages/db/prisma/schema.prisma` | `Member.note String?` |
| `apps/dashboard/app/page.tsx` | Redirect → banner landing page |
| `apps/dashboard/components/AppShell.tsx` | `"home"` + `"member-info"` nav keys, regrouped nav, disabled placeholder rows, logo links to `/` |
| `apps/dashboard/app/members/page.tsx` | Title → 협곡 MMR 랭킹 |
| `apps/dashboard/app/aram/page.tsx` | Title → 칼바람 MMR 랭킹 |
| `apps/dashboard/app/match-history/page.tsx` | Title → 내전 상세 기록 |
| `apps/dashboard/app/{kakao-import,link-accounts,matches,replay-import,team-builder}/page.tsx` | Login redirect guard; `isAdmin={true}` afterwards |

---

## Task 1 — 배너 랜딩 화면과 로고 링크

- [x] Copy `data/배너.png` → `apps/dashboard/public/banner.png`
- [x] Replace the `redirect("/members")` in `app/page.tsx` with a page rendering the banner inside `AppShell` (`activeNav="home"`, `force-dynamic`)
- [x] Add `"home"` to `AppShellProps["activeNav"]`
- [x] Wrap the sidebar logo block in `<Link href="/">`

**Verify:** `/` returns 200 and serves `/banner.png`; clicking the logo from any page lands on `/`.

## Task 2 — 사이드바 재편과 운영자 전용 숨김

- [x] Widen the local `NavItem` type with optional `href` and `disabled`
- [x] Group 1 "회원 관리": 회원 정보 페이지(disabled until task 5) · 협곡 MMR 랭킹 · 칼바람 MMR 랭킹 · 미활동 리포트, then push 카톡 불러오기 · 계정 연결 · 관리자 only when `currentAdmin`
- [x] Group 2 "경기기록": 내전 상세 기록 · 플레이어별 통계(disabled) · 챔피언 통계(disabled), then push 게임결과 입력 · 리플레이 불러오기 · 수동 팀짜기 only when `currentAdmin`
- [x] Render `disabled` items as an inert row with a "추가예정" tag instead of a `NavLink`
- [x] Point the group heading at the first non-disabled child
- [x] Rename the three page titles (협곡 MMR 랭킹 / 칼바람 MMR 랭킹 / 내전 상세 기록)

**Verify:** Signed out, the sidebar shows 1.1–1.4, 2.1–2.3, 3.1–3.2; signed in, 1.1–1.7, 2.1–2.6, 3.1–3.2.

## Task 3 — 운영자 전용 라우트 가드

- [x] In each of `/kakao-import`, `/link-accounts`, `/matches`, `/replay-import`, `/team-builder`: `const currentAdmin = await getCurrentAdmin(); if (!currentAdmin) redirect("/login");` before the data fetch
- [x] Pass `isAdmin={true}` to the child components afterwards (the guard already proved it)

**Verify:** Signed out, each URL redirects to `/login`; signed in, each page behaves as before.

## Task 4 — `Member.note` 와 비고 뮤테이션

- [x] Add `note String?` to `Member` in `schema.prisma`
- [x] `npm run migrate --workspace=@lolpamin/db -- --name add_member_note`, then `npm run generate --workspace=@lolpamin/db`
- [x] `lib/mutations/update-member-note.ts` — trim, empty → `null`
- [x] `lib/mutations/update-member-note.test.ts` — trim / null / other-fields-untouched / missing member throws

**Verify:** `npx vitest run lib/mutations/update-member-note.test.ts` passes.

## Task 5 — 회원 정보 쿼리

- [x] `lib/queries/member-info.ts`: `MemberInfoSort` union + `parseMemberInfoSort` / `parseSortDirection` (default `realName` / `asc`)
- [x] `tallyByMode()` — one `gameParticipant.findMany` under `getCountedGameFilter`, split into RIFT/ARAM buckets, tombstone rows credited to the survivor
- [x] `winRate = round(wins / games × 100)`, `null` when `games === 0`
- [x] Search across realName + kakaoNickname + tombstone nicknames
- [x] JS comparator for all seven sort keys, empty values last, `id` tie-break
- [ ] `lib/queries/member-info.test.ts` covering per-mode split, cancelled/pre-reset exclusion, tombstone credit, search, and each sort key's empty-last rule

**Verify:** `npx vitest run lib/queries/member-info.test.ts` passes.

## Task 6 — 회원 정보 화면

- [ ] `components/MemberNoteCell.tsx` — mirrors `MemberRealNameCell` (click to edit, blur/Enter saves, Escape reverts, re-reads the prop on open)
- [ ] `app/member-info/actions.ts` — `updateMemberNoteAction` with `requireAdmin()` + `revalidatePath("/member-info")`
- [ ] `components/MemberInfoSearch.tsx` — search input updating `?q=`
- [ ] `components/MemberInfoTable.tsx` — sortable headers (`sortHref` pattern), NO. column from row index, 협곡/칼바람 blocks, `MemberTierCell`, `MemberNoteCell`
- [ ] `app/member-info/page.tsx` — `force-dynamic`, reads `searchParams` (`q`, `sort`, `dir`), public read, admin-only editing
- [ ] Turn the sidebar's 회원 정보 페이지 item into a real link (`href: "/member-info"`, drop `disabled`), add `"member-info"` to the `activeNav` union

**Verify:** In the browser, sorting each column toggles asc/desc, search narrows the list, the 비고 cell saves for an admin and is read-only when signed out.

## Task 7 — 마무리

- [ ] `npm test` across the workspace
- [ ] `npx tsc --noEmit` in `apps/dashboard` shows no new errors (`lib/draw/candidates.test.ts` has two pre-existing ones from commit `1463067`)
- [ ] Commit, push, deploy per the CLAUDE.md three-command sequence
