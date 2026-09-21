# 모바일 반응형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 열람하는 5개 화면(`/`, `/member-info`, `/rift`, `/aram`, `/match-history`, `/inactive`)과 `/login`을 375px 폭 폰에서 읽고 조작할 수 있게 만들고, 나머지 운영 화면 8개는 폰에서 "PC에서 이용해 주세요" 안내로 대체한다.

**Architecture:** CSS 반응형(Tailwind `md:` = 768px) 한 축. 표 컴포넌트는 데스크톱 그리드(`hidden md:block`)와 카드 목록(`md:hidden`)을 같은 서버 컴포넌트 안에 나란히 렌더한다 — 데이터는 한 번만 조회하고 두 뷰가 같은 `rows`를 받는다. 내비게이션은 `SidebarNav`를 그대로 재사용하는 `MobileDrawer`(클라이언트 컴포넌트, 열림 상태만 소유)로 감싼다. 정렬은 URL 파라미터(`sort`/`dir`)가 진실의 원천이므로, 폰의 `SortSelect`는 헤더 정렬 링크와 똑같은 URL을 만들 뿐이다.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS(시맨틱 토큰, `tailwind.config.ts` 참고), React 서버/클라이언트 컴포넌트.

**Spec:** `docs/superpowers/specs/2026-09-21-mobile-responsive-design.md`

## Global Constraints

- 브레이크포인트는 Tailwind 기본 `md`(768px) 하나만 쓴다. 새 브레이크포인트를 `tailwind.config.ts`에 추가하지 않는다.
- 색은 항상 시맨틱 토큰(`bg-surface`, `text-muted`, `border-ink/[.06]`, `rgb(var(--c-role))`)만 쓴다. 새 hex 값을 넣지 않는다 — `CLAUDE.md`의 "## Skins" 절 규칙.
- `text-white`는 `bg-accent`(또는 다른 solid 시맨틱 버튼) 위에서만 쓴다.
- 쿼리·뮤테이션·타입(`MemberRow`, `MemberInfoRow`, `InactiveRow`, `GameHistoryRow`, `parseMemberSort` 등)은 이 작업에서 바뀌지 않는다. 표시 계층만 수정한다.
- 카드·드로어는 순수 표시 컴포넌트라 새 유닛 테스트를 추가하지 않는다(스펙의 "테스트" 절). 각 태스크 끝에서 `npx tsc --noEmit -p .`로 타입을, 마지막 태스크에서 Playwright 스크린샷으로 레이아웃을 검증한다.
- 모든 애니메이션은 `motion-safe:`/`motion-reduce:` Tailwind variant로 감싼다(설정 불필요, Tailwind 기본 제공) — `prefers-reduced-motion`이면 트랜지션 없이 즉시 전환된다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: 드로어용 아이콘 추가

**Files:**
- Modify: `apps/dashboard/components/nav-icons.tsx`

**Interfaces:**
- Produces: `NavIconName`에 `"menu"`, `"x"` 두 값 추가. `NavIcon` 컴포넌트는 변경 없음(기존과 같은 방식으로 두 이름을 그릴 수 있게 됨).

- [ ] **Step 1: `NavIconName` 유니언에 두 값 추가**

`apps/dashboard/components/nav-icons.tsx`에서 다음 문자열을 찾는다:

```ts
  | "chevron-down"
  | "snowflake"
  | "home";
```

다음으로 바꾼다:

```ts
  | "chevron-down"
  | "snowflake"
  | "menu"
  | "x"
  | "home";
```

- [ ] **Step 2: `PATHS`에 두 항목 추가**

다음 줄을 찾는다:

```ts
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
```

바로 뒤에 추가한다(순서 무관, `home` 앞이면 된다):

```ts
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존에 있던 `lib/draw/candidates.test.ts`의 두 에러 외에 새 에러 없음(이 두 개는 이 작업 이전부터 있던 무관한 에러다).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/nav-icons.tsx
git commit -m "feat(nav): add menu and close icons for the mobile drawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `MobileDrawer` + `AppShell`에 폰 헤더/햄버거 연결

**Files:**
- Create: `apps/dashboard/components/MobileDrawer.tsx`
- Modify: `apps/dashboard/components/AppShell.tsx`

**Interfaces:**
- Consumes: `SidebarNavGroup`, `SidebarNav`(from `./SidebarNav`, 변경 없음), `NavIcon`(from `./nav-icons`, Task 1에서 `"menu"`/`"x"` 추가됨).
- Produces: `MobileDrawer({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string })` — `AppShell`이 사이드바용으로 만든 것과 같은 `groups`/`activeNav` 값을 그대로 받는다.

- [ ] **Step 1: `MobileDrawer.tsx` 작성**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";

// 헤더 왼쪽 ≡ 버튼과 드로어 패널을 함께 소유한다. 열림 상태는 useState 하나이고
// 서버가 알 필요가 없다 — AppShell은 서버 컴포넌트로 남는다.
//
// 패널은 항상 DOM에 있고(translate-x로 화면 밖에 둔다) 열릴 때 CSS transition으로
// 슬라이드한다. {open && <patch/>}로 조건부 마운트하면 첫 등장이 즉시 나타나 버려서
// 트랜지션을 탈 기회가 없다.
export function MobileDrawer({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 패널 안의 링크를 누르면 닫는다. SidebarNav 내부를 건드리지 않고 패널의 클릭을
  // 위임받아 <a>인지만 본다.
  function onPanelClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-fg md:hidden"
      >
        <NavIcon name="menu" size={22} />
      </button>

      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-ink/40 motion-safe:transition-opacity motion-safe:duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          onClick={onPanelClick}
          className={`absolute inset-y-0 left-0 flex w-[280px] flex-col gap-5 overflow-y-auto bg-[rgb(var(--sidebar-bg))] px-3.5 py-5 shadow-xl motion-safe:transition-transform motion-safe:duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-2">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
                <NavIcon name="gamepad" size={20} />
              </div>
              <div className="text-[16px] font-extrabold tracking-tight text-fg">롤파민</div>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="메뉴 닫기"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted hover:bg-hover"
            >
              <NavIcon name="x" size={18} />
            </button>
          </div>
          <SidebarNav groups={groups} activeNav={activeNav} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: `AppShell.tsx` 수정 — import 추가**

`apps/dashboard/components/AppShell.tsx`에서:

```tsx
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { HeaderAuth } from "./HeaderAuth";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

를 다음으로 바꾼다:

```tsx
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { HeaderAuth } from "./HeaderAuth";
import { MobileDrawer } from "./MobileDrawer";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

- [ ] **Step 3: `<aside>`를 `hidden md:flex`로**

다음을 찾는다:

```tsx
      <aside className="sticky top-0 flex h-screen w-[260px] flex-none flex-col gap-5 overflow-y-auto border-r border-ink/[.07] bg-[rgb(var(--sidebar-bg))] px-3.5 py-5">
```

다음으로 바꾼다:

```tsx
      <aside className="sticky top-0 hidden h-screen w-[260px] flex-none flex-col gap-5 overflow-y-auto border-r border-ink/[.07] bg-[rgb(var(--sidebar-bg))] px-3.5 py-5 md:flex">
```

- [ ] **Step 4: 헤더를 폰 크기로 줄이고 ≡ 버튼을 넣는다**

다음을 찾는다:

```tsx
        <header className="sticky top-0 z-10 flex h-[72px] flex-none items-center justify-between border-b border-ink/[.07] bg-[rgb(var(--header-bg)/0.9)] px-7 backdrop-blur">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-[20px] font-extrabold tracking-tight">{pageTitle}</h1>
            <div className="flex items-center gap-1.5 text-[12.5px] text-faint">
              <Link href="/" className="hover:text-fg-2">
                홈
              </Link>
              {activeGroup && (
                <>
                  <span className="text-ghost">›</span>
                  <span>{activeGroup.label}</span>
                </>
              )}
              <span className="text-ghost">›</span>
              <span className="text-muted">{pageDesc}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[12.5px] text-muted">
              회원 <span className="font-mono font-semibold text-fg">{totalCount}</span>명
            </div>
            <HeaderAuth username={currentAdmin?.username ?? null} />
          </div>
        </header>
```

