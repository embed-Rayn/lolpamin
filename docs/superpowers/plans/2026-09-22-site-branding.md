# 사이트 브랜딩(로고 · 홈 배너) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admins`에서 좌상단 로고(SVG 붙여넣기 + 이름/부제)와 홈 화면 배너(데스크톱/모바일)를 관리자가 직접 바꿀 수 있게 한다. 아무것도 저장하지 않으면 지금과 완전히 같게 보인다.

**Architecture:** 기존 `SiteSetting` 싱글턴 테이블(지금은 `theme` 하나만 있음)에 브랜딩 필드 6개를 더한다. 로고 SVG는 저장 시점에 차단목록 방식으로 새니타이즈해 텍스트로 저장하고, 그대로 `dangerouslySetInnerHTML`로 렌더한다. 배너 이미지는 `Bytes` 컬럼에 저장하고 Next.js 라우트 핸들러가 요청마다 DB에서 읽어 서빙한다(값이 없으면 데스크톱→`/banner.png`, 모바일→데스크톱 라우트로 302).

**Tech Stack:** Next.js 14 App Router(서버 액션, 라우트 핸들러), Prisma(Postgres `Bytes`/`Buffer`), React(트랜지션 기반 폼 — 이 코드베이스의 `ThemePanel` 패턴을 그대로 따른다, `useFormState`는 쓰지 않는다).

**Spec:** `docs/superpowers/specs/2026-09-22-site-branding-design.md`

## Global Constraints

- 저장 위치는 Postgres뿐이다(`SiteSetting`). `apps/dashboard/public/`에 런타임으로 파일을 쓰지 않는다 — 이 서버는 배포마다 git 트리로 파일을 통째로 덮어쓰므로 다음 배포에서 사라진다(`CLAUDE.md` Deployment 절).
- 색은 항상 시맨틱 토큰(`bg-surface`, `text-fg-2`, `border-ink/[.09]` 등)만 쓴다. 새 hex 값을 넣지 않는다.
- `logoSvg`는 저장 시점에 딱 한 번 `sanitizeSvg`를 통과시킨다. 렌더할 때 다시 새니타이즈하지 않는다 — 신뢰 경계는 "쓸 때 한 번"으로 정한다(스펙 결정 사항).
- `SiteSetting`은 `theme`과 브랜딩 필드가 같은 행을 공유하는 싱글턴이다. `updatedAt`/`updatedById`도 공유되므로 `/admins`의 "마지막 변경" 라벨은 테마를 바꿔도, 브랜딩을 바꿔도 똑같이 갱신된다 — 어느 쪽을 바꿨는지는 구분하지 않는다. 이건 의도적인 단순화다(Task 9에서 다시 설명).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- 작업 중 `apps/dashboard/lib/queries/members.ts`, `MemberTable.tsx`, `MemberFilters.tsx`, `InactiveTable.tsx`, `app/rift/page.tsx`, `app/aram/page.tsx`, `app/inactive/page.tsx` 등이 이 플랜과 무관하게 디스크에서 바뀌어 있을 수 있다(동시에 진행 중인 다른 작업). 이 플랜은 그 파일들을 전혀 건드리지 않으므로 그대로 두고 신경 쓰지 않는다. `git add`는 각 태스크에서 명시한 파일만 정확히 지정한다 — `git add -A`를 쓰지 않는다.

---

## Task 1: `SiteSetting` 스키마 확장 + 마이그레이션

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260922100000_add_branding_fields/migration.sql`
- Modify: `packages/db/src/test-utils.ts` — 이번엔 수정 없음(`SiteSetting`은 이미 `resetDatabase`가 지운다). 확인만 한다.

**Interfaces:**
- Produces: `SiteSetting` 모델에 `logoSvg`, `siteName`, `siteTagline`, `homeBannerDesktop`, `homeBannerDesktopType`, `homeBannerMobile`, `homeBannerMobileType` 컬럼(전부 nullable).

- [ ] **Step 1: `schema.prisma` 수정**

`packages/db/prisma/schema.prisma`에서 다음을 찾는다:

```prisma
model SiteSetting {
  id          String   @id
  theme       String   @default("clean")
  updatedAt   DateTime @updatedAt
  updatedById String?
}
```

다음으로 바꾼다:

```prisma
model SiteSetting {
  id          String   @id
  theme       String   @default("clean")
  // 로고·홈 배너. 전부 null 허용 — null이면 기본값(게임패드 아이콘, "롤파민",
  // "함께라서 더 즐거운 게임", public/banner.png)을 쓴다. lib/queries/branding.ts가
  // 이 기본값 적용을 맡는다.
  logoSvg               String?
  siteName              String?
  siteTagline           String?
  homeBannerDesktop     Bytes?
  homeBannerDesktopType String?
  homeBannerMobile      Bytes?
  homeBannerMobileType  String?
  updatedAt   DateTime @updatedAt
  updatedById String?
}
```

- [ ] **Step 2: 마이그레이션 SQL 작성**

`packages/db/prisma/migrations/20260922100000_add_branding_fields/migration.sql` 파일을 새로 만든다:

```sql
-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN "logoSvg" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "siteName" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "siteTagline" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerDesktop" BYTEA;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerDesktopType" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerMobile" BYTEA;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerMobileType" TEXT;
```

- [ ] **Step 3: Prisma 클라이언트 재생성 + 개발 DB·테스트 DB에 적용**

```bash
cd packages/db
npx prisma generate
```

레포 루트 `.env`의 `DATABASE_URL`, `DATABASE_URL_TEST`를 각각 써서 적용한다(Windows Git Bash):

```bash
cd packages/db
DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '"\r') npx prisma migrate deploy
DATABASE_URL=$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d= -f2- | tr -d '"\r') npx prisma migrate deploy
```

Expected: 두 명령 모두 `All migrations have been successfully applied.`

- [ ] **Step 4: `resetDatabase`가 이 테이블을 이미 지우는지 확인**

`packages/db/src/test-utils.ts`를 읽는다. `await client.siteSetting.deleteMany();` 줄이 이미 있으면(있어야 한다 — 스킨 기능 때 추가됨) 수정하지 않는다. 없으면 `await client.mmrSetting.deleteMany();` 다음 줄에 추가한다.

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존에 있던 `lib/draw/candidates.test.ts`의 무관한 에러 외에 새 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260922100000_add_branding_fields
git commit -m "feat(db): add branding fields to SiteSetting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: SVG 새니타이저 (`packages/core`)

**Files:**
- Create: `packages/core/src/svg-sanitize.ts`
- Create: `packages/core/src/svg-sanitize.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `sanitizeSvg(raw: string): string | null` — 순수 함수, DB/DOM 의존성 없음.