다음으로 바꾼다:

```tsx
        <header className="sticky top-0 z-10 flex h-14 flex-none items-center justify-between gap-3 border-b border-ink/[.07] bg-[rgb(var(--header-bg)/0.9)] px-3 backdrop-blur md:h-[72px] md:px-7">
          <div className="flex min-w-0 items-center gap-2.5 md:flex-col md:items-stretch md:gap-0.5">
            <MobileDrawer groups={groups} activeNav={activeNav} />
            <h1 className="m-0 truncate text-[16px] font-extrabold tracking-tight md:text-[20px]">{pageTitle}</h1>
            <div className="hidden items-center gap-1.5 text-[12.5px] text-faint md:flex">
              <Link href="/" className="hover:text-fg-2">
                홈
              </Link>
              {activeGroup && (
                <>
                  <span className="text-ghost">›</span>
                  <span>{activeGroup.label}</span>
                </>
              )}
              <span className="text-ghost">›</span>
              <span className="text-muted">{pageDesc}</span>
            </div>
          </div>
          <div className="flex flex-none items-center gap-4">
            <div className="hidden text-[12.5px] text-muted md:block">
              회원 <span className="font-mono font-semibold text-fg">{totalCount}</span>명
            </div>
            <HeaderAuth username={currentAdmin?.username ?? null} />
          </div>
        </header>
```

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: Task 1과 같은 두 개의 무관한 기존 에러 외에 새 에러 없음.

- [ ] **Step 6: 개발 서버로 확인**

```bash
cd apps/dashboard
npm run dev &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/rift; do sleep 1; done'
```

375px 폭 헤드리스 브라우저로 `/rift`를 열어 ≡ 버튼이 보이고, 클릭하면 드로어가 왼쪽에서 슬라이드해 열리고, 배경 탭·ESC·링크 클릭으로 닫히는지 확인한다(Task 9에서 Playwright 스크립트로 정식 검증하므로 여기서는 눈으로 한 번 확인하는 정도로 충분하다).

- [ ] **Step 7: 서버 종료, Commit**

```bash
git add apps/dashboard/components/MobileDrawer.tsx apps/dashboard/components/AppShell.tsx
git commit -m "feat(nav): add a mobile drawer that reuses SidebarNav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `AppShell`의 `desktopOnly` 안내 + 8개 운영 화면에 적용

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`
- Modify: `apps/dashboard/app/matches/page.tsx`
- Modify: `apps/dashboard/app/replay-import/page.tsx`
- Modify: `apps/dashboard/app/team-builder/page.tsx`
- Modify: `apps/dashboard/app/kakao-import/page.tsx`
- Modify: `apps/dashboard/app/link-accounts/page.tsx`
- Modify: `apps/dashboard/app/admins/page.tsx`
- Modify: `apps/dashboard/app/draw/cannon/page.tsx`
- Modify: `apps/dashboard/app/draw/plinko/page.tsx`

**Interfaces:**
- Produces: `AppShellProps`에 `desktopOnly?: boolean` 추가.

- [ ] **Step 1: `AppShellProps`에 `desktopOnly` 추가**

`apps/dashboard/components/AppShell.tsx`에서 인터페이스 끝부분을 찾는다:

```tsx
  pageTitle: string;
  pageDesc: string;
  children: React.ReactNode;
}
```

다음으로 바꾼다:

```tsx
  pageTitle: string;
  pageDesc: string;
  // 이 화면은 폭이 넓어야 쓸 수 있다(경기 입력, 리플레이, 팀짜기, 카톡 불러오기, 계정
  // 연결, 관리자, 뽑기 두 개). 폰에서는 children 대신 안내 카드를 보여주고, children은
  // DOM에 남겨(hidden md:block) "데스크톱 사이트 보기"로는 계속 볼 수 있게 한다.
  desktopOnly?: boolean;
  children: React.ReactNode;
}
```

- [ ] **Step 2: 함수 시그니처와 렌더 부분 수정**

다음을 찾는다:

```tsx
export async function AppShell({ activeNav, pageTitle, pageDesc, children }: AppShellProps) {
```

다음으로 바꾼다:

```tsx
export async function AppShell({ activeNav, pageTitle, pageDesc, desktopOnly, children }: AppShellProps) {
```

파일 맨 끝의 다음 부분을 찾는다:

```tsx
        {children}
      </main>
    </div>
  );
}
```

다음으로 바꾼다:

```tsx
        {desktopOnly ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center md:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-tint text-accent">
                <NavIcon name="gear" size={28} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[16px] font-bold text-fg">이 화면은 PC에서 이용해 주세요</div>
                <div className="max-w-xs text-[13px] leading-relaxed text-faint">
                  경기 입력·리플레이·계정 연결·뽑기는 화면이 넓어야 합니다.
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/"
                  className="rounded-lg border border-ink/[.1] px-3.5 py-2 text-[13px] font-bold text-fg-2 hover:bg-hover"
                >
                  홈으로
                </Link>
                <Link
                  href="/rift"
                  className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
                >
                  협곡 랭킹
                </Link>
              </div>
            </div>
            <div className="hidden md:block">{children}</div>
          </>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 8개 페이지에 `desktopOnly` 추가 — 한 줄짜리 4개**

`apps/dashboard/app/matches/page.tsx`에서:

```tsx
    <AppShell activeNav="matches" pageTitle="게임 결과 입력" pageDesc="내전 결과 기록 및 MMR 재계산">
```

→

```tsx
    <AppShell activeNav="matches" pageTitle="게임 결과 입력" pageDesc="내전 결과 기록 및 MMR 재계산" desktopOnly>
```

`apps/dashboard/app/kakao-import/page.tsx`에서:

```tsx
    <AppShell activeNav="kakao-import" pageTitle="카톡 불러오기" pageDesc="카카오톡에서 내보낸 대화 txt 업로드 → 활동 반영">
```

→

```tsx
    <AppShell activeNav="kakao-import" pageTitle="카톡 불러오기" pageDesc="카카오톡에서 내보낸 대화 txt 업로드 → 활동 반영" desktopOnly>
```

`apps/dashboard/app/admins/page.tsx`에서:

```tsx
    <AppShell activeNav="admins" pageTitle="관리자 · 설정" pageDesc="계정, 스킨, MMR 계산식, 시즌 리셋">
```

→

```tsx
    <AppShell activeNav="admins" pageTitle="관리자 · 설정" pageDesc="계정, 스킨, MMR 계산식, 시즌 리셋" desktopOnly>
```

`apps/dashboard/app/draw/cannon/page.tsx`에서:

```tsx
    <AppShell activeNav="draw-cannon" pageTitle="대포 뽑기" pageDesc="대포로 공을 쏘아 순서를 정합니다">
```

→

```tsx
    <AppShell activeNav="draw-cannon" pageTitle="대포 뽑기" pageDesc="대포로 공을 쏘아 순서를 정합니다" desktopOnly>
```

- [ ] **Step 4: 8개 페이지에 `desktopOnly` 추가 — 여러 줄짜리 4개**

`apps/dashboard/app/replay-import/page.tsx`에서:

```tsx
    <AppShell
      activeNav="replay-import"
      pageTitle="리플레이 불러오기"
      pageDesc="롤 클라이언트의 .rofl 파일 업로드 → 참가자 매칭 → 내전 결과 저장"
    >
```

→

```tsx
    <AppShell
      activeNav="replay-import"
      pageTitle="리플레이 불러오기"
      pageDesc="롤 클라이언트의 .rofl 파일 업로드 → 참가자 매칭 → 내전 결과 저장"
      desktopOnly
    >
```

`apps/dashboard/app/team-builder/page.tsx`에서:

```tsx
    <AppShell
      activeNav="team-builder"
      pageTitle="수동 팀짜기"
      pageDesc="티어 점수를 보며 손으로 양 팀을 맞춥니다"
    >
```

→

```tsx
    <AppShell
      activeNav="team-builder"
      pageTitle="수동 팀짜기"
      pageDesc="티어 점수를 보며 손으로 양 팀을 맞춥니다"
      desktopOnly
    >
```

`apps/dashboard/app/link-accounts/page.tsx`에서:

```tsx
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
```

→

```tsx
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
      desktopOnly
    >
```

`apps/dashboard/app/draw/plinko/page.tsx`에서:

```tsx
    <AppShell
      activeNav="draw-plinko"
      pageTitle="핀볼 뽑기"
      pageDesc="핀 사이로 공을 떨어뜨려 순서를 정합니다"
    >
```

→

```tsx
    <AppShell
      activeNav="draw-plinko"
      pageTitle="핀볼 뽑기"
      pageDesc="핀 사이로 공을 떨어뜨려 순서를 정합니다"
      desktopOnly
    >
```

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/AppShell.tsx apps/dashboard/app/matches/page.tsx apps/dashboard/app/replay-import/page.tsx apps/dashboard/app/team-builder/page.tsx apps/dashboard/app/kakao-import/page.tsx apps/dashboard/app/link-accounts/page.tsx apps/dashboard/app/admins/page.tsx apps/dashboard/app/draw/cannon/page.tsx apps/dashboard/app/draw/plinko/page.tsx
git commit -m "feat(nav): show a PC-only notice on the 8 operator screens in mobile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `SortSelect` 공용 컴포넌트

**Files:**
- Create: `apps/dashboard/components/SortSelect.tsx`

**Interfaces:**
- Produces: `SortSelectOption { value: string; label: string }`, `SortSelect({ value, options, onChange }: { value: string; options: SortSelectOption[]; onChange: (value: string) => void })`.

- [ ] **Step 1: 파일 작성**

```tsx
"use client";

export interface SortSelectOption {
  value: string;
  label: string;
}

// 카드 목록 위에 놓는 폰 전용 정렬 셀렉트. 표 헤더의 정렬 링크를 누를 곳이 없는 폰에서
// <select> 하나로 기준과 방향을 함께 고른다. value가 옵션 목록에 없으면(예: PC 헤더에서
// 셀렉트에 없는 조합으로 정렬해 둔 채 폰으로 들어온 경우) 첫 옵션을 선택 상태로 보여
// 준다 — parseMemberSort류가 모르는 URL 값을 기본값으로 접는 것과 같은 규칙이다.
export function SortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SortSelectOption[];
  onChange: (value: string) => void;
}) {
  const selected = options.some((o) => o.value === value) ? value : options[0].value;
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      aria-label="정렬 기준"
      className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음(아직 아무도 `SortSelect`를 쓰지 않으므로 미사용 export만 있고 에러는 없다).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/components/SortSelect.tsx
git commit -m "feat(ui): add a generic mobile sort select

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `/rift`, `/aram` — `MemberCard` + 표/필터 반응형

**Files:**
- Create: `apps/dashboard/components/MemberCard.tsx`
- Modify: `apps/dashboard/components/MemberTable.tsx`
- Modify: `apps/dashboard/components/MemberFilters.tsx`
- Modify: `apps/dashboard/app/rift/page.tsx`
- Modify: `apps/dashboard/app/aram/page.tsx`

**Interfaces:**
- Consumes: `MemberRow`(from `@/lib/queries/members`, 변경 없음), `tierLabel`·`tierScore`(from `@lolpamin/core`).
- Produces: `PODIUM`, `podiumOf(rank: number | null)`, `RankBadge({ rank: 1 | 2 | 3 })`, `MemberCard({ row: MemberRow })` — 전부 `MemberCard.tsx`에서 export. `MemberTable`은 이제부터 이 파일의 `podiumOf`/`RankBadge`를 가져다 쓴다(중복 정의 제거).

- [ ] **Step 1: `MemberCard.tsx` 작성**

```tsx
import type { MemberRow } from "@/lib/queries/members";
import { tierLabel, tierScore } from "@lolpamin/core";

// 1·2·3위는 금·은·동으로 물들이고 은은하게 빛난다(globals.css의 .rank-row-*,
// .rank-badge-*). MemberTable의 데스크톱 순위 칸과 이 카드가 같은 표를 공유하므로
// 여기 한 곳에서만 정의한다 — 두 군데서 따로 관리하면 색이 갈라질 수 있다.
export const PODIUM: Record<1 | 2 | 3, { row: string; badge: string; label: string }> = {
  1: { row: "rank-row-gold", badge: "rank-badge-gold", label: "1위" },
  2: { row: "rank-row-silver", badge: "rank-badge-silver", label: "2위" },
  3: { row: "rank-row-bronze", badge: "rank-badge-bronze", label: "3위" },
};

export function podiumOf(rank: number | null): (typeof PODIUM)[1 | 2 | 3] | null {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM[rank] : null;
}

export function RankBadge({ rank }: { rank: 1 | 2 | 3 }) {
  const podium = PODIUM[rank];
  return (
    <span className={`rank-badge ${podium.badge}`} aria-label={podium.label}>
      {rank}
    </span>
  );
}

function displayLabel(m: MemberRow): string {
  for (const candidate of [m.realName, m.kakaoNickname, m.discordName]) {
    if (candidate !== "-") return candidate;
  }
  return "이름 미확인";
}

export function MemberCard({ row }: { row: MemberRow }) {
  const podium = podiumOf(row.rank);
  const nickname = [row.kakaoNickname, row.discordName].filter((v) => v !== "-").join(" · ");
  return (
    <div className={`flex items-center gap-3 border-b border-ink/[.04] px-4 py-3 ${podium ? podium.row : ""}`}>
      <div className="flex w-8 flex-none items-center justify-center">
        {podium ? (
          <RankBadge rank={row.rank as 1 | 2 | 3} />
        ) : (
          <span className={`font-mono text-[13px] ${row.rank === null ? "text-ghost-2" : "text-muted"}`}>
            {row.rank ?? "-"}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-bold">{displayLabel(row)}</span>
          <span
            className={`flex-none font-mono text-[17px] font-bold ${
              row.mmr === 0 ? "text-ghost" : row.mmr >= 1600 ? "text-gold" : "text-fg"
            }`}
          >
            {row.mmr}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">
          {nickname || "-"} · <span className={tierScore(row.tier) === 0 ? "text-ghost" : ""}>{tierLabel(row.tier)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[12px]">
          <span className="text-faint">
            {row.playedCount}판 {row.wins}승 {row.losses}패
          </span>
          <span
            className={
              row.daysSinceActive !== null && row.daysSinceActive >= 30
                ? "text-danger-soft"
                : row.daysSinceActive !== null && row.daysSinceActive >= 14
                ? "text-orange"
                : "text-faint"
            }
          >
            {row.lastActiveLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `MemberTable.tsx` 전체 교체**

`apps/dashboard/components/MemberTable.tsx`의 전체 내용을 다음으로 바꾼다:

```tsx
import Link from "next/link";
import type { MemberFilter, MemberRow, MemberSort, SortDirection } from "@/lib/queries/members";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { MemberRealNameCell } from "@/components/MemberRealNameCell";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberCard, RankBadge, podiumOf } from "@/components/MemberCard";

// 순위, 실명, 카톡, 디코, 티어, MMR, 판, 승, 패, 마지막 활동, 관리. Riot ID는 이 표에서
// 뺐다 — 편집은 /team-builder에 남아 있다.
const GRID = "grid-cols-[64px_0.6fr_1fr_1fr_112px_88px_46px_44px_44px_120px_80px]";

function RankCell({ rank }: { rank: number | null }) {
  const podium = podiumOf(rank);
  if (podium) {
    return (
      <div className="flex items-center justify-center">
        <RankBadge rank={rank as 1 | 2 | 3} />
      </div>
    );
  }
  return (
    <div className={`text-center font-mono text-[13.5px] ${rank === null ? "text-ghost-2" : "text-muted"}`}>
      {rank ?? "-"}
    </div>
  );
}