- [ ] **Step 1: 실패하는 테스트부터 작성**

`packages/core/src/svg-sanitize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./svg-sanitize";

// icon-icons.com에서 실제로 "SVG 복사하기"로 받은 아이콘 — 정상 입력의 대표 사례.
const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><defs><style>.cls-1{fill:url(#linear-gradient);}</style><linearGradient id="linear-gradient" x1="68.51" y1="462.46" x2="443.44" y2="87.53" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ef486c"/><stop offset="1" stop-color="#f98f80"/></linearGradient></defs><g id="ESSENTIAL_UI" data-name="ESSENTIAL UI"><path class="cls-1" d="M378.26,249.34a28.09,28.09,0,0,1-27.33,28.81h-.78a28.08,28.08,0,0,1-.69-56.16h.72A28.09,28.09,0,0,1,378.26,249.34Z"/></g></svg>`;

describe("sanitizeSvg", () => {
  it("passes a normal icon-icons.com SVG through unchanged", () => {
    expect(sanitizeSvg(HEART_ICON)).toBe(HEART_ICON);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeSvg(`  \n${HEART_ICON}\n  `)).toBe(HEART_ICON);
  });

  it("strips a <script> element and its content", () => {
    const withScript = `<svg viewBox="0 0 10 10"><script>alert(1)</script><circle r="5"/></svg>`;
    const out = sanitizeSvg(withScript);
    expect(out).not.toBeNull();
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<circle");
  });

  it("strips onload= and other event handler attributes", () => {
    const withHandler = `<svg viewBox="0 0 10 10" onload="alert(1)"><circle r="5" onclick='steal()'/></svg>`;
    const out = sanitizeSvg(withHandler);
    expect(out).not.toBeNull();
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("steal()");
  });

  it("strips javascript: URIs from href and xlink:href", () => {
    const withJsUri = `<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><circle r="5"/></a><use xlink:href="javascript:alert(2)"/></svg>`;
    const out = sanitizeSvg(withJsUri);
    expect(out).not.toBeNull();
    expect(out).not.toContain("javascript:");
  });

  it("strips <foreignObject> and its content", () => {
    const withForeign = `<svg viewBox="0 0 10 10"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject><circle r="5"/></svg>`;
    const out = sanitizeSvg(withForeign);
    expect(out).not.toBeNull();
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<circle");
  });

  it("strips <iframe> elements", () => {
    const withIframe = `<svg viewBox="0 0 10 10"><iframe src="https://evil.example"></iframe><circle r="5"/></svg>`;
    const out = sanitizeSvg(withIframe);
    expect(out).not.toBeNull();
    expect(out).not.toContain("iframe");
    expect(out).toContain("<circle");
  });

  it("rejects input that isn't an <svg> root", () => {
    expect(sanitizeSvg("<div>not an icon</div>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("   ")).toBeNull();
    expect(sanitizeSvg("just text")).toBeNull();
  });

  it("rejects input over 60,000 characters", () => {
    const huge = `<svg viewBox="0 0 10 10">${"a".repeat(60_000)}</svg>`;
    expect(sanitizeSvg(huge)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/core && npx vitest run src/svg-sanitize.test.ts`
Expected: FAIL — `svg-sanitize.ts` 파일이 없어서 import 에러.

- [ ] **Step 3: 구현 작성**

`packages/core/src/svg-sanitize.ts`:

```ts
const MAX_SVG_LENGTH = 60_000;

// 완전한 XML/DOM 파서가 아니라, 알려진 SVG XSS 벡터를 겨냥한 차단목록이다. 관리자
// 로그인 뒤의 입력이지만, 로고는 로그인 없이도 모든 방문자에게 렌더되는 저장형
// 콘텐츠라 그대로 믿지 않는다(스펙 "결정 사항" 참고).
const WRAPPED_ELEMENTS = ["script", "foreignObject", "iframe", "object"] as const;

export function sanitizeSvg(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SVG_LENGTH) return null;
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return null;

  let out = trimmed;

  // 여는/닫는 태그 쌍과 그 안의 내용을 통째로 제거한다.
  for (const tag of WRAPPED_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  // 자기닫힘 형태(<iframe .../>, <embed .../>)와 닫는 태그가 따로 없는 <embed> 단독형.
  out = out.replace(/<(iframe|embed|object)\b[^>]*\/>/gi, "");
  out = out.replace(/<embed\b[^>]*>/gi, "");

  // 이벤트 핸들러 속성(onload=, onclick= 등). 큰따옴표·작은따옴표·따옴표 없는 값 순서.
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s"'>]+/gi, "");

  // href/xlink:href의 javascript: 스킴만 속성째로 제거한다(값 자체가 아니라 속성을
  // 통째로 없애야 남은 따옴표가 마크업을 깨지 않는다).
  out = out.replace(/\s(?:xlink:href|href)\s*=\s*"javascript:[^"]*"/gi, "");
  out = out.replace(/\s(?:xlink:href|href)\s*=\s*'javascript:[^']*'/gi, "");

  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/core && npx vitest run src/svg-sanitize.test.ts`
Expected: 9개 테스트 전부 PASS.

- [ ] **Step 5: `index.ts`에 export 추가**

`packages/core/src/index.ts` 맨 끝에 추가:

```ts
export * from "./svg-sanitize";
```

- [ ] **Step 6: 전체 core 테스트 회귀 확인**

Run: `cd packages/core && npx vitest run`
Expected: 기존 개수 + 9개, 전부 PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/svg-sanitize.ts packages/core/src/svg-sanitize.test.ts packages/core/src/index.ts
git commit -m "feat(core): add a denylist SVG sanitizer for pasted logos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: 조회·저장 (`lib/queries/branding.ts`, `lib/mutations/set-branding.ts`)

**Files:**
- Create: `apps/dashboard/lib/queries/branding.ts`
- Create: `apps/dashboard/lib/mutations/set-branding.ts`
- Create: `apps/dashboard/lib/mutations/set-branding.test.ts`

**Interfaces:**
- Consumes: `sanitizeSvg`(from `@lolpamin/core`, Task 2), `SITE_SETTING_ID`(from `../queries/site-theme`, 이미 있음).
- Produces: `Branding`(인터페이스), `getBranding(prisma): Promise<Branding>`, `BannerUpload`, `SetBrandingInput`, `SetBrandingValidationError`, `setBranding(prisma, input, adminId): Promise<void>`, 상수 `SITE_NAME_MAX_LENGTH`(40), `SITE_TAGLINE_MAX_LENGTH`(80), `BANNER_MAX_BYTES`(5MB), `ALLOWED_BANNER_TYPES`.

- [ ] **Step 1: `lib/queries/branding.ts` 작성**

```ts
import type { PrismaClient } from "@lolpamin/db";
import { SITE_SETTING_ID } from "./site-theme";

export const DEFAULT_SITE_NAME = "롤파민";
export const DEFAULT_SITE_TAGLINE = "함께라서 더 즐거운 게임";

export interface Branding {
  // 저장 시점에 이미 새니타이즈를 거친 값이다 — 렌더할 때 다시 걸러내지 않는다.
  logoSvg: string | null;
  siteName: string;
  siteTagline: string;
  hasDesktopBanner: boolean;
  hasMobileBanner: boolean;
}

/**
 * 사이드바·드로어·홈 화면이 페이지마다 부르므로 가볍게 유지한다. 배너의 실제
 * 바이트(Bytes 컬럼)는 여기서 가져오지 않고 "있다/없다"만 본다 — *Type 컬럼의
 * null 여부로 판정한다. setBranding이 bytes와 type을 항상 같이 쓰고 같이
 * 지우므로 이 판정이 정확하다.
 */
export async function getBranding(prisma: PrismaClient): Promise<Branding> {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: {
      logoSvg: true,
      siteName: true,
      siteTagline: true,
      homeBannerDesktopType: true,
      homeBannerMobileType: true,
    },
  });
  return {
    logoSvg: row?.logoSvg ?? null,
    siteName: row?.siteName ?? DEFAULT_SITE_NAME,
    siteTagline: row?.siteTagline ?? DEFAULT_SITE_TAGLINE,
    hasDesktopBanner: row?.homeBannerDesktopType != null,
    hasMobileBanner: row?.homeBannerMobileType != null,
  };
}
```

- [ ] **Step 2: `lib/mutations/set-branding.ts` 작성**

```ts
import type { PrismaClient } from "@lolpamin/db";
import { sanitizeSvg } from "@lolpamin/core";
import { SITE_SETTING_ID } from "../queries/site-theme";

export const SITE_NAME_MAX_LENGTH = 40;
export const SITE_TAGLINE_MAX_LENGTH = 80;
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_BANNER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export class SetBrandingValidationError extends Error {}

export interface BannerUpload {
  bytes: Buffer;
  type: string;
}

export interface SetBrandingInput {
  // undefined = 이 필드는 안 건드림. null = 기본값으로 리셋. 값 있음 = 새로 저장.
  logoSvg?: string | null;
  siteName?: string | null;
  siteTagline?: string | null;
  homeBannerDesktop?: BannerUpload | null;
  homeBannerMobile?: BannerUpload | null;
}

function validateBanner(upload: BannerUpload): void {
  if (!ALLOWED_BANNER_TYPES.includes(upload.type)) {
    throw new SetBrandingValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > BANNER_MAX_BYTES) {
    throw new SetBrandingValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }
}

export async function setBranding(
  prisma: PrismaClient,
  input: SetBrandingInput,
  adminId: string | null,
): Promise<void> {
  const data: Record<string, unknown> = { updatedById: adminId };

  if (input.logoSvg !== undefined) {
    if (input.logoSvg === null) {
      data.logoSvg = null;
    } else {
      const sanitized = sanitizeSvg(input.logoSvg);
      if (!sanitized) {
        throw new SetBrandingValidationError("올바른 SVG가 아니거나 허용되지 않는 내용이 포함되어 있습니다.");
      }
      data.logoSvg = sanitized;
    }
  }

  if (input.siteName !== undefined) {
    if (input.siteName !== null && input.siteName.length > SITE_NAME_MAX_LENGTH) {
      throw new SetBrandingValidationError(`이름은 ${SITE_NAME_MAX_LENGTH}자를 넘을 수 없습니다.`);
    }
    data.siteName = input.siteName || null;
  }

  if (input.siteTagline !== undefined) {
    if (input.siteTagline !== null && input.siteTagline.length > SITE_TAGLINE_MAX_LENGTH) {
      throw new SetBrandingValidationError(`부제는 ${SITE_TAGLINE_MAX_LENGTH}자를 넘을 수 없습니다.`);
    }
    data.siteTagline = input.siteTagline || null;
  }

  if (input.homeBannerDesktop !== undefined) {
    if (input.homeBannerDesktop === null) {
      data.homeBannerDesktop = null;
      data.homeBannerDesktopType = null;
    } else {
      validateBanner(input.homeBannerDesktop);
      data.homeBannerDesktop = input.homeBannerDesktop.bytes;
      data.homeBannerDesktopType = input.homeBannerDesktop.type;
    }
  }

  if (input.homeBannerMobile !== undefined) {
    if (input.homeBannerMobile === null) {
      data.homeBannerMobile = null;
      data.homeBannerMobileType = null;
    } else {
      validateBanner(input.homeBannerMobile);
      data.homeBannerMobile = input.homeBannerMobile.bytes;
      data.homeBannerMobileType = input.homeBannerMobile.type;
    }
  }

  await prisma.siteSetting.upsert({
    where: { id: SITE_SETTING_ID },
    create: { id: SITE_SETTING_ID, ...data },
    update: data,
  });
}
```

`SITE_SETTING_ID`는 `branding.ts`가 아니라 `site-theme.ts`가 원래 export하는 곳이다 —
Task 3 Step 1의 `getBranding`도 같은 곳에서 가져왔다. 두 파일 다 하나의 상수를 공유한다.

- [ ] **Step 3: 통합 테스트 작성**

`apps/dashboard/lib/mutations/set-branding.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getBranding } from "../queries/branding";
import {
  ALLOWED_BANNER_TYPES,
  BANNER_MAX_BYTES,
  SetBrandingValidationError,
  SITE_NAME_MAX_LENGTH,
  SITE_TAGLINE_MAX_LENGTH,
  setBranding,
} from "./set-branding";

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

const VALID_SVG = `<svg viewBox="0 0 10 10"><circle r="5"/></svg>`;

describe("getBranding defaults", () => {
  it("returns defaults when nothing has been saved", async () => {
    expect(await getBranding(prisma)).toEqual({
      logoSvg: null,
      siteName: "롤파민",
      siteTagline: "함께라서 더 즐거운 게임",
      hasDesktopBanner: false,
      hasMobileBanner: false,
    });
  });
});

describe("setBranding logo", () => {
  it("sanitizes and round-trips a logo", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG }, "admin-1");
    expect((await getBranding(prisma)).logoSvg).toBe(VALID_SVG);
  });

  it("rejects a non-svg root", async () => {
    await expect(setBranding(prisma, { logoSvg: "<div>nope</div>" }, null)).rejects.toThrow(
      SetBrandingValidationError,
    );
  });

  it("resets to default when logoSvg is set to null", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG }, null);
    await setBranding(prisma, { logoSvg: null }, null);
    expect((await getBranding(prisma)).logoSvg).toBeNull();
  });
});