function displayLabel(m: MemberRow): string {
  for (const candidate of [m.realName, m.kakaoNickname, m.discordName]) {
    if (candidate !== "-") return candidate;
  }
  return "이름 미확인";
}

export function MemberTable({
  rows,
  isAdmin,
  sort,
  dir,
  filter,
  query,
  basePath,
}: {
  rows: MemberRow[];
  isAdmin: boolean;
  sort: MemberSort;
  dir: SortDirection;
  filter: MemberFilter;
  query: string;
  // 정렬 링크가 돌아올 페이지 — MemberFilters의 basePath와 같은 이유다.
  basePath: string;
}) {
  function sortHref(key: MemberSort): string {
    // 같은 기준을 다시 누르면 방향을 뒤집고, 다른 기준으로 바꾸면 내림차순부터 시작한다.
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams({ filter, sort: key, dir: nextDir });
    if (query) params.set("q", query);
    return `${basePath}?${params.toString()}`;
  }

  function sortMark(key: MemberSort): string {
    if (sort !== key) return "";
    return dir === "desc" ? " ↓" : " ↑";
  }

  return (
    <>
      {/* 데스크톱: 원래 그리드 표. 폰: 아래 md:hidden 카드 목록이 대신한다. */}
      <div className="hidden md:block">
        <div
          className={`grid ${GRID} gap-4 border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint`}
        >
          <Link href={sortHref("mmr")} className="text-center hover:text-fg-2">
            순위
          </Link>
          <Link href={sortHref("realName")} className="hover:text-fg-2">
            실명{sortMark("realName")}
          </Link>
          <Link href={sortHref("kakaoNickname")} className="hover:text-fg-2">
            카톡 닉네임{sortMark("kakaoNickname")}
          </Link>
          <div>디코 닉네임</div>
          <Link href={sortHref("tier")} className="hover:text-fg-2">
            티어{sortMark("tier")}
          </Link>
          <Link href={sortHref("mmr")} className="text-right hover:text-fg-2">
            MMR{sortMark("mmr")}
          </Link>
          <div className="text-right">판</div>
          <div className="text-right">승</div>
          <div className="text-right">패</div>
          <div className="text-right">마지막 활동</div>
          <div className="text-right">관리</div>
        </div>
        {rows.map((m) => {
          const podium = podiumOf(m.rank);
          return (
            <div
              key={m.id}
              className={`grid ${GRID} relative items-center gap-4 border-b border-ink/[.04] px-5 py-3.5 text-[15px] ${
                podium ? podium.row : "hover:bg-hover"
              }`}
            >
              <RankCell rank={m.rank} />
              <MemberRealNameCell memberId={m.id} realName={m.realName} isAdmin={isAdmin} />
              <div className={`truncate font-mono text-[13.5px] ${m.kakaoNickname === "-" ? "text-ghost" : "text-gold"}`}>
                {m.kakaoNickname}
              </div>
              <div className={`truncate font-mono text-[13.5px] ${m.discordName === "-" ? "text-ghost" : "text-accent-soft"}`}>
                {m.discordName}
              </div>
              <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
              <div
                className={`text-right font-mono text-[15.5px] font-bold ${
                  m.mmr === 0 ? "text-ghost" : m.mmr >= 1600 ? "text-gold" : "text-fg"
                }`}
              >
                {m.mmr}
              </div>
              <div className="text-right font-mono text-[13.5px] text-muted">{m.playedCount}</div>
              <div className={`text-right font-mono text-[13.5px] ${m.wins > 0 ? "text-success-soft" : "text-ghost"}`}>
                {m.wins}
              </div>
              <div className={`text-right font-mono text-[13.5px] ${m.losses > 0 ? "text-danger-soft" : "text-ghost"}`}>
                {m.losses}
              </div>
              <div
                className={`text-right font-mono text-[13.5px] ${
                  m.daysSinceActive !== null && m.daysSinceActive >= 30
                    ? "text-danger-soft"
                    : m.daysSinceActive !== null && m.daysSinceActive >= 14
                    ? "text-orange"
                    : "text-muted"
                }`}
              >
                {m.lastActiveLabel}
              </div>
              {isAdmin ? (
                <DeleteMemberButton
                  memberId={m.id}
                  label={displayLabel(m)}
                  mentionCount={m.mentionCount}
                  gameCount={m.gameCount}
                  aliasCount={m.aliasCount}
                />
              ) : (
                <div />
              )}
            </div>
          );
        })}
      </div>
      <div className="md:hidden">
        {rows.map((m) => (
          <MemberCard key={m.id} row={m} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: `MemberFilters.tsx` 전체 교체 — 정렬 셀렉트 + 폰 레이아웃**

`apps/dashboard/components/MemberFilters.tsx`의 전체 내용을 다음으로 바꾼다:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberFilter, MemberSort, SortDirection } from "@/lib/queries/members";
import { SortSelect } from "@/components/SortSelect";

// 점수판이라 판수 기준으로만 가른다 — 연결 상태는 /link-accounts, 미활동은 /inactive.
const FILTERS: Array<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "played", label: "유저만" },
  { key: "unranked", label: "언랭만" },
];

// 폰의 정렬 셀렉트가 고르는 값. "sort:dir"로 인코딩해 <select> 하나가 기준과 방향을
// 한 번에 바꾼다 — PC의 헤더 링크 클릭 두 번(기준 선택 + 방향 토글)을 압축한 것이다.
const SORT_OPTIONS: Array<{ value: string; label: string; sort: MemberSort; dir: SortDirection }> = [
  { value: "mmr:desc", label: "MMR 높은 순", sort: "mmr", dir: "desc" },
  { value: "mmr:asc", label: "MMR 낮은 순", sort: "mmr", dir: "asc" },
  { value: "realName:asc", label: "이름 가나다순", sort: "realName", dir: "asc" },
  { value: "realName:desc", label: "이름 가나다 역순", sort: "realName", dir: "desc" },
  { value: "tier:desc", label: "티어 높은 순", sort: "tier", dir: "desc" },
  { value: "tier:asc", label: "티어 낮은 순", sort: "tier", dir: "asc" },
  { value: "kakaoNickname:asc", label: "카톡 닉네임순", sort: "kakaoNickname", dir: "asc" },
];

export function MemberFilters({
  activeFilter,
  query,
  sort,
  dir,
  basePath,
}: {
  activeFilter: MemberFilter;
  query: string;
  sort: MemberSort;
  dir: SortDirection;
  // 이 표가 놓인 페이지("/rift" 또는 "/aram"). 협곡과 칼바람이 같은 표를 쓰므로 고정하면
  // 칼바람에서 필터를 누를 때 협곡으로 넘어간다.
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { filter?: string; q?: string; sort?: string; dir?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.sort !== undefined) params.set("sort", next.sort);
    if (next.dir !== undefined) params.set("dir", next.dir);
    router.push(`${basePath}?${params.toString()}`);
  }

  function onSortSelect(value: string) {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    updateParams({ sort: option.sort, dir: option.dir });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink/[.06] px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          {/* 폰에서는 필터 칩과 정렬 셀렉트가 이미 이 카드 목록의 정체를 말해주므로
              제목을 생략해 세로 공간을 아낀다. */}
          <h2 className="m-0 hidden text-[14.5px] font-bold md:block">전체 회원</h2>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => updateParams({ filter: f.key })}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
                  activeFilter === f.key
                    ? "border-accent/45 bg-accent/[.18] text-accent-soft"
                    : "border-ink/[.09] bg-transparent text-faint"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="md:hidden">
          <SortSelect
            value={SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? SORT_OPTIONS[0].value}
            options={SORT_OPTIONS}
            onChange={onSortSelect}
          />
        </div>
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="실명 · 카톡 · 디코 검색"
        className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent md:w-56"
      />
    </div>
  );
}
```

- [ ] **Step 4: `rift/page.tsx`, `aram/page.tsx` — `MemberFilters`에 `sort`/`dir` 전달, 여백 반응형**

`apps/dashboard/app/rift/page.tsx`에서:

```tsx
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberFilters activeFilter={filter} query={query} basePath="/rift" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/rift" />
        </section>
      </div>
```

→

```tsx
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-6 md:px-7 md:pb-10 md:pt-6">
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberFilters activeFilter={filter} query={query} sort={sort} dir={dir} basePath="/rift" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/rift" />
        </section>
      </div>
```

`apps/dashboard/app/aram/page.tsx`에서(같은 패턴, `basePath="/aram"`):

```tsx
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberFilters activeFilter={filter} query={query} basePath="/aram" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/aram" />
        </section>
      </div>
```

→

```tsx
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-6 md:px-7 md:pb-10 md:pt-6">
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberFilters activeFilter={filter} query={query} sort={sort} dir={dir} basePath="/aram" />
          <MemberTable rows={data.rows} isAdmin={isAdmin} sort={sort} dir={dir} filter={filter} query={query} basePath="/aram" />
        </section>
      </div>
```

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음.

- [ ] **Step 6: 기존 테스트 회귀 확인**

Run: `cd apps/dashboard && npx vitest run lib/queries/members.test.ts`
Expected: 전부 PASS(이 태스크는 쿼리를 건드리지 않으므로 그대로 통과해야 한다).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/MemberCard.tsx apps/dashboard/components/MemberTable.tsx apps/dashboard/components/MemberFilters.tsx apps/dashboard/app/rift/page.tsx apps/dashboard/app/aram/page.tsx
git commit -m "feat(rift,aram): responsive member cards and a mobile sort select

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `/member-info` — `MemberInfoCard` + 표/검색/`StatCard` 반응형

**Files:**
- Create: `apps/dashboard/components/MemberInfoCard.tsx`
- Modify: `apps/dashboard/components/MemberInfoTable.tsx`
- Modify: `apps/dashboard/components/MemberInfoSearch.tsx`
- Modify: `apps/dashboard/components/StatCard.tsx`
- Modify: `apps/dashboard/app/member-info/page.tsx`

**Interfaces:**
- Consumes: `MemberInfoRow`, `ModeRecord`, `MemberInfoSort`, `SortDirection`(전부 `@/lib/queries/member-info`에서), `tierLabel`·`tierScore`(from `@lolpamin/core`), `SortSelect`(from Task 4).
- Produces: `MemberInfoCard({ row: MemberInfoRow; index: number })`.

- [ ] **Step 1: `MemberInfoCard.tsx` 작성**

```tsx
import type { MemberInfoRow, ModeRecord } from "@/lib/queries/member-info";
import { tierLabel, tierScore } from "@lolpamin/core";

function mmrClassName(mmr: number): string {
  if (mmr === 0) return "text-ghost";
  return mmr >= 1600 ? "text-gold" : "text-fg";
}

function winRateLabel(record: ModeRecord): string {
  return record.winRate === null ? "-" : `${record.winRate}%`;
}

function ModeLine({ label, labelClassName, record }: { label: string; labelClassName: string; record: ModeRecord }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className={`w-14 flex-none font-bold ${labelClassName}`}>{label}</span>
      <span className={`flex-1 text-right font-mono font-bold ${mmrClassName(record.mmr)}`}>{record.mmr}</span>
      <span className="w-20 flex-none text-right font-mono text-muted">
        {record.games}판 {record.wins}승 {record.losses}패
      </span>
      <span className="w-10 flex-none text-right font-mono text-faint">{winRateLabel(record)}</span>
    </div>
  );
}

export function MemberInfoCard({ row, index }: { row: MemberInfoRow; index: number }) {
  return (
    <div className="border-b border-ink/[.04] px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="w-6 flex-none font-mono text-[12px] text-ghost">{index + 1}</span>
        <span className={`truncate text-[15px] font-bold ${row.realName === "-" ? "text-ghost" : ""}`}>{row.realName}</span>
        <span className={`ml-auto flex-none text-[12.5px] ${tierScore(row.tier) === 0 ? "text-ghost" : "text-fg-2"}`}>
          {tierLabel(row.tier)}
        </span>
      </div>
      <div className={`truncate pl-8 font-mono text-[12px] ${row.kakaoNickname === "-" ? "text-ghost" : "text-gold"}`}>
        {row.kakaoNickname}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 pl-8">
        <ModeLine label="협곡" labelClassName="text-accent-soft" record={row.rift} />
        <ModeLine label="칼바람" labelClassName="text-orange" record={row.aram} />
      </div>
      {row.note && <div className="mt-1 truncate pl-8 text-[12px] text-faint">비고: {row.note}</div>}
    </div>
  );
}
```

- [ ] **Step 2: `MemberInfoTable.tsx` 수정 — 데스크톱 표를 `hidden md:block`으로, 카드 목록 추가**

`apps/dashboard/components/MemberInfoTable.tsx`에서 import 줄을 찾는다:

```tsx
import Link from "next/link";
import type { MemberInfoRow, MemberInfoSort, ModeRecord, SortDirection } from "@/lib/queries/member-info";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberNoteCell } from "@/components/MemberNoteCell";
```

다음으로 바꾼다:

```tsx
import Link from "next/link";
import type { MemberInfoRow, MemberInfoSort, ModeRecord, SortDirection } from "@/lib/queries/member-info";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberNoteCell } from "@/components/MemberNoteCell";
import { MemberInfoCard } from "@/components/MemberInfoCard";
```

`return (` 다음 줄부터 시작하는 다음 부분을 찾는다:

```tsx
  return (
    <>
      <div
        className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 pt-3 text-[11.5px] font-bold tracking-wide text-ghost`}
      >
```

다음으로 바꾼다(`<>` 다음에 `<div className="hidden md:block">`를 새로 연다):

```tsx
  return (
    <>
      <div className="hidden md:block">
      <div
        className={`grid ${GRID} gap-3 border-b border-ink/[.06] bg-surface-2 px-5 pt-3 text-[11.5px] font-bold tracking-wide text-ghost`}
      >
```

파일 끝의 다음 부분을 찾는다:

```tsx
          <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
          <MemberNoteCell memberId={m.id} note={m.note} isAdmin={isAdmin} />
        </div>
      ))}
    </>
  );
}
```

다음으로 바꾼다(방금 연 `<div className="hidden md:block">`를 닫고, 그 뒤에 폰용 카드 목록을 넣는다):

```tsx
          <MemberTierCell memberId={m.id} tier={m.tier} isAdmin={isAdmin} />
          <MemberNoteCell memberId={m.id} note={m.note} isAdmin={isAdmin} />
        </div>
      ))}
      </div>
      <div className="md:hidden">
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13.5px] text-ghost">조건에 맞는 회원이 없습니다.</div>
        )}
        {rows.map((m, index) => (
          <MemberInfoCard key={m.id} row={m} index={index} />
        ))}
      </div>
    </>
  );
}
```

이 두 지점(시작·끝)만 정확히 바꾸면, 그 사이에 있던 헤더 두 줄·`rows.length === 0` 빈 상태 메시지·`rows.map(...)` 데스크톱 행 블록은 그대로 `hidden md:block` 안에 감싸인 형태가 된다. 들여쓰기가 어긋나 보여도(새 `<div>`를 연 지점의 자식들이 한 단 안 밀림) JSX 동작에는 영향이 없다.

- [ ] **Step 3: `MemberInfoSearch.tsx` 전체 교체**

`apps/dashboard/components/MemberInfoSearch.tsx`의 전체 내용을 다음으로 바꾼다:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberInfoSort, SortDirection } from "@/lib/queries/member-info";
import { SortSelect } from "@/components/SortSelect";

const SORT_OPTIONS: Array<{ value: string; label: string; sort: MemberInfoSort; dir: SortDirection }> = [
  { value: "realName:asc", label: "이름순", sort: "realName", dir: "asc" },
  { value: "tier:desc", label: "티어 높은 순", sort: "tier", dir: "desc" },
  { value: "riftMmr:desc", label: "협곡 MMR 높은 순", sort: "riftMmr", dir: "desc" },
  { value: "riftGames:desc", label: "협곡 판수 많은 순", sort: "riftGames", dir: "desc" },
  { value: "riftWinRate:desc", label: "협곡 승률 높은 순", sort: "riftWinRate", dir: "desc" },
  { value: "aramMmr:desc", label: "칼바람 MMR 높은 순", sort: "aramMmr", dir: "desc" },
  { value: "aramGames:desc", label: "칼바람 판수 많은 순", sort: "aramGames", dir: "desc" },
  { value: "aramWinRate:desc", label: "칼바람 승률 높은 순", sort: "aramWinRate", dir: "desc" },
];

export function MemberInfoSearch({
  query,
  sort,
  dir,
}: {
  query: string;
  sort: MemberInfoSort;
  dir: SortDirection;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { q?: string; sort?: string; dir?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.sort !== undefined) params.set("sort", next.sort);
    if (next.dir !== undefined) params.set("dir", next.dir);
    router.push(`/member-info?${params.toString()}`);
  }

  function onSortSelect(value: string) {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    updateParams({ sort: option.sort, dir: option.dir });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink/[.06] px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <h2 className="m-0 hidden text-[14.5px] font-bold md:block">회원 명부</h2>
      <div className="md:hidden">
        <SortSelect
          value={SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? SORT_OPTIONS[0].value}
          options={SORT_OPTIONS}
          onChange={onSortSelect}
        />
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="이름 · 닉네임 검색"
        className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent md:w-56"
      />
    </div>
  );
}
```

- [ ] **Step 4: `StatCard.tsx` — 아이콘 타일 폰 크기 축소**

`apps/dashboard/components/StatCard.tsx`에서 아이콘 있는 분기를 찾는다:

```tsx
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-ink/[.06] bg-surface px-6 py-5 shadow-[0_1px_2px_rgb(var(--c-ink)/0.04)]">
      <div
        className={`flex h-[72px] w-[72px] flex-none items-center justify-center rounded-2xl bg-accent-tint ${
          iconClassName ?? "text-accent"
        }`}
      >
        <NavIcon name={icon} size={34} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[14px] font-medium text-muted">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[36px] font-extrabold leading-none tracking-tight ${colorClassName}`}>{value}</span>
          <span className="text-[14px] text-faint">{unit}</span>
        </div>
      </div>
    </div>
  );