describe("setBranding name/tagline", () => {
  it("round-trips and empty string resets to default", async () => {
    await setBranding(prisma, { siteName: "테스트팀", siteTagline: "테스트 부제" }, null);
    expect(await getBranding(prisma)).toMatchObject({ siteName: "테스트팀", siteTagline: "테스트 부제" });

    await setBranding(prisma, { siteName: "", siteTagline: "" }, null);
    expect(await getBranding(prisma)).toMatchObject({ siteName: "롤파민", siteTagline: "함께라서 더 즐거운 게임" });
  });

  it("rejects names/taglines over the length cap", async () => {
    await expect(
      setBranding(prisma, { siteName: "a".repeat(SITE_NAME_MAX_LENGTH + 1) }, null),
    ).rejects.toThrow(SetBrandingValidationError);
    await expect(
      setBranding(prisma, { siteTagline: "a".repeat(SITE_TAGLINE_MAX_LENGTH + 1) }, null),
    ).rejects.toThrow(SetBrandingValidationError);
  });
});

describe("setBranding banners", () => {
  const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

  it("stores a banner and reports it present", async () => {
    await setBranding(prisma, { homeBannerDesktop: png }, null);
    expect((await getBranding(prisma)).hasDesktopBanner).toBe(true);
    expect((await getBranding(prisma)).hasMobileBanner).toBe(false);
  });

  it("rejects a disallowed image type", async () => {
    await expect(
      setBranding(prisma, { homeBannerDesktop: { bytes: png.bytes, type: "image/svg+xml" } }, null),
    ).rejects.toThrow(SetBrandingValidationError);
    expect(ALLOWED_BANNER_TYPES).not.toContain("image/svg+xml");
  });

  it("rejects a file over the size cap", async () => {
    const huge = { bytes: Buffer.alloc(BANNER_MAX_BYTES + 1), type: "image/png" };
    await expect(setBranding(prisma, { homeBannerDesktop: huge }, null)).rejects.toThrow(
      SetBrandingValidationError,
    );
  });

  it("resetting one banner leaves the other and other fields untouched", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG, homeBannerDesktop: png, homeBannerMobile: png }, null);
    await setBranding(prisma, { homeBannerDesktop: null }, null);

    const branding = await getBranding(prisma);
    expect(branding.hasDesktopBanner).toBe(false);
    expect(branding.hasMobileBanner).toBe(true);
    expect(branding.logoSvg).toBe(VALID_SVG);
  });
});
```

- [ ] **Step 4: 테스트 실행**

Run: `cd apps/dashboard && npx vitest run lib/mutations/set-branding.test.ts`
Expected: 전부 PASS.

- [ ] **Step 5: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/queries/branding.ts apps/dashboard/lib/mutations/set-branding.ts apps/dashboard/lib/mutations/set-branding.test.ts
git commit -m "feat(admins): branding query and mutation on SiteSetting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: 배너 서빙 라우트

**Files:**
- Create: `apps/dashboard/app/api/branding/banner/desktop/route.ts`
- Create: `apps/dashboard/app/api/branding/banner/mobile/route.ts`

**Interfaces:**
- Consumes: `prisma`(`@/lib/prisma`), `SITE_SETTING_ID`(`@/lib/queries/site-theme`).
- Produces: `GET /api/branding/banner/desktop`, `GET /api/branding/banner/mobile`.

- [ ] **Step 1: 데스크톱 라우트**

`apps/dashboard/app/api/branding/banner/desktop/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";