```

다음으로 바꾼다:

```tsx
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-ink/[.06] bg-surface px-4 py-4 shadow-[0_1px_2px_rgb(var(--c-ink)/0.04)] md:gap-5 md:px-6 md:py-5">
      <div
        className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-accent-tint md:h-[72px] md:w-[72px] ${
          iconClassName ?? "text-accent"
        }`}
      >
        <NavIcon name={icon} size={34} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[13px] font-medium text-muted md:text-[14px]">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[28px] font-extrabold leading-none tracking-tight md:text-[36px] ${colorClassName}`}>
            {value}
          </span>
          <span className="text-[13px] text-faint md:text-[14px]">{unit}</span>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 5: `member-info/page.tsx` 수정 — 여백, `StatCard` 그리드, `MemberInfoSearch` props**

`apps/dashboard/app/member-info/page.tsx`에서 다음 블록을 찾는다:

```tsx
      <div className="flex flex-col gap-6 px-7 pb-10 pt-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="전체 회원" value={summary.totalCount} unit="명" colorClassName="text-fg" icon="users" />
          <StatCard
            label="평균 협곡 MMR"
            value={summary.averageRiftMmr}
            unit="점"
            colorClassName="text-accent-soft"
            icon="swords"
          />
          <StatCard
            label="평균 칼바람 MMR"
            value={summary.averageAramMmr}
            unit="점"
            colorClassName="text-orange"
            icon="snowflake"
            iconClassName="text-orange"
          />
        </div>
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberInfoSearch query={query} />
          <MemberInfoTable rows={rows} isAdmin={currentAdmin !== null} sort={sort} dir={dir} query={query} />
        </section>
      </div>
```

다음으로 바꾼다:

```tsx
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-6 md:px-7 md:pb-10 md:pt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
          <StatCard label="전체 회원" value={summary.totalCount} unit="명" colorClassName="text-fg" icon="users" />
          <StatCard
            label="평균 협곡 MMR"
            value={summary.averageRiftMmr}
            unit="점"
            colorClassName="text-accent-soft"
            icon="swords"
          />
          <StatCard
            label="평균 칼바람 MMR"
            value={summary.averageAramMmr}
            unit="점"
            colorClassName="text-orange"
            icon="snowflake"
            iconClassName="text-orange"
          />
        </div>
        <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <MemberInfoSearch query={query} sort={sort} dir={dir} />
          <MemberInfoTable rows={rows} isAdmin={currentAdmin !== null} sort={sort} dir={dir} query={query} />
        </section>
      </div>
```

- [ ] **Step 6: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음.

- [ ] **Step 7: 기존 테스트 회귀 확인**

Run: `cd apps/dashboard && npx vitest run lib/queries/member-info.test.ts`
Expected: 전부 PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/components/MemberInfoCard.tsx apps/dashboard/components/MemberInfoTable.tsx apps/dashboard/components/MemberInfoSearch.tsx apps/dashboard/components/StatCard.tsx apps/dashboard/app/member-info/page.tsx
git commit -m "feat(member-info): responsive roster cards, sort select, stat tiles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `/inactive` — `InactiveCard` + 표/상단 통계 반응형

**Files:**
- Create: `apps/dashboard/components/InactiveCard.tsx`
- Modify: `apps/dashboard/components/InactiveTable.tsx`
- Modify: `apps/dashboard/app/inactive/page.tsx`

**Interfaces:**
- Consumes: `InactiveRow`(from `@/lib/queries/inactive`), `LONG_INACTIVITY_THRESHOLD_DAYS`(from `@lolpamin/core`).
- Produces: `InactiveCard({ row: InactiveRow })`.

- [ ] **Step 1: `InactiveCard.tsx` 작성**

```tsx
import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export function InactiveCard({ row }: { row: InactiveRow }) {
  const severe = row.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS;
  return (
    <div className="border-b border-ink/[.04] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14.5px] font-bold">{row.name}</span>
        <span className={`flex-none font-mono text-[15px] font-bold ${severe ? "text-danger-soft" : "text-orange"}`}>
          {row.daysSinceActive}일
        </span>
      </div>
      <div className="truncate text-[12.5px] text-muted">{row.kakaoNickname}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-faint">
        <span>마지막 활동 {row.lastActiveDate}</span>
        <span>
          <span className="font-mono font-bold text-fg-2">{row.mmr}</span> · 내전 {row.gameCount}회
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `InactiveTable.tsx` 전체 교체**

`apps/dashboard/components/InactiveTable.tsx`의 전체 내용을 다음으로 바꾼다:

```tsx
import type { InactiveRow } from "@/lib/queries/inactive";
import { LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";
import { InactiveLastActiveCell } from "./InactiveLastActiveCell";
import { InactiveCard } from "./InactiveCard";

// 경과일 바는 남는 폭을 다 먹지 않는다 — 마지막 활동 칸에 date input이 들어가면서
// 바가 짧아져야 행이 한 줄에 남는다.
const COLUMNS = "grid-cols-[186px_164px_minmax(0,1fr)_170px_146px]";

export function InactiveTable({ rows, isAdmin }: { rows: InactiveRow[]; isAdmin: boolean }) {
  const maxDays = Math.max(30, ...rows.map((r) => r.daysSinceActive));

  return (
    <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
      <div className="flex items-center justify-between border-b border-ink/[.06] px-5 py-3">
        <h2 className="m-0 text-[14.5px] font-bold">미활동 회원 · 경과일 순</h2>
        <span className="hidden text-[12px] text-faint md:inline">카카오톡 오픈채팅 @멘션 수집 기준</span>
      </div>
      <div className="hidden md:block">
        <div className={`grid ${COLUMNS} border-b border-ink/[.06] bg-surface-2 px-5 py-2.5 text-[12px] font-bold text-faint`}>
          <div>실명</div>
          <div>카톡 닉네임</div>
          <div>경과일</div>
          <div className="text-right">마지막 활동</div>
          <div className="text-right">MMR / 최근 내전</div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className={`grid ${COLUMNS} items-center border-b border-ink/[.04] px-5 py-3 hover:bg-hover`}>
            <div className="text-[13.5px] font-semibold">{r.name}</div>
            <div className="text-[13px] text-muted">{r.kakaoNickname}</div>
            <div className="flex items-center gap-2.5 pr-6">
              <div className="h-2 max-w-[220px] flex-1 overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((r.daysSinceActive / maxDays) * 100))}%`,
                    background: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "rgb(var(--c-danger-soft))" : "rgb(var(--c-orange))",
                  }}
                />
              </div>
              <span
                className="w-16 text-right font-mono text-[14px] font-bold"
                style={{ color: r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS ? "rgb(var(--c-danger-soft))" : "rgb(var(--c-orange))" }}
              >
                {r.daysSinceActive}일
              </span>
            </div>
            <div className="pl-4">
              <InactiveLastActiveCell memberId={r.id} lastActiveDate={r.lastActiveDate} isAdmin={isAdmin} />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-mono text-[13px] font-bold">{r.mmr}</span>
              <span className="text-[12px] text-faint">내전 {r.gameCount}회</span>
            </div>
          </div>
        ))}
      </div>
      <div className="md:hidden">
        {rows.map((r) => (
          <InactiveCard key={r.id} row={r} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `inactive/page.tsx` 수정 — 여백, 상단 통계 스택**

`apps/dashboard/app/inactive/page.tsx`에서 다음 블록을 찾는다:

```tsx
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="flex items-stretch gap-3">
          <div className="grid flex-1 grid-cols-3 divide-x divide-ink/[.07] rounded-xl border border-orange/25 bg-surface">
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">1주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-orange">
                {data.totalInactive}
                <span className="ml-1 text-[15px] font-medium text-faint">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">2주 이상</span>
              <span className="font-mono text-[30px] font-bold tracking-tight text-danger-soft">
                {data.longInactiveCount}
                <span className="ml-1 text-[15px] font-medium text-faint">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-5 py-4">
              <span className="text-[12px] font-medium text-faint">전체 회원 중 비율</span>
              <span className="font-mono text-[30px] font-bold tracking-tight">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-[300px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-ink/[.1] bg-surface-2 px-4 py-3.5">
            <div className="text-[12.5px] font-bold text-fg-2">확인용 화면입니다</div>
            <div className="text-[12px] leading-relaxed text-faint">
              자동 발송이나 강제 탈퇴 기능은 없습니다. 관리자는 마지막 활동일을 직접 고칠 수
              있습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} isAdmin={isAdmin} />
      </div>
```

다음으로 바꾼다:

```tsx
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:gap-5 md:px-7 md:pb-10 md:pt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div className="grid flex-1 grid-cols-3 divide-x divide-ink/[.07] rounded-xl border border-orange/25 bg-surface">
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">1주 이상 카톡방 멘션 없음</span>
              <span className="font-mono text-[22px] font-bold tracking-tight text-orange md:text-[30px]">
                {data.totalInactive}
                <span className="ml-1 text-[13px] font-medium text-faint md:text-[15px]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">2주 이상</span>
              <span className="font-mono text-[22px] font-bold tracking-tight text-danger-soft md:text-[30px]">
                {data.longInactiveCount}
                <span className="ml-1 text-[13px] font-medium text-faint md:text-[15px]">명</span>
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1 px-3 py-3 md:px-5 md:py-4">
              <span className="text-[11px] font-medium text-faint md:text-[12px]">전체 회원 중 비율</span>
              <span className="font-mono text-[22px] font-bold tracking-tight md:text-[30px]">{data.ratioLabel}</span>
            </div>
          </div>
          <div className="flex w-full flex-col justify-center gap-1.5 rounded-xl border border-dashed border-ink/[.1] bg-surface-2 px-4 py-3.5 md:w-[300px]">
            <div className="text-[12.5px] font-bold text-fg-2">확인용 화면입니다</div>
            <div className="text-[12px] leading-relaxed text-faint">
              자동 발송이나 강제 탈퇴 기능은 없습니다. 관리자는 마지막 활동일을 직접 고칠 수
              있습니다.
            </div>
          </div>
        </div>
        <InactiveTable rows={data.rows} isAdmin={isAdmin} />
      </div>
```

- [ ] **Step 4: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음.

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `cd apps/dashboard && ls lib/queries/inactive.test.ts 2>/dev/null && npx vitest run lib/queries/inactive.test.ts || echo "no test file for inactive — skip"`
Expected: 테스트 파일이 있으면 전부 PASS, 없으면 건너뛴다.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/InactiveCard.tsx apps/dashboard/components/InactiveTable.tsx apps/dashboard/app/inactive/page.tsx
git commit -m "feat(inactive): responsive cards and stacked stat cards on mobile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: 나머지 여백 — 홈, 로그인, 내전 기록

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `apps/dashboard/app/login/page.tsx`
- Modify: `apps/dashboard/components/LoginForm.tsx`
- Modify: `apps/dashboard/app/match-history/page.tsx`
- Modify: `apps/dashboard/components/GameHistoryList.tsx`

**Interfaces:**
- 없음(여백·wrap만 조정, props·타입 변경 없음).

- [ ] **Step 1: 홈 페이지 여백**

`apps/dashboard/app/page.tsx`에서:

```tsx
      <div className="flex flex-col items-center px-7 pb-10 pt-6">
```

→

```tsx
      <div className="flex flex-col items-center px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
```

- [ ] **Step 2: 로그인 페이지 여백 + 폼 폭**

`apps/dashboard/app/login/page.tsx`에서:

```tsx
      <div className="flex px-7 pb-10 pt-6">
```

→

```tsx
      <div className="flex px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
```

`apps/dashboard/components/LoginForm.tsx`에서(320px 고정 폭이 375px 폰에서 페이지 좌우 여백과 합쳐지면 넘칠 수 있으므로 폰에서는 폭을 채우게):

```tsx
    <form action={formAction} className="flex w-[320px] flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
```

→

```tsx
    <form action={formAction} className="flex w-full max-w-[320px] flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
```

- [ ] **Step 3: 내전 기록 페이지 여백 + 필터 줄 wrap**

`apps/dashboard/app/match-history/page.tsx`에서:

```tsx
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <GameHistoryModeFilter mode={history.mode} />
```

→

```tsx
      <div className="flex flex-col gap-4 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GameHistoryModeFilter mode={history.mode} />
```

- [ ] **Step 4: `GameHistoryList` 헤더 줄 wrap**

`apps/dashboard/components/GameHistoryList.tsx`에서:

```tsx
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-muted">{formatPlayedAt(row.playedAt)}</span>
```

→

```tsx
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-mono text-[13px] text-muted">{formatPlayedAt(row.playedAt)}</span>
```

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 새 에러 없음.

- [ ] **Step 6: 기존 테스트 회귀 확인**

Run: `cd apps/dashboard && npx vitest run lib/queries/game-history.test.ts`
Expected: 전부 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/page.tsx apps/dashboard/app/login/page.tsx apps/dashboard/components/LoginForm.tsx apps/dashboard/app/match-history/page.tsx apps/dashboard/components/GameHistoryList.tsx
git commit -m "feat(mobile): responsive padding on home, login and match history

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: 전체 검증 + `CLAUDE.md` 문서화

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- 없음(문서 + 검증).

- [ ] **Step 1: `CLAUDE.md`에 반응형 규칙 추가**

`CLAUDE.md`의 `## Skins` 절 바로 뒤, `## Deployment` 절 바로 앞에 다음 절을 삽입한다:

```markdown
## Mobile

Five read screens plus `/login` (`/`, `/member-info`, `/rift`, `/aram`,
`/match-history`, `/inactive`) work down to a 375px phone; the eight operator
screens (`matches`, `replay-import`, `team-builder`, `kakao-import`,
`link-accounts`, `admins`, `draw/cannon`, `draw/plinko`) show a "PC에서
이용해 주세요" notice below `md` via `AppShell`'s `desktopOnly` prop — the real
content stays in the DOM (`hidden md:block`), so a browser's "desktop site"
mode still reaches it.

One breakpoint, Tailwind's default `md` (768px). Every table component renders
both views in the same server component: the desktop grid wrapped in
`hidden md:block`, and a `md:hidden` card list (`MemberCard`, `MemberInfoCard`,
`InactiveCard`) fed the same `rows`. Sorting is a URL param either way, so a
`SortSelect` on mobile (`components/SortSelect.tsx`, a plain `<select>` encoding
`"sort:dir"`) writes the same `sort`/`dir` query params the desktop header links
do — switching viewport width mid-session never loses the current order.

Navigation is `MobileDrawer`: a client component owning only its own open
state, wrapping the unmodified `SidebarNav` so fold state, groups and the
active-item highlight all carry over unchanged. It stays mounted and slides via
`translate-x` + `motion-safe:` classes rather than conditional mounting, so the
transition actually plays.
```

- [ ] **Step 2: 전체 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: `lib/draw/candidates.test.ts`의 기존 2개 에러 외에 없음.

- [ ] **Step 3: 전체 테스트**

Run:
```bash
cd apps/dashboard && npx vitest run
cd ../../packages/core && npx vitest run
```
Expected: 두 워크스페이스 전부 기존 통과 개수 그대로 PASS(카드/드로어는 로직이 없으므로 테스트 개수는 이 작업 전과 같아야 한다).

- [ ] **Step 4: Playwright 시각 검증 — 개발 서버 기동**

```bash
cd apps/dashboard
npm run dev > /tmp/lolpamin-dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/rift; do sleep 1; done'
```

스크래치패드에 Playwright가 없으면(이전 세션에서 설치한 적이 없으면) 설치한다:

```bash
mkdir -p /tmp/pw-mobile && cd /tmp/pw-mobile
npm init -y >/dev/null 2>&1
npm i playwright@1 --no-audit --no-fund
```

- [ ] **Step 5: 5개 화면 × 3폭 × 2스킨 스크린샷**

`/tmp/pw-mobile/shots.mjs` 작성:

```js
import { chromium } from "playwright";

const PAGES = ["/", "/member-info", "/rift", "/match-history", "/inactive"];
const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];
const THEMES = ["clean", "pink"];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const allErrors = [];

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    page.on("pageerror", (e) => allErrors.push(`${theme}/${size.name}: ${e}`));
    for (const path of PAGES) {
      await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(300);
      const safeName = path === "/" ? "home" : path.slice(1).replace(/\//g, "-");
      await page.screenshot({ path: `${theme}-${size.name}-${safeName}.png` });
    }
    await page.close();
  }
}

console.log("errors:", allErrors);
await browser.close();
```

실행:

```bash
cd /tmp/pw-mobile && MSYS_NO_PATHCONV=1 node shots.mjs
```

Expected: `errors: []`, 30장(5화면 × 3폭 × 2스킨) 생성.

각 스크린샷을 `Read` 도구로 열어 확인한다:
- **phone(375)**: 사이드바 없음, ≡ 버튼 보임, 표 대신 카드, 제목이 잘리지 않음, 좌우 여백이 텍스트를 화면 끝에 붙이지 않음.
- **tablet(768)**: PC 사이드바 레이아웃(≥md이므로), 표가 잘리지 않음.
- **desktop(1280)**: 이 작업 이전과 동일해 보임(회귀 없음) — 특히 `/rift`의 포디움 금·은·동 강조가 그대로인지.

- [ ] **Step 6: 드로어 동작 스크립트**

`/tmp/pw-mobile/drawer.mjs` 작성:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000/rift", { waitUntil: "networkidle" });

console.log("drawer hidden before open:", await page.locator("aside").isVisible());
await page.getByRole("button", { name: "메뉴 열기" }).click();
await page.waitForTimeout(300);
console.log("nav link visible after open:", await page.getByRole("link", { name: "칼바람 MMR 랭킹" }).isVisible());

// 그룹 접기: "회원 · 랭킹" 그룹 헤더를 누르면 하위 링크가 사라진다.
await page.getByRole("button", { name: "회원 · 랭킹" }).click();
await page.waitForTimeout(200);
console.log("nav link hidden after collapse:", !(await page.getByRole("link", { name: "칼바람 MMR 랭킹" }).isVisible()));
await page.getByRole("button", { name: "회원 · 랭킹" }).click();
await page.waitForTimeout(200);

// 링크 클릭 → 닫히고 이동
await page.getByRole("link", { name: "칼바람 MMR 랭킹" }).click();
await page.waitForURL(/\/aram/);
console.log("navigated to /aram:", page.url());

// 다시 열고 ESC로 닫힘 확인
await page.getByRole("button", { name: "메뉴 열기" }).click();
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log("closed via Escape:", !(await page.getByRole("link", { name: "협곡 MMR 랭킹" }).isVisible()));

await browser.close();
```

실행:

```bash
cd /tmp/pw-mobile && MSYS_NO_PATHCONV=1 node drawer.mjs
```

Expected: 다섯 줄 전부 `true`(또는 기대한 URL/불리언) — 하나라도 어긋나면 해당 동작(열기/접기/이동/ESC 닫힘)이 깨진 것이니 관련 태스크(Task 2)로 돌아가 고친다.

- [ ] **Step 7: 정렬 셀렉트 동작 확인**

`/tmp/pw-mobile/sort.mjs` 작성:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000/rift", { waitUntil: "networkidle" });
await page.getByLabel("정렬 기준").selectOption("mmr:asc");
await page.waitForURL(/sort=mmr&dir=asc/);
console.log("url reflects mmr asc:", page.url());

await browser.close();
```

실행:

```bash
cd /tmp/pw-mobile && MSYS_NO_PATHCONV=1 node sort.mjs
```

Expected: URL에 `sort=mmr&dir=asc`가 들어감.

- [ ] **Step 8: `desktopOnly` 안내 확인**

`/tmp/pw-mobile/desktop-only.mjs` 작성:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000/admins", { waitUntil: "networkidle" });
console.log("notice visible:", await page.getByText("이 화면은 PC에서 이용해 주세요").isVisible());
console.log("real content in DOM but hidden:", (await page.locator("text=사이트 스킨").count()) > 0);

await browser.close();
```

(`/admins`는 로그인하지 않은 세션이면 `/login`으로 리다이렉트된다 — 이 경우 "사이트 스킨" 텍스트는 0개가 정상이고, 대신 로그인 폼이 375px에서 잘리지 않는지만 확인하면 된다. 관리자로 로그인한 세션으로 확인하려면 이전 세션들에서 만든 `shotbot` 계정처럼 `apps/dashboard/lib/mutations/admins.ts`의 `createAdmin`으로 임시 계정을 만들어 로그인한 뒤 재방문한다.)

실행:

```bash
cd /tmp/pw-mobile && MSYS_NO_PATHCONV=1 node desktop-only.mjs
```

Expected: `notice visible: true`(로그인 상태) 또는 `/login`으로 리다이렉트되어 폼이 정상 표시(비로그인 상태) — 둘 중 이 세션의 로그인 상태에 맞는 쪽.

- [ ] **Step 9: 개발 서버 종료**

```bash
kill %1 2>/dev/null || true
```

(백그라운드 job이 다른 번호면 `jobs`로 확인 후 해당 PID를 `kill`한다.)

- [ ] **Step 10: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the mobile responsive layout rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Push**

```bash
git push origin main
```