// 매 요청 DB를 읽는다 — 관리자가 방금 바꾼 배너가 다음 요청에 바로 나와야 한다.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { homeBannerDesktop: true, homeBannerDesktopType: true },
  });

  if (!row?.homeBannerDesktop) {
    // 커스텀 배너가 없으면 저장소에 커밋된 기본 이미지로 넘긴다.
    return NextResponse.redirect(new URL("/banner.png", request.url), 302);
  }

  return new NextResponse(row.homeBannerDesktop, {
    headers: {
      "Content-Type": row.homeBannerDesktopType ?? "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}
```

- [ ] **Step 2: 모바일 라우트**

`apps/dashboard/app/api/branding/banner/mobile/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { homeBannerMobile: true, homeBannerMobileType: true },
  });

  if (!row?.homeBannerMobile) {
    // 모바일 배너를 따로 안 올렸으면 데스크톱 라우트로 넘긴다 — 그쪽이 커스텀이든
    // 기본값이든, 모바일은 그걸 그대로 따라간다("축소해서 보여줌").
    return NextResponse.redirect(new URL("/api/branding/banner/desktop", request.url), 302);
  }

  return new NextResponse(row.homeBannerMobile, {
    headers: {
      "Content-Type": row.homeBannerMobileType ?? "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 4: 개발 서버로 직접 확인**

```bash
cd apps/dashboard
npm run dev &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/; do sleep 1; done'
curl -s -o /dev/null -w "desktop: %{http_code} -> %{redirect_url}\n" http://localhost:3000/api/branding/banner/desktop
curl -s -o /dev/null -w "mobile: %{http_code} -> %{redirect_url}\n" http://localhost:3000/api/branding/banner/mobile
```

Expected: 둘 다 `302`이고, desktop은 `/banner.png`로, mobile은
`/api/branding/banner/desktop`(그게 다시 `/banner.png`로)로 리다이렉트. 아직 아무것도
저장한 적이 없으니 이게 맞다.

- [ ] **Step 5: 서버 종료, Commit**

```bash
kill %1 2>/dev/null || true
git add apps/dashboard/app/api/branding
git commit -m "feat(admins): serve stored banners with a default-image fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `BrandLogo` 컴포넌트

**Files:**
- Create: `apps/dashboard/components/BrandLogo.tsx`

**Interfaces:**
- Consumes: `NavIcon`(from `./nav-icons`, 기존).
- Produces: `BrandLogo({ logoSvg, size }: { logoSvg: string | null; size: number })`.

- [ ] **Step 1: 파일 작성**

```tsx
import { NavIcon } from "./nav-icons";

// logoSvg는 저장 시점에 sanitizeSvg를 이미 통과한 값이다(lib/mutations/set-branding.ts)
// — 여기서 다시 새니타이즈하지 않는다. 색 있는 아이콘 타일(사이드바/드로어가 각자
// 그린다) 안에 들어갈 내용물만 이 컴포넌트가 고른다: 커스텀 SVG가 있으면 그것,
// 없으면 지금까지 쓰던 게임패드 아이콘.
export function BrandLogo({ logoSvg, size }: { logoSvg: string | null; size: number }) {
  if (!logoSvg) return <NavIcon name="gamepad" size={size} />;
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-block [&>svg]:h-full [&>svg]:w-full"
      // eslint-disable-next-line react/no-danger -- 저장 시점에 새니타이즈된 값만 여기 온다.
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음(아직 아무도 `BrandLogo`를 안 쓰지만 export
자체는 에러 없이 컴파일된다).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/components/BrandLogo.tsx
git commit -m "feat(admins): add BrandLogo, the custom-or-default logo renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: 사이드바 · 드로어에 로고/이름/부제 반영

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`
- Modify: `apps/dashboard/components/MobileDrawer.tsx`

**Interfaces:**
- Consumes: `getBranding`(`@/lib/queries/branding`, Task 3), `BrandLogo`(Task 5).
- Produces: `MobileDrawer`의 props에 `logoSvg: string | null`, `siteName: string` 추가(기존 `groups`, `activeNav`는 그대로).

- [ ] **Step 1: `AppShell.tsx` — import 추가**

`apps/dashboard/components/AppShell.tsx`에서:

```tsx
import { getInactiveMembers } from "@lolpamin/core";
import { effectiveKakaoNickname } from "@/lib/queries/inactive";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { HeaderAuth } from "./HeaderAuth";
import { MobileDrawer } from "./MobileDrawer";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

다음으로 바꾼다(`NavIcon`은 그대로 둔다 — `desktopOnly` 안내 카드의 `gear` 아이콘이
이 파일 뒤쪽에서 여전히 그걸 쓴다):

```tsx
import { getInactiveMembers } from "@lolpamin/core";
import { effectiveKakaoNickname } from "@/lib/queries/inactive";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getBranding } from "@/lib/queries/branding";
import { BrandLogo } from "./BrandLogo";
import { HeaderAuth } from "./HeaderAuth";
import { MobileDrawer } from "./MobileDrawer";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

- [ ] **Step 2: `Promise.all`에 `getBranding` 추가**

다음을 찾는다:

```tsx
  const [totalCount, allMembersForInactivity, currentAdmin] = await Promise.all([
    prisma.member.count({ where: { mergedIntoId: null } }),
    prisma.member.findMany({
```

다음으로 바꾼다:

```tsx
  const [totalCount, allMembersForInactivity, currentAdmin, branding] = await Promise.all([
    prisma.member.count({ where: { mergedIntoId: null } }),
    prisma.member.findMany({
```

그리고 같은 `Promise.all` 배열의 마지막 항목(`getCurrentAdmin(),`) 바로 뒤에 한 줄
추가한다. 다음을 찾는다:

```tsx
    getCurrentAdmin(),
  ]);
  const inactiveNavCount = getInactiveMembers(
```

다음으로 바꾼다:

```tsx
    getCurrentAdmin(),
    getBranding(prisma),
  ]);
  const inactiveNavCount = getInactiveMembers(
```

- [ ] **Step 3: 사이드바 로고 블록 교체**

다음을 찾는다:

```tsx
        <Link href="/" className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
            <NavIcon name="gamepad" size={22} />
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[17px] font-extrabold tracking-tight text-fg">롤파민</div>
            <div className="text-[12px] text-faint">함께라서 더 즐거운 게임</div>
          </div>
        </Link>
```

다음으로 바꾼다:

```tsx
        <Link href="/" className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
            <BrandLogo logoSvg={branding.logoSvg} size={22} />
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[17px] font-extrabold tracking-tight text-fg">{branding.siteName}</div>
            <div className="text-[12px] text-faint">{branding.siteTagline}</div>
          </div>
        </Link>
```

- [ ] **Step 4: `MobileDrawer` 호출에 props 전달**

다음을 찾는다:

```tsx
            <MobileDrawer groups={groups} activeNav={activeNav} />
```

다음으로 바꾼다:

```tsx
            <MobileDrawer
              groups={groups}
              activeNav={activeNav}
              logoSvg={branding.logoSvg}
              siteName={branding.siteName}
            />
```

- [ ] **Step 5: `MobileDrawer.tsx` — props와 로고 블록 수정**

`apps/dashboard/components/MobileDrawer.tsx`에서:

```tsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

다음으로 바꾼다:

```tsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "./BrandLogo";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";
```

다음을 찾는다:

```tsx
export function MobileDrawer({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string }) {
```

다음으로 바꾼다:

```tsx
export function MobileDrawer({
  groups,
  activeNav,
  logoSvg,
  siteName,
}: {
  groups: SidebarNavGroup[];
  activeNav: string;
  logoSvg: string | null;
  siteName: string;
}) {
```

다음을 찾는다:

```tsx
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
              <NavIcon name="gamepad" size={20} />
            </div>
            <div className="text-[16px] font-extrabold tracking-tight text-fg">롤파민</div>
```

다음으로 바꾼다:

```tsx
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
              <BrandLogo logoSvg={logoSvg} size={20} />
            </div>
            <div className="text-[16px] font-extrabold tracking-tight text-fg">{siteName}</div>
```

- [ ] **Step 6: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 7: 개발 서버로 시각 확인**

```bash
cd apps/dashboard
npm run dev &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/rift; do sleep 1; done'
```

브라우저(또는 Playwright)로 `/rift`를 열어 사이드바 좌상단이 이전과 완전히 같아
보이는지 확인한다(아직 아무것도 저장하지 않았으므로 게임패드 아이콘 + "롤파민" +
"함께라서 더 즐거운 게임" 그대로여야 한다). 375px 폭에서 ≡ 눌러 드로어도 같은지 확인.

- [ ] **Step 8: 서버 종료, Commit**

```bash
kill %1 2>/dev/null || true
git add apps/dashboard/components/AppShell.tsx apps/dashboard/components/MobileDrawer.tsx
git commit -m "feat(admins): wire saved logo/name/tagline into the sidebar and drawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: 홈 화면 배너 반영

**Files:**
- Modify: `apps/dashboard/app/page.tsx`

**Interfaces:**
- Consumes: `getBranding`(`@/lib/queries/branding`, Task 3), `prisma`(`@/lib/prisma`).

- [ ] **Step 1: `app/page.tsx` 전체 교체**

`apps/dashboard/app/page.tsx`의 전체 내용을 다음으로 바꾼다:

```tsx
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/queries/branding";

// AppShell reads Postgres for the sidebar badge; without this Next bakes a
// build-time snapshot and next start would serve stale rows.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const branding = await getBranding(prisma);

  return (
    <AppShell activeNav="home" pageTitle="롤파민" pageDesc="롤파민 내전 운영 공간">
      <div className="flex flex-col items-center px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        {/* 모바일 배너를 안 올렸으면 /api/branding/banner/mobile이 데스크톱 라우트로
            302 하므로, <source>가 있든 없든 같은 이미지가 뜬다 — "안 올리면 데스크톱을
            축소해서 보여줌"이 별도 분기 없이 여기서 그냥 된다. */}
        <picture>
          <source media="(max-width: 767px)" srcSet="/api/branding/banner/mobile" />
          <img
            src="/api/branding/banner/desktop"
            alt={branding.siteName}
            className="w-full max-w-4xl rounded-xl border border-ink/[.06]"
          />
        </picture>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 3: 개발 서버로 확인**

```bash
cd apps/dashboard
npm run dev &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/; do sleep 1; done'
```

`/`를 열어 배너 이미지가 이전과 같이 나오는지 확인(지금은 항상 `/banner.png`로
리다이렉트되니 그대로 보여야 한다).

- [ ] **Step 4: 서버 종료, Commit**

```bash
kill %1 2>/dev/null || true
git add apps/dashboard/app/page.tsx
git commit -m "feat(admins): serve the home banner through the branding routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: 관리자 서버 액션 (`setBrandingAction`)

**Files:**
- Modify: `apps/dashboard/app/admins/actions.ts`

**Interfaces:**
- Consumes: `setBranding`, `SetBrandingValidationError`(from `@/lib/mutations/set-branding`, Task 3).
- Produces: `setBrandingAction(formData: FormData): Promise<{ error: string | null }>`.

- [ ] **Step 1: import 추가**

`apps/dashboard/app/admins/actions.ts`에서:

```ts
import { setSiteTheme } from "@/lib/mutations/set-site-theme";
```

다음으로 바꾼다:

```ts
import { setSiteTheme } from "@/lib/mutations/set-site-theme";
import { SetBrandingValidationError, setBranding } from "@/lib/mutations/set-branding";
```

- [ ] **Step 2: 파일 끝에 액션 추가**

파일 맨 끝(`setSiteThemeAction` 다음)에 추가:

```ts

// FormData로 받는 이유: 텍스트 필드와 파일 입력(배너 이미지)을 한 폼에서 함께 받는다.
// BrandingPanel이 <form>에서 직접 만든 FormData를 넘긴다.
//
// "기본값으로" 버튼은 그 배너만 리셋한다는 별도 신호(resetDesktop/resetMobile)를
// 같이 보낸다 — 파일 입력이 비어 있는 것("이번엔 안 바꿈")과 명시적 리셋("기본값으로
// 되돌림")은 뜻이 달라서, 파일이 없다고 무조건 리셋하면 안 된다.
async function toBannerUpload(
  entry: FormDataEntryValue | null,
): Promise<{ bytes: Buffer; type: string } | undefined> {
  if (!(entry instanceof File) || entry.size === 0) return undefined;
  return { bytes: Buffer.from(await entry.arrayBuffer()), type: entry.type };
}

export async function setBrandingAction(formData: FormData): Promise<{ error: string | null }> {
  const acting = await requireAdmin();

  const logoSvgRaw = formData.get("logoSvg");
  const siteNameRaw = formData.get("siteName");
  const siteTaglineRaw = formData.get("siteTagline");
  const resetDesktop = formData.get("resetDesktop") === "1";
  const resetMobile = formData.get("resetMobile") === "1";

  try {
    await setBranding(
      prisma,
      {
        logoSvg: typeof logoSvgRaw === "string" && logoSvgRaw.trim() ? logoSvgRaw : null,
        siteName: typeof siteNameRaw === "string" ? siteNameRaw.trim() || null : undefined,
        siteTagline: typeof siteTaglineRaw === "string" ? siteTaglineRaw.trim() || null : undefined,
        homeBannerDesktop: resetDesktop ? null : await toBannerUpload(formData.get("homeBannerDesktop")),
        homeBannerMobile: resetMobile ? null : await toBannerUpload(formData.get("homeBannerMobile")),
      },
      acting.id,
    );
  } catch (error) {
    if (error instanceof SetBrandingValidationError) return { error: error.message };
    return { error: "브랜딩 설정을 저장하지 못했습니다." };
  }

  // 로고·이름은 사이드바/드로어(모든 페이지), 배너는 홈 화면 — 스킨과 같은 이유로
  // layout 단위로 재검증한다.
  revalidatePath("/", "layout");
  return { error: null };
}
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/admins/actions.ts
git commit -m "feat(admins): add the branding save server action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `BrandingPanel` + `/admins` 연결

**Files:**
- Create: `apps/dashboard/components/BrandingPanel.tsx`
- Modify: `apps/dashboard/app/admins/page.tsx`

**Interfaces:**
- Consumes: `Branding`(`@/lib/queries/branding`, Task 3), `BrandLogo`(Task 5), `setBrandingAction`(`@/app/admins/actions`, Task 8).

- [ ] **Step 1: `BrandingPanel.tsx` 작성**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBrandingAction } from "@/app/admins/actions";
import { BrandLogo } from "./BrandLogo";
import type { Branding } from "@/lib/queries/branding";

const GUIDE_URL = "https://icon-icons.com/ko/ui-icons";

export function BrandingPanel({ current, updatedLabel }: { current: Branding; updatedLabel: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    // 어느 버튼을 눌렀는지 폼 하나로는 자동으로 안 실린다 — 누른 버튼의 name/value를
    // 직접 얹는다. 엔터로 제출하면(submitter 없음) 주 저장 버튼을 누른 것과 같다.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);

    setError(null);
    startTransition(async () => {
      const result = await setBrandingAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <div className="flex items-center justify-between border-b border-ink/[.06] px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-bold">브랜딩</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-faint">좌상단 로고와 홈 화면 배너를 바꿉니다.</p>
        </div>
        <div className="text-[12px] text-faint">{updatedLabel ? `마지막 변경 ${updatedLabel}` : "기본값"}</div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="logoSvg" className="text-[13px] font-bold text-fg-2">
              로고 SVG
            </label>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-label="로고 SVG 구하는 방법"
              aria-expanded={showGuide}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-tint text-[11px] font-bold text-accent"
            >
              i
            </button>
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
              <BrandLogo logoSvg={current.logoSvg} size={20} />
            </div>
          </div>
          {showGuide && (
            <div className="rounded-lg border border-ink/[.08] bg-inset p-3 text-[12.5px] leading-relaxed text-fg-2">
              <ol className="m-0 list-decimal pl-4">
                <li>
                  <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-accent-soft underline">
                    icon-icons.com
                  </a>
                  에서 원하는 아이콘을 찾는다.
                </li>
                <li>아이콘 페이지에서 &quot;SVG 복사하기&quot;를 누른다(또는 다운로드해서 파일을 텍스트로 연다).</li>
                <li>복사한 코드를 아래 칸에 그대로 붙여넣고 저장한다.</li>
              </ol>
            </div>
          )}
          <textarea
            id="logoSvg"
            name="logoSvg"
            defaultValue={current.logoSvg ?? ""}
            placeholder="<svg ...>...</svg> — 비워두면 기본 아이콘을 씁니다"
            rows={4}
            className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-2 font-mono text-[12px] text-fg outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteName" className="text-[13px] font-bold text-fg-2">
              사이트 이름
            </label>
            <input
              id="siteName"
              name="siteName"
              defaultValue={current.siteName}
              maxLength={40}
              className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteTagline" className="text-[13px] font-bold text-fg-2">
              부제
            </label>
            <input
              id="siteTagline"
              name="siteTagline"
              defaultValue={current.siteTagline}
              maxLength={80}
              className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-fg-2">홈 배너 · 데스크톱</label>
            {current.hasDesktopBanner ? (
              <img src="/api/branding/banner/desktop" alt="" className="h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12px] text-faint">
                기본 이미지 사용 중
              </div>
            )}
            <input
              type="file"
              name="homeBannerDesktop"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="text-[12px]"
            />
            {current.hasDesktopBanner && (
              <button
                type="submit"
                name="resetDesktop"
                value="1"
                disabled={isPending}
                className="self-start text-[12px] font-semibold text-danger-soft hover:underline disabled:opacity-40"
              >
                기본값으로
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-fg-2">홈 배너 · 모바일</label>
            {current.hasMobileBanner ? (
              <img src="/api/branding/banner/mobile" alt="" className="h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12px] text-faint">
                데스크톱 배너를 그대로 씀
              </div>
            )}
            <input
              type="file"
              name="homeBannerMobile"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="text-[12px]"
            />
            {current.hasMobileBanner && (
              <button
                type="submit"
                name="resetMobile"
                value="1"
                disabled={isPending}
                className="self-start text-[12px] font-semibold text-danger-soft hover:underline disabled:opacity-40"
              >
                기본값으로
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            저장
          </button>
          {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: `/admins/page.tsx` 수정**

`apps/dashboard/app/admins/page.tsx`에서:

```tsx
import { RatingResetPanel } from "@/components/RatingResetPanel";
import { ThemePanel } from "@/components/ThemePanel";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getStoredMmrConfig } from "@/lib/queries/mmr-config";
import { SITE_SETTING_ID, getSiteTheme } from "@/lib/queries/site-theme";
```

다음으로 바꾼다:

```tsx
import { RatingResetPanel } from "@/components/RatingResetPanel";
import { ThemePanel } from "@/components/ThemePanel";
import { BrandingPanel } from "@/components/BrandingPanel";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getBranding } from "@/lib/queries/branding";
import { getStoredMmrConfig } from "@/lib/queries/mmr-config";
import { SITE_SETTING_ID, getSiteTheme } from "@/lib/queries/site-theme";
```

다음을 찾는다:

```tsx
  const [admins, mmrConfig, theme, themeRow] = await Promise.all([
    prisma.admin.findMany({ orderBy: { createdAt: "asc" } }),
    getStoredMmrConfig(prisma),
    getSiteTheme(prisma),
    prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
      select: { updatedAt: true, updatedById: true },
    }),
  ]);
```

다음으로 바꾼다:

```tsx
  const [admins, mmrConfig, theme, themeRow, branding] = await Promise.all([
    prisma.admin.findMany({ orderBy: { createdAt: "asc" } }),
    getStoredMmrConfig(prisma),
    getSiteTheme(prisma),
    prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
      select: { updatedAt: true, updatedById: true },
    }),
    getBranding(prisma),
  ]);
```

다음을 찾는다(`themeUpdatedLabel`은 `SiteSetting`의 같은 행을 보므로 브랜딩 패널에도
그대로 재사용한다 — Global Constraints에 적어둔 대로, 테마를 바꿨는지 로고를 바꿨는지는
이 라벨로 구분하지 않는다):

```tsx
  return (
    <AppShell activeNav="admins" pageTitle="관리자 · 설정" pageDesc="계정, 스킨, MMR 계산식, 시즌 리셋" desktopOnly>
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <ThemePanel current={theme} updatedLabel={themeUpdatedLabel} />
        <AdminPanel rows={rows} />
```

다음으로 바꾼다:

```tsx
  return (
    <AppShell activeNav="admins" pageTitle="관리자 · 설정" pageDesc="계정, 스킨, MMR 계산식, 시즌 리셋" desktopOnly>
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <ThemePanel current={theme} updatedLabel={themeUpdatedLabel} />
        <BrandingPanel current={branding} updatedLabel={themeUpdatedLabel} />
        <AdminPanel rows={rows} />
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 외에 새 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/BrandingPanel.tsx apps/dashboard/app/admins/page.tsx
git commit -m "feat(admins): add the branding panel to /admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: 전체 검증 · 문서화 · 배포

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md`에 브랜딩 규칙 추가**

`CLAUDE.md`의 `## Skins` 절이 끝나는 지점(`## Deployment` 바로 앞, 이전에 추가한
`## Mobile` 절 뒤)에 새 절을 넣는다:

```markdown
## Branding

The sidebar/drawer logo tile's glyph, the site name/tagline next to it, and the
home page banner (desktop + mobile) are admin-editable from `/admins`
(`BrandingPanel`) and stored on the same `SiteSetting` singleton row the skin
lives on — never in `public/`, since this server's deploy replaces the whole
file tree from git each time. All six fields are nullable; null means "use the
built-in default" (`gamepad` icon, "롤파민"/"함께라서 더 즐거운 게임",
`public/banner.png`).

A pasted logo SVG is denylist-sanitized exactly once, at save time
(`sanitizeSvg` in `packages/core`, strips `<script>`, event-handler attributes,
`javascript:` URIs, `<foreignObject>`/`<iframe>`/`<object>`) — it renders site-wide
to every visitor, logged in or not, so a malicious or careless paste from any
admin account is a stored-XSS risk otherwise. `BrandLogo` trusts the stored
value and never re-sanitizes on render.

Banners are `Bytes` columns, served by `/api/branding/banner/{desktop,mobile}`
route handlers that read straight from Postgres on every request. Neither route
404s when nothing is stored: desktop redirects to `/banner.png`, and mobile
redirects to the desktop route — so "no mobile banner" naturally resolves to
"whatever the desktop banner currently is," without a separate code path.
```

- [ ] **Step 2: 전체 타입 확인**

Run: `cd apps/dashboard && npx tsc --noEmit -p .`
Expected: 기존 무관 에러 2개 외에 없음.

- [ ] **Step 3: 전체 테스트**

Run:
```bash
cd apps/dashboard && npx vitest run
cd ../../packages/core && npx vitest run
```
Expected: 두 워크스페이스 전부 기존 통과 개수 + 이번에 추가한 것(core +9, dashboard
+set-branding.test.ts 분량) 만큼 늘어나서 PASS.

- [ ] **Step 4: Playwright로 실제 플로우 확인**

```bash
cd apps/dashboard
npm run dev > /tmp/lolpamin-dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/rift; do sleep 1; done'
```

로그인된 세션이 필요하다 — 이전 세션들에서 쓴 것처럼 `lib/mutations/admins.ts`의
`createAdmin`으로 임시 관리자를 하나 만들고 그 계정으로 로그인한다.

`/tmp/pw-branding/flow.mjs`(Playwright, 이전 세션들에서 쓰던 `chromium.launch({
channel: "msedge", headless: true })` 방식 그대로):

1. `/admins`으로 가서 로고 textarea에 스펙에 있는 하트 아이콘 SVG를 붙여넣고 저장 →
   `/rift`로 가서 사이드바 좌상단이 하트 아이콘으로 바뀌었는지 확인.
2. 사이트 이름을 "테스트팀"으로 바꾸고 저장 → 사이드바에 "테스트팀"이 보이는지 확인.
3. `/admins`에서 로고 textarea를 비우고 저장 → 사이드바가 원래 게임패드 아이콘으로
   돌아오는지 확인.
4. 이름도 원래 값("롤파민")으로 되돌려 저장.

Expected: 네 단계 전부 기대한 대로. 하나라도 어긋나면 관련 태스크로 돌아가 고친다.

- [ ] **Step 5: 개발 서버 종료**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the branding storage and sanitization rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Push**

```bash
git push origin main
```

- [ ] **Step 8: 배포**

레포 루트 `.env`의 `OCI_INSTANCE_*` 값으로(이전 세션들과 같은 3단계):

```bash
git archive main | ssh -i "$KEY" -p "$PORT" "$USER@$IP" 'tar x -C ~/lolpamin'
ssh -i "$KEY" -p "$PORT" "$USER@$IP" 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml build'
ssh -i "$KEY" -p "$PORT" "$USER@$IP" 'cd ~/lolpamin && sudo docker compose -f docker-compose.prod.yml up -d'
```

빌드 로그에 `Type error`/`Failed to compile`이 없는지, `up -d` 뒤
`sudo docker compose -f docker-compose.prod.yml ps`에서 `dashboard-1`이 `Up`인지,
`/rift`·`/admins`(비로그인이면 `/login`으로 307)가 정상 응답하는지 확인한다.
