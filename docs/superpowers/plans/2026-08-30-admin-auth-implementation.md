# Admin Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드에 관리자 로그인을 붙여, 조회는 누구나 하되 데이터를 바꾸는 모든 동작은 로그인한 관리자만 할 수 있게 하고, 관리자가 다른 관리자를 추가할 수 있게 한다.

**Architecture:** `Admin`/`AdminSession` 두 테이블을 추가하고, 비밀번호는 Node 내장 `crypto.scrypt`로 해시한다. 로그인하면 32바이트 랜덤 토큰을 `httpOnly` 쿠키로 굽고 DB에는 그 SHA-256만 저장한다. 데이터를 바꾸는 모든 Next.js 서버 액션은 첫 줄에서 `requireAdmin()`을 호출한다 — UI에서 버튼을 감추는 것은 편의일 뿐 방어선이 아니다.

**Tech Stack:** TypeScript, Next.js 14 App Router(서버 액션, `cookies()`, `instrumentation.ts`), Prisma 5 + PostgreSQL, Vitest(순수 함수 단위 테스트 + `DATABASE_URL_TEST` 대상 통합 테스트), 외부 인증 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-08-30-admin-auth-and-oci-deployment-design.md`

## Global Constraints

- 비밀번호 해시는 Node 내장 `crypto.scrypt`만 사용한다. bcrypt/argon2 등 네이티브 애드온 의존성을 추가하지 않는다 (배포 대상이 ARM64라 컴파일 문제를 피해야 한다).
- scrypt 파라미터는 N=16384, r=8, p=1, 키 길이 64바이트. 저장 형식은 `scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>` 단일 문자열.
- 세션 쿠키 이름은 `lolpamin_session`, `httpOnly`, `sameSite=lax`, `path=/`, 유효기간 7일. `secure`는 환경변수 `COOKIE_SECURE`가 `"true"`일 때만 붙인다 (현재 배포는 평문 HTTP).
- 쿠키에는 랜덤 토큰 원문, DB에는 SHA-256 해시만 저장한다.
- 로그인 실패 메시지는 아이디가 없을 때와 비밀번호가 틀릴 때 모두 `"아이디 또는 비밀번호가 올바르지 않습니다"` 하나로 통일한다.
- 비밀번호 최소 길이 8자, 아이디 최소 길이 3자.
- DB를 건드리는 테스트 파일은 반드시 `DATABASE_URL_TEST` 가드로 시작한다 (`apps/dashboard/lib/mutations/delete-member.test.ts`와 동일한 형태). 이 가드 없이 테스트를 쓰면 개발 DB가 지워진다.
- 기존 회원/전적/멘션 테이블 스키마는 변경하지 않는다.

---

## File Structure

```
.gitignore                                   # 수정: *.key

packages/db/
  prisma/schema.prisma                       # 수정: Admin, AdminSession 모델
  prisma/migrations/<ts>_add_admin_auth/     # 신규 마이그레이션
  src/test-utils.ts                          # 수정: resetDatabase가 admin 테이블도 비움

apps/dashboard/
  lib/auth/
    password.ts                              # 순수: scrypt 해시/검증
    password.test.ts
    session.ts                               # DB: 세션 생성/조회/삭제
    session.test.ts
    current-admin.ts                         # Next 런타임: 쿠키 → Admin, requireAdmin
    current-admin.test.ts
    bootstrap.ts                             # 최초 관리자 1회 생성
    bootstrap.test.ts
  lib/mutations/
    admins.ts                                # createAdmin / deleteAdmin
    admins.test.ts
  instrumentation.ts                         # 기동 시 bootstrap 호출
  next.config.js                             # 수정: instrumentationHook
  app/login/
    actions.ts                               # loginAction / logoutAction
    page.tsx
  app/admins/
    actions.ts                               # createAdminAction / deleteAdminAction
    page.tsx
  app/members/actions.ts                     # 수정: requireAdmin
  app/matches/actions.ts                     # 수정: requireAdmin
  app/link-accounts/actions.ts               # 수정: requireAdmin
  app/kakao-import/actions.ts                # 수정: requireAdmin
  app/*/page.tsx                             # 수정: isAdmin을 자식 컴포넌트로 전달
  lib/auth/action-guards.test.ts             # 모든 변경 액션에 가드가 있는지 검사
  components/
    LoginForm.tsx                            # 신규 client
    AdminPanel.tsx                           # 신규 client: 관리자 추가/삭제
    HeaderAuth.tsx                           # 신규 client: 로그아웃 버튼
    AppShell.tsx                             # 수정: 우상단 로그인 상태, /admins nav
    MemberTable.tsx                          # 수정: isAdmin일 때만 삭제 버튼
    MatchBuilder.tsx                         # 수정: isAdmin
    AccountMappingPanel.tsx                  # 수정: isAdmin
    KakaoImportForm.tsx                      # 수정: isAdmin
```

---

### Task 1: 개인키가 커밋되지 않게 막기

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (독립적인 위생 작업)

- [ ] **Step 1: `.gitignore`에 키 파일 패턴 추가**

`.gitignore` 끝에 다음을 추가한다:

```
# SSH/배포용 개인키 (예: ssh-key-2026-07-09.key)
*.key
*.pem
```

- [ ] **Step 2: 개인키가 무시되는지 확인**

Run: `git status --short --ignored | grep -E '\.key|\.pem'`
Expected: `!! ssh-key-2026-07-09.key` 처럼 무시됨(`!!`)으로 표시된다. `??`(추적되지 않음)로 남아 있으면 안 된다.

- [ ] **Step 3: 커밋**

```bash
git add .gitignore
git commit -m "chore: ignore private key files"
```

---

### Task 2: `Admin` / `AdminSession` 스키마와 마이그레이션

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_admin_auth/migration.sql` (prisma가 생성)
- Modify: `packages/db/src/test-utils.ts`

**Interfaces:**
- Consumes: 없음
- Produces: Prisma 클라이언트의 `prisma.admin`, `prisma.adminSession` 모델. `Admin` 타입은 `{ id: string; username: string; passwordHash: string; createdAt: Date; createdById: string | null }`. 이후 모든 태스크가 이 타입을 쓴다.

- [ ] **Step 1: 스키마에 모델 추가**

`packages/db/prisma/schema.prisma` 파일 맨 끝에 다음을 추가한다:

```prisma
model Admin {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  // 이 관리자를 추가한 관리자의 id. FK가 아니다 — 추가한 사람이 삭제돼도
  // "누가 추가했는지"는 남아야 하고, 화면에서는 조회 실패 시 "삭제된 관리자"로 표시한다.
  createdById  String?

  sessions AdminSession[]
}

model AdminSession {
  id        String   @id @default(uuid())
  tokenHash String   @unique
  adminId   String
  admin     Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: 개발 DB에 마이그레이션 생성·적용**

Run: `cd packages/db && npx prisma migrate dev --name add_admin_auth`
Expected: `packages/db/prisma/migrations/<timestamp>_add_admin_auth/migration.sql`이 생기고, `CREATE TABLE "Admin"` / `CREATE TABLE "AdminSession"`이 들어 있다. Prisma 클라이언트가 자동 재생성된다.

- [ ] **Step 3: 테스트 DB에도 적용**

Run (리포 루트에서):

```bash
DATABASE_URL="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Expected: `1 migration found` / 적용 완료 메시지. 이걸 빼먹으면 이후 통합 테스트가 "table does not exist"로 실패한다.

- [ ] **Step 4: `resetDatabase`가 관리자 테이블도 비우게 수정**

`packages/db/src/test-utils.ts`를 다음으로 바꾼다:

```typescript
import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.adminSession.deleteMany();
  await client.admin.deleteMany();
  await client.gameParticipant.deleteMany();
  await client.gameResult.deleteMany();
  await client.mentionLog.deleteMany();
  await client.member.deleteMany();
}
```

- [ ] **Step 5: 기존 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: 61 tests passed (12 files). 스키마 추가로 깨지는 것이 없어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/test-utils.ts
git commit -m "feat(db): add Admin and AdminSession tables"
```

---

### Task 3: `lib/auth/password.ts` — scrypt 해시와 검증

**Files:**
- Create: `apps/dashboard/lib/auth/password.ts`
- Create: `apps/dashboard/lib/auth/password.test.ts`

**Interfaces:**
- Consumes: Node 내장 `node:crypto`만.
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, stored: string): Promise<boolean>`. Task 5(`admins.ts`)와 Task 8(`loginAction`)이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/dashboard/lib/auth/password.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a different hash each time for the same password", async () => {
    const a = await hashPassword("hunter2hunter2");
    const b = await hashPassword("hunter2hunter2");

    expect(a).not.toBe(b);
  });

  it("produces a string carrying the scrypt parameters", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(stored.split("$")).toHaveLength(6);
  });
});

describe("verifyPassword", () => {
  it("accepts the password that produced the hash", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("hunter2hunter2", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("hunter2hunter3", stored)).toBe(false);
  });

  it("rejects an empty password against a real hash", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("returns false instead of throwing for a malformed stored value", async () => {
    expect(await verifyPassword("hunter2hunter2", "not-a-hash")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "scrypt$16384$8$1$only-five-parts")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "bcrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("returns false when the stored parameters are not numbers", async () => {
    expect(await verifyPassword("hunter2hunter2", "scrypt$abc$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/password.test.ts`
Expected: FAIL — `Failed to load url ./password`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/auth/password.ts`:

```typescript
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
// N=16384, r=8이면 128 * N * r = 16MB가 필요하다. Node 기본 상한(32MB)으로는
// 충분하지만, 저장 문자열이 깨져 큰 값이 들어와도 프로세스를 못 죽이도록 상한을 고정한다.
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(plain, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  })) as Buffer;

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockSizeRaw, parallelizationRaw, saltBase64, keyBase64] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }

  const salt = Buffer.from(saltBase64, "base64");
  const key = Buffer.from(keyBase64, "base64");
  if (salt.length === 0 || key.length === 0) return false;

  try {
    const derived = (await scryptAsync(plain, salt, key.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAX_MEMORY,
    })) as Buffer;
    return timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/password.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/auth/password.ts apps/dashboard/lib/auth/password.test.ts
git commit -m "feat(auth): add scrypt password hashing"
```

---

### Task 4: `lib/auth/session.ts` — 세션 생성·조회·삭제

**Files:**
- Create: `apps/dashboard/lib/auth/session.ts`
- Create: `apps/dashboard/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `Admin` (Task 2).
- Produces:
  - `SESSION_TTL_MS: number` (7일)
  - `createSession(prisma: PrismaClient, adminId: string, now?: Date): Promise<{ token: string; expiresAt: Date }>`
  - `getAdminBySessionToken(prisma: PrismaClient, token: string, now?: Date): Promise<Admin | null>`
  - `destroySession(prisma: PrismaClient, token: string): Promise<void>`

  Task 6(`current-admin.ts`), Task 8(`loginAction`/`logoutAction`)이 쓴다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/auth/session.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { createSession, destroySession, getAdminBySessionToken, SESSION_TTL_MS } from "./session";

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

async function createTestAdmin(username = "admin") {
  return prisma.admin.create({ data: { username, passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==" } });
}

describe("createSession", () => {
  it("returns a token that is not what gets stored in the database", async () => {
    const admin = await createTestAdmin();

    const { token } = await createSession(prisma, admin.id);

    const stored = await prisma.adminSession.findFirstOrThrow();
    expect(token.length).toBeGreaterThan(20);
    expect(stored.tokenHash).not.toBe(token);
  });

  it("expires the session 7 days out", async () => {
    const admin = await createTestAdmin();
    const now = new Date(2026, 7, 30, 12, 0, 0);

    const { expiresAt } = await createSession(prisma, admin.id, now);

    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
  });
});

describe("getAdminBySessionToken", () => {
  it("returns the admin the token belongs to", async () => {
    const admin = await createTestAdmin();
    const { token } = await createSession(prisma, admin.id);

    const found = await getAdminBySessionToken(prisma, token);

    expect(found?.id).toBe(admin.id);
  });

  it("returns null for an unknown token", async () => {
    expect(await getAdminBySessionToken(prisma, "no-such-token")).toBeNull();
  });

  it("returns null for an expired session and deletes the row", async () => {
    const admin = await createTestAdmin();
    const issuedAt = new Date(2026, 7, 1, 12, 0, 0);
    const { token } = await createSession(prisma, admin.id, issuedAt);

    const found = await getAdminBySessionToken(prisma, token, new Date(2026, 7, 30, 12, 0, 0));

    expect(found).toBeNull();
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it("stops working once the admin is deleted", async () => {
    const admin = await createTestAdmin();
    const { token } = await createSession(prisma, admin.id);

    await prisma.admin.delete({ where: { id: admin.id } });

    expect(await getAdminBySessionToken(prisma, token)).toBeNull();
    expect(await prisma.adminSession.count()).toBe(0);
  });
});

describe("destroySession", () => {
  it("removes the session so the token stops working", async () => {
    const admin = await createTestAdmin();
    const { token } = await createSession(prisma, admin.id);

    await destroySession(prisma, token);

    expect(await getAdminBySessionToken(prisma, token)).toBeNull();
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it("does nothing for a token that has no session", async () => {
    await expect(destroySession(prisma, "no-such-token")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/session.test.ts`
Expected: FAIL — `Failed to load url ./session`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/auth/session.ts`:

```typescript
import { createHash, randomBytes } from "node:crypto";
import type { Admin, PrismaClient } from "@lolpamin/db";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 쿠키에는 원문 토큰이, DB에는 이 해시만 들어간다. DB 덤프가 유출돼도
// 그것만으로는 남의 세션 쿠키를 만들어낼 수 없다.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  prisma: PrismaClient,
  adminId: string,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await prisma.adminSession.create({
    data: { tokenHash: hashToken(token), adminId, expiresAt },
  });

  return { token, expiresAt };
}

export async function getAdminBySessionToken(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<Admin | null> {
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  return session.admin;
}

export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/session.test.ts`
Expected: PASS (8 tests). "stops working once the admin is deleted"가 통과하는 것은 `onDelete: Cascade`가 실제로 동작한다는 증거다.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/auth/session.ts apps/dashboard/lib/auth/session.test.ts
git commit -m "feat(auth): add hashed-token admin sessions"
```

---

### Task 5: `lib/mutations/admins.ts` — 관리자 추가·삭제

**Files:**
- Create: `apps/dashboard/lib/mutations/admins.ts`
- Create: `apps/dashboard/lib/mutations/admins.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 3), `PrismaClient`/`Admin` (Task 2).
- Produces:
  - `MIN_USERNAME_LENGTH: number` (3), `MIN_PASSWORD_LENGTH: number` (8)
  - `createAdmin(prisma: PrismaClient, input: { username: string; password: string; createdById: string | null }): Promise<Admin>`
  - `deleteAdmin(prisma: PrismaClient, targetId: string, actingAdminId: string): Promise<void>`

  Task 7(부트스트랩), Task 10(`/admins` 액션)이 쓴다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/mutations/admins.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { verifyPassword } from "@/lib/auth/password";
import { createAdmin, deleteAdmin } from "./admins";

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

describe("createAdmin", () => {
  it("stores a hash that the original password verifies against", async () => {
    const admin = await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });

    expect(admin.username).toBe("sujin");
    expect(admin.passwordHash).not.toContain("hunter2hunter2");
    expect(await verifyPassword("hunter2hunter2", admin.passwordHash)).toBe(true);
  });

  it("records who added the admin", async () => {
    const first = await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });

    const second = await createAdmin(prisma, { username: "minjun", password: "hunter2hunter2", createdById: first.id });

    expect(first.createdById).toBeNull();
    expect(second.createdById).toBe(first.id);
  });

  it("trims surrounding whitespace from the username", async () => {
    const admin = await createAdmin(prisma, { username: "  sujin  ", password: "hunter2hunter2", createdById: null });

    expect(admin.username).toBe("sujin");
  });

  it("rejects a duplicate username", async () => {
    await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });

    await expect(
      createAdmin(prisma, { username: "sujin", password: "otherpassword", createdById: null })
    ).rejects.toThrow("이미 사용 중인 아이디입니다");
  });

  it("rejects a password shorter than 8 characters", async () => {
    await expect(
      createAdmin(prisma, { username: "sujin", password: "short", createdById: null })
    ).rejects.toThrow("비밀번호는 8자 이상");
    expect(await prisma.admin.count()).toBe(0);
  });

  it("rejects a username shorter than 3 characters", async () => {
    await expect(
      createAdmin(prisma, { username: "ab", password: "hunter2hunter2", createdById: null })
    ).rejects.toThrow("아이디는 3자 이상");
  });
});

describe("deleteAdmin", () => {
  it("deletes another admin when more than one exists", async () => {
    const acting = await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });
    const target = await createAdmin(prisma, { username: "minjun", password: "hunter2hunter2", createdById: acting.id });

    await deleteAdmin(prisma, target.id, acting.id);

    const remaining = await prisma.admin.findMany();
    expect(remaining.map((a) => a.username)).toEqual(["sujin"]);
  });

  it("refuses to delete the acting admin", async () => {
    const acting = await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });
    await createAdmin(prisma, { username: "minjun", password: "hunter2hunter2", createdById: acting.id });

    await expect(deleteAdmin(prisma, acting.id, acting.id)).rejects.toThrow("자기 자신");
    expect(await prisma.admin.count()).toBe(2);
  });

  it("refuses to delete the last remaining admin", async () => {
    const only = await createAdmin(prisma, { username: "sujin", password: "hunter2hunter2", createdById: null });
    const other = await createAdmin(prisma, { username: "minjun", password: "hunter2hunter2", createdById: only.id });
    await deleteAdmin(prisma, other.id, only.id);

    await expect(deleteAdmin(prisma, only.id, other.id)).rejects.toThrow("마지막 관리자");
    expect(await prisma.admin.count()).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/admins.test.ts`
Expected: FAIL — `Failed to load url ./admins`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/mutations/admins.ts`:

```typescript
import type { Admin, PrismaClient } from "@lolpamin/db";
import { hashPassword } from "@/lib/auth/password";

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;

export interface CreateAdminInput {
  username: string;
  password: string;
  createdById: string | null;
}

export async function createAdmin(prisma: PrismaClient, input: CreateAdminInput): Promise<Admin> {
  const username = input.username.trim();

  if (username.length < MIN_USERNAME_LENGTH) {
    throw new Error(`아이디는 ${MIN_USERNAME_LENGTH}자 이상이어야 합니다`);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`);
  }

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) {
    throw new Error("이미 사용 중인 아이디입니다");
  }

  return prisma.admin.create({
    data: {
      username,
      passwordHash: await hashPassword(input.password),
      createdById: input.createdById,
    },
  });
}

export async function deleteAdmin(
  prisma: PrismaClient,
  targetId: string,
  actingAdminId: string
): Promise<void> {
  if (targetId === actingAdminId) {
    throw new Error("자기 자신은 삭제할 수 없습니다");
  }

  const total = await prisma.admin.count();
  if (total <= 1) {
    throw new Error("마지막 관리자는 삭제할 수 없습니다");
  }

  await prisma.admin.delete({ where: { id: targetId } });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/mutations/admins.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/mutations/admins.ts apps/dashboard/lib/mutations/admins.test.ts
git commit -m "feat(auth): add createAdmin and deleteAdmin mutations"
```

---

### Task 6: `lib/auth/current-admin.ts` — 쿠키에서 현재 관리자 읽기

**Files:**
- Create: `apps/dashboard/lib/auth/current-admin.ts`
- Create: `apps/dashboard/lib/auth/current-admin.test.ts`

**Interfaces:**
- Consumes: `getAdminBySessionToken` (Task 4), `prisma` from `@/lib/prisma`, `cookies` from `next/headers`.
- Produces:
  - `SESSION_COOKIE_NAME: string` (`"lolpamin_session"`)
  - `sessionCookieOptions(expiresAt: Date): { httpOnly: true; sameSite: "lax"; path: string; secure: boolean; expires: Date }`
  - `getCurrentAdmin(): Promise<Admin | null>`
  - `requireAdmin(): Promise<Admin>` — 비로그인이면 `Error("관리자 로그인이 필요합니다")`

  Task 8~11 전부가 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`next/headers`의 `cookies()`는 Next 런타임 밖에서는 동작하지 않으므로 이 테스트에서만 모킹한다. DB는 실제 테스트 DB를 쓴다.

`apps/dashboard/lib/auth/current-admin.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { createSession } from "./session";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// current-admin.ts는 앱 싱글턴 prisma를 임포트한다. 테스트에서는 테스트 DB를
// 보는 클라이언트로 바꿔치기한다. cookies()는 Next 런타임 밖에서 동작하지 않아
// 모킹이 불가피하다 — 이 두 개가 이 파일에서 유일하게 모킹하는 대상이다.
const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "lolpamin_session" && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getCurrentAdmin, requireAdmin, SESSION_COOKIE_NAME, sessionCookieOptions } = await import("./current-admin");

beforeEach(async () => {
  await resetDatabase(prisma);
  cookieStore.value = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createTestAdmin() {
  return prisma.admin.create({
    data: { username: "sujin", passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==" },
  });
}

describe("getCurrentAdmin", () => {
  it("returns null when no session cookie is present", async () => {
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("returns null when the cookie holds an unknown token", async () => {
    cookieStore.value = "no-such-token";

    expect(await getCurrentAdmin()).toBeNull();
  });

  it("returns the admin the cookie's session belongs to", async () => {
    const admin = await createTestAdmin();
    const { token } = await createSession(prisma, admin.id);
    cookieStore.value = token;

    const found = await getCurrentAdmin();

    expect(found?.username).toBe("sujin");
  });
});

describe("requireAdmin", () => {
  it("throws when there is no session", async () => {
    await expect(requireAdmin()).rejects.toThrow("관리자 로그인이 필요합니다");
  });

  it("returns the admin when there is one", async () => {
    const admin = await createTestAdmin();
    const { token } = await createSession(prisma, admin.id);
    cookieStore.value = token;

    expect((await requireAdmin()).id).toBe(admin.id);
  });
});

describe("sessionCookieOptions", () => {
  it("marks the cookie httpOnly and lax", () => {
    const options = sessionCookieOptions(new Date(2026, 8, 6));

    expect(SESSION_COOKIE_NAME).toBe("lolpamin_session");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("only sets secure when COOKIE_SECURE is true", () => {
    const previous = process.env.COOKIE_SECURE;

    process.env.COOKIE_SECURE = "false";
    expect(sessionCookieOptions(new Date()).secure).toBe(false);

    process.env.COOKIE_SECURE = "true";
    expect(sessionCookieOptions(new Date()).secure).toBe(true);

    process.env.COOKIE_SECURE = previous;
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/current-admin.test.ts`
Expected: FAIL — `Failed to load url ./current-admin`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/auth/current-admin.ts`:

```typescript
import { cookies } from "next/headers";
import type { Admin } from "@lolpamin/db";
import { prisma } from "@/lib/prisma";
import { getAdminBySessionToken } from "./session";

export const SESSION_COOKIE_NAME = "lolpamin_session";

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    // 현재 배포는 평문 HTTP다. HTTPS로 올릴 때 COOKIE_SECURE=true로 켠다.
    secure: process.env.COOKIE_SECURE === "true",
    expires: expiresAt,
  };
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getAdminBySessionToken(prisma, token);
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("관리자 로그인이 필요합니다");
  }
  return admin;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/current-admin.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/lib/auth/current-admin.ts apps/dashboard/lib/auth/current-admin.test.ts
git commit -m "feat(auth): read the current admin from the session cookie"
```

---

### Task 7: `lib/auth/bootstrap.ts` — 최초 관리자 1회 생성

**Files:**
- Create: `apps/dashboard/lib/auth/bootstrap.ts`
- Create: `apps/dashboard/lib/auth/bootstrap.test.ts`
- Create: `apps/dashboard/instrumentation.ts`
- Modify: `apps/dashboard/next.config.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createAdmin` (Task 5).
- Produces: `ensureBootstrapAdmin(prisma: PrismaClient, env?: NodeJS.ProcessEnv): Promise<"created" | "skipped">`.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`apps/dashboard/lib/auth/bootstrap.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { verifyPassword } from "./password";
import { ensureBootstrapAdmin } from "./bootstrap";

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

describe("ensureBootstrapAdmin", () => {
  it("creates the first admin from the environment when there are none", async () => {
    const result = await ensureBootstrapAdmin(prisma, {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "hunter2hunter2",
    } as NodeJS.ProcessEnv);

    expect(result).toBe("created");
    const admin = await prisma.admin.findUniqueOrThrow({ where: { username: "sujin" } });
    expect(admin.createdById).toBeNull();
    expect(await verifyPassword("hunter2hunter2", admin.passwordHash)).toBe(true);
  });

  it("does nothing when an admin already exists", async () => {
    await prisma.admin.create({
      data: { username: "existing", passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==" },
    });

    const result = await ensureBootstrapAdmin(prisma, {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "hunter2hunter2",
    } as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(1);
  });

  it("does nothing when the environment variables are absent", async () => {
    const result = await ensureBootstrapAdmin(prisma, {} as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(0);
  });

  it("does not create an admin when the bootstrap password is too short", async () => {
    const result = await ensureBootstrapAdmin(prisma, {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "short",
    } as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/bootstrap.test.ts`
Expected: FAIL — `Failed to load url ./bootstrap`

- [ ] **Step 3: 구현 작성**

`apps/dashboard/lib/auth/bootstrap.ts`:

```typescript
import type { PrismaClient } from "@lolpamin/db";
import { createAdmin } from "@/lib/mutations/admins";

// 배포 직후 로그인할 계정이 하나도 없는 상태를 벗어나기 위한 1회성 경로다.
// 관리자가 한 명이라도 있으면 아무 것도 하지 않으므로, 환경변수를 지우지 않아도
// 기존 계정을 덮어쓰지는 않는다. 그래도 부트스트랩 후에는 지우는 것을 권한다.
export async function ensureBootstrapAdmin(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env
): Promise<"created" | "skipped"> {
  const username = env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!username || !password) return "skipped";

  if ((await prisma.admin.count()) > 0) return "skipped";

  try {
    await createAdmin(prisma, { username, password, createdById: null });
    console.log(`[bootstrap] 최초 관리자 "${username}" 생성됨`);
    return "created";
  } catch (error) {
    // 동시에 두 프로세스가 시도하면 username unique 제약이 두 번째를 막는다.
    // 그 경우에도 기동은 계속돼야 한다.
    console.error("[bootstrap] 최초 관리자 생성 실패:", error);
    return "skipped";
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/bootstrap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 기동 시 호출되도록 연결**

`apps/dashboard/instrumentation.ts` (신규):

```typescript
export async function register(): Promise<void> {
  // edge 런타임에서는 Prisma를 쓸 수 없다. Node 런타임에서만 실행한다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { prisma } = await import("@/lib/prisma");
  const { ensureBootstrapAdmin } = await import("@/lib/auth/bootstrap");
  await ensureBootstrapAdmin(prisma);
}
```

`apps/dashboard/next.config.js`의 `experimental` 블록에 `instrumentationHook: true`를 추가한다:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lolpamin/core", "@lolpamin/db"],
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

module.exports = nextConfig;
```

- [ ] **Step 6: `.env.example`에 부트스트랩 변수 문서화**

`.env.example` 끝에 추가한다:

```
# 최초 관리자 1회 생성용. Admin 테이블이 비어 있을 때만 동작한다.
# 로그인이 되는 것을 확인한 뒤에는 두 줄을 지운다.
ADMIN_BOOTSTRAP_USERNAME=""
ADMIN_BOOTSTRAP_PASSWORD=""

# HTTPS로 서비스할 때만 "true". 평문 HTTP에서 켜면 쿠키가 전송되지 않아 로그인이 안 된다.
COOKIE_SECURE="false"
```

- [ ] **Step 7: 실제로 부트스트랩이 동작하는지 확인**

로컬 `.env`에 `ADMIN_BOOTSTRAP_USERNAME="admin"`, `ADMIN_BOOTSTRAP_PASSWORD="lolpamin-admin"`을 넣고:

Run: `npm run dev --workspace=dashboard`
Expected: 콘솔에 `[bootstrap] 최초 관리자 "admin" 생성됨`이 찍힌다.

Run: `docker exec dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin -c 'SELECT username, "createdById" FROM "Admin";'`
Expected: `admin | (null)` 한 행.

서버를 껐다 다시 켜도 두 번째 줄은 찍히지 않는다(이미 관리자가 있으므로).

- [ ] **Step 8: 커밋**

```bash
git add apps/dashboard/lib/auth/bootstrap.ts apps/dashboard/lib/auth/bootstrap.test.ts apps/dashboard/instrumentation.ts apps/dashboard/next.config.js .env.example
git commit -m "feat(auth): create the first admin from the environment on boot"
```

---

### Task 8: 로그인·로그아웃

**Files:**
- Create: `apps/dashboard/app/login/actions.ts`
- Create: `apps/dashboard/app/login/page.tsx`
- Create: `apps/dashboard/components/LoginForm.tsx`

**Interfaces:**
- Consumes: `verifyPassword` (Task 3), `createSession`/`destroySession` (Task 4), `SESSION_COOKIE_NAME`/`sessionCookieOptions`/`getCurrentAdmin` (Task 6).
- Produces:
  - `loginAction(prevState: LoginFormState, formData: FormData): Promise<LoginFormState>` — `LoginFormState = { error: string | null }`
  - `logoutAction(): Promise<void>`

  Task 11(헤더)이 `logoutAction`을 쓴다.

- [ ] **Step 1: 서버 액션 작성**

`apps/dashboard/app/login/actions.ts`:

```typescript
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/current-admin";

export interface LoginFormState {
  error: string | null;
}

const INVALID_CREDENTIALS = "아이디 또는 비밀번호가 올바르지 않습니다";

// 존재하지 않는 아이디로 로그인을 시도할 때도 같은 비용의 해시 검증을 수행한다.
// 그러지 않으면 응답 시간 차이로 어떤 아이디가 실재하는지 알아낼 수 있다.
const dummyHashPromise = hashPassword("dummy-password-for-timing-equalization");

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: INVALID_CREDENTIALS };
  }

  const admin = await prisma.admin.findUnique({ where: { username } });
  const passwordHash = admin?.passwordHash ?? (await dummyHashPromise);
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!admin || !passwordMatches) {
    return { error: INVALID_CREDENTIALS };
  }

  const { token, expiresAt } = await createSession(prisma, admin.id);
  cookies().set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

  redirect("/members");
}

export async function logoutAction(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(prisma, token);
  }
  cookies().delete(SESSION_COOKIE_NAME);
  redirect("/members");
}
```

- [ ] **Step 2: 로그인 폼 컴포넌트 작성**

`apps/dashboard/components/LoginForm.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginFormState } from "@/app/login/actions";

const initialState: LoginFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-[12.5px] font-extrabold ${
        pending ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#4472C4] text-white"
      }`}
    >
      {pending ? "확인 중..." : "로그인"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="flex w-[320px] flex-col gap-3 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
      <div className="text-[12.5px] font-bold">관리자 로그인</div>
      <input
        name="username"
        autoComplete="username"
        placeholder="아이디"
        className="rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        className="rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
      />
      {state.error && (
        <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[11px] text-[#EE8B8B]">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
```

- [ ] **Step 3: 로그인 페이지 작성**

`apps/dashboard/app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function LoginPage() {
  if (await getCurrentAdmin()) {
    redirect("/members");
  }

  return (
    <AppShell activeNav="members" pageTitle="관리자 로그인" pageDesc="데이터를 변경하려면 로그인이 필요합니다">
      <div className="flex px-7 pb-10 pt-6">
        <LoginForm />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: 타입체크와 빌드 확인**

Run: `npx tsc --noEmit --project apps/dashboard/tsconfig.json`
Expected: 에러 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공. 라우트 목록에 `/login`이 나타난다.

- [ ] **Step 5: 로그인·로그아웃 수동 확인**

Run: `npm run dev --workspace=dashboard`

브라우저에서 `/login`:
- 틀린 비밀번호 → "아이디 또는 비밀번호가 올바르지 않습니다"
- 없는 아이디 → 같은 문구 (계정 존재 여부가 드러나지 않는다)
- 맞는 자격증명 → `/members`로 이동

Run: `docker exec dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin -c 'SELECT count(*) FROM "AdminSession";'`
Expected: 로그인 성공 후 1행.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/app/login apps/dashboard/components/LoginForm.tsx
git commit -m "feat(auth): add admin login and logout"
```

---

### Task 9: 모든 변경 액션에 권한 검사 적용

이 태스크가 이 계획의 핵심이다. 서버 액션은 브라우저에서 직접 호출할 수 있으므로, 버튼을 감추는 것만으로는 아무 것도 막히지 않는다.

**Files:**
- Modify: `apps/dashboard/app/members/actions.ts`
- Modify: `apps/dashboard/app/matches/actions.ts`
- Modify: `apps/dashboard/app/link-accounts/actions.ts`
- Modify: `apps/dashboard/app/kakao-import/actions.ts`
- Create: `apps/dashboard/lib/auth/action-guards.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 6).
- Produces: 없음 (기존 액션의 동작만 조인다).

- [ ] **Step 1: 가드 누락을 잡는 테스트 작성**

이 테스트는 액션 파일의 소스를 직접 읽어 검사한다. 앞으로 새 변경 액션이 추가될 때 가드를 빠뜨리면 이 테스트가 실패한다.

`apps/dashboard/lib/auth/action-guards.test.ts`:

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 인증 없이 호출될 수 있어야 하는 액션. 여기에 이름을 추가하는 것은
// "이 액션은 누구나 호출해도 안전하다"는 명시적 선언이다.
const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction"]);

const APP_DIR = join(__dirname, "..", "..", "app");

function findActionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return findActionFiles(full);
    return entry.name === "actions.ts" ? [full] : [];
  });
}

const actionFiles = findActionFiles(APP_DIR);

describe("server action guards", () => {
  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(actionFiles)("every exported action in %s calls requireAdmin", (file) => {
    const source = readFileSync(file, "utf-8");
    const actionNames = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);

    for (const name of actionNames) {
      if (PUBLIC_ACTIONS.has(name)) continue;

      const body = source.slice(source.indexOf(`export async function ${name}`));
      const bodyUntilNextExport = body.slice(0, body.indexOf("\nexport ", 1) === -1 ? undefined : body.indexOf("\nexport ", 1));

      expect(bodyUntilNextExport, `${name} in ${file} must call requireAdmin()`).toContain("requireAdmin()");
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/action-guards.test.ts`
Expected: FAIL — `deleteMemberAction in .../members/actions.ts must call requireAdmin()` (그리고 나머지 액션도 같은 이유로 실패)

- [ ] **Step 3: 네 개 액션 파일에 가드 추가**

`apps/dashboard/app/members/actions.ts` — `deleteMemberAction` 본문 첫 줄:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { deleteMember, type DeleteMemberOutput } from "@/lib/mutations/delete-member";

export async function deleteMemberAction(memberId: string): Promise<DeleteMemberOutput> {
  await requireAdmin();
  if (!memberId) {
    throw new Error("memberId is required");
  }
  const result = await deleteMember(prisma, memberId);
  revalidatePath("/members");
  revalidatePath("/inactive");
  revalidatePath("/link-accounts");
  revalidatePath("/matches");
  return result;
}
```

`apps/dashboard/app/matches/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { saveGameResult, type SaveGameResultInput } from "@/lib/mutations/save-game-result";

export async function saveGameResultAction(input: SaveGameResultInput) {
  await requireAdmin();
  const result = await saveGameResult(prisma, input);
  revalidatePath("/matches");
  revalidatePath("/members");
  return result;
}
```

`apps/dashboard/app/link-accounts/actions.ts` — `linkMembersAction`의 첫 줄에 `await requireAdmin();`를 넣는다(나머지 본문은 그대로).

`apps/dashboard/app/kakao-import/actions.ts` — `importKakaoExportAction`의 첫 줄에 `await requireAdmin();`를 넣는다(나머지 본문은 그대로).

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/action-guards.test.ts`
Expected: PASS

- [ ] **Step 5: 비로그인 상태에서 실제로 막히는지 수동 확인**

Run: `npm run dev --workspace=dashboard`

브라우저에서 로그아웃한 상태로 `/members`를 열고, 개발자 도구 콘솔에서 회원 삭제 버튼을 클릭했을 때와 같은 요청이 실패하는지 본다. 가장 확실한 확인 방법은 Task 11에서 버튼을 감추기 전인 지금, 로그아웃 상태로 삭제 버튼을 눌러보는 것이다.
Expected: 회원이 삭제되지 않고 버튼 아래에 "관리자 로그인이 필요합니다"가 표시된다.

Run: `docker exec dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin -c 'SELECT count(*) FROM "Member";'`
Expected: 클릭 전과 같은 수.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/app/members/actions.ts apps/dashboard/app/matches/actions.ts apps/dashboard/app/link-accounts/actions.ts apps/dashboard/app/kakao-import/actions.ts apps/dashboard/lib/auth/action-guards.test.ts
git commit -m "feat(auth): require an admin session for every mutating action"
```

---

### Task 10: `/admins` — 관리자 목록·추가·삭제

**Files:**
- Create: `apps/dashboard/app/admins/actions.ts`
- Create: `apps/dashboard/app/admins/page.tsx`
- Create: `apps/dashboard/components/AdminPanel.tsx`

**Interfaces:**
- Consumes: `createAdmin`/`deleteAdmin` (Task 5), `requireAdmin`/`getCurrentAdmin` (Task 6).
- Produces:
  - `createAdminAction(formData: FormData): Promise<{ error: string | null }>`
  - `deleteAdminAction(targetId: string): Promise<{ error: string | null }>`

- [ ] **Step 1: 서버 액션 작성**

`apps/dashboard/app/admins/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createAdmin, deleteAdmin } from "@/lib/mutations/admins";

export async function createAdminAction(formData: FormData): Promise<{ error: string | null }> {
  const acting = await requireAdmin();

  try {
    await createAdmin(prisma, {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      createdById: acting.id,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "관리자를 추가하지 못했습니다" };
  }

  revalidatePath("/admins");
  return { error: null };
}

export async function deleteAdminAction(targetId: string): Promise<{ error: string | null }> {
  const acting = await requireAdmin();

  try {
    await deleteAdmin(prisma, targetId, acting.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "관리자를 삭제하지 못했습니다" };
  }

  revalidatePath("/admins");
  return { error: null };
}
```

- [ ] **Step 2: 관리자 패널 컴포넌트 작성**

`apps/dashboard/components/AdminPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminAction, deleteAdminAction } from "@/app/admins/actions";

export interface AdminRow {
  id: string;
  username: string;
  createdByLabel: string;
  createdAtLabel: string;
  isSelf: boolean;
}

export function AdminPanel({ rows }: { rows: AdminRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAdminAction(formData);
      setError(result.error);
      router.refresh();
    });
  }

  function handleDelete(row: AdminRow) {
    if (!window.confirm(`'${row.username}' 관리자를 삭제합니다. 이 계정의 로그인 세션도 함께 끊깁니다.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAdminAction(row.id);
      setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={handleCreate} className="flex flex-col gap-3 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="text-[12.5px] font-bold">관리자 추가</div>
        <div className="flex gap-2">
          <input
            name="username"
            placeholder="아이디 (3자 이상)"
            className="w-[200px] rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="비밀번호 (8자 이상)"
            className="w-[200px] rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg px-4 py-2 text-[12.5px] font-extrabold ${
              isPending ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#70AD47] text-[#0E1117]"
            }`}
          >
            추가
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[11px] text-[#EE8B8B]">
            {error}
          </div>
        )}
      </form>

      <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="grid grid-cols-[1fr_1fr_1fr_72px] gap-4 border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[11.5px] font-bold tracking-wide text-[#6E7889]">
          <div>아이디</div>
          <div>추가한 관리자</div>
          <div>생성일</div>
          <div className="text-right">관리</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_1fr_1fr_72px] items-center gap-4 border-b border-white/[.04] px-5 py-3.5 text-[14px]"
          >
            <div className="truncate font-semibold">
              {row.username}
              {row.isSelf && <span className="ml-2 text-[10.5px] text-[#6E7889]">(나)</span>}
            </div>
            <div className="truncate text-[12.5px] text-[#8A94A6]">{row.createdByLabel}</div>
            <div className="font-mono text-[12.5px] text-[#8A94A6]">{row.createdAtLabel}</div>
            <div className="flex justify-end">
              {!row.isSelf && (
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  disabled={isPending}
                  className="cursor-pointer rounded-md border border-[#E05A5A]/30 px-2 py-1 text-[11px] font-bold text-[#EE8B8B] hover:bg-[#E05A5A]/[.12]"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 페이지 작성**

`apps/dashboard/app/admins/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdminPanel, type AdminRow } from "@/components/AdminPanel";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function AdminsPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  const byId = new Map(admins.map((a) => [a.id, a.username]));

  const rows: AdminRow[] = admins.map((admin) => ({
    id: admin.id,
    username: admin.username,
    createdByLabel: admin.createdById
      ? byId.get(admin.createdById) ?? "삭제된 관리자"
      : "최초 관리자",
    createdAtLabel: admin.createdAt.toISOString().slice(0, 10),
    isSelf: admin.id === currentAdmin.id,
  }));

  return (
    <AppShell activeNav="admins" pageTitle="관리자" pageDesc="대시보드를 변경할 수 있는 계정 관리">
      <div className="px-7 pb-10 pt-6">
        <AdminPanel rows={rows} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: 가드 테스트가 새 액션까지 통과하는지 확인**

Run: `npx vitest run --root apps/dashboard lib/auth/action-guards.test.ts`
Expected: PASS — `createAdminAction`, `deleteAdminAction`도 `requireAdmin()`을 부르므로 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/dashboard/app/admins apps/dashboard/components/AdminPanel.tsx
git commit -m "feat(auth): add the /admins page for managing admin accounts"
```

---

### Task 11: 로그인 상태에 따른 UI — 헤더와 변경 버튼

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`
- Create: `apps/dashboard/components/HeaderAuth.tsx`
- Modify: `apps/dashboard/components/MemberTable.tsx`
- Modify: `apps/dashboard/components/MatchBuilder.tsx`
- Modify: `apps/dashboard/components/AccountMappingPanel.tsx`
- Modify: `apps/dashboard/components/KakaoImportForm.tsx`
- Modify: `apps/dashboard/app/members/page.tsx`
- Modify: `apps/dashboard/app/matches/page.tsx`
- Modify: `apps/dashboard/app/link-accounts/page.tsx`
- Modify: `apps/dashboard/app/kakao-import/page.tsx`

**Interfaces:**
- Consumes: `getCurrentAdmin` (Task 6), `logoutAction` (Task 8).
- Produces: 각 표시 컴포넌트가 `isAdmin: boolean` prop을 받는다.

- [ ] **Step 1: 헤더 로그인 영역 컴포넌트 작성**

`apps/dashboard/components/HeaderAuth.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { logoutAction } from "@/app/login/actions";

export function HeaderAuth({ username }: { username: string | null }) {
  const [isPending, startTransition] = useTransition();

  if (!username) {
    return (
      <Link href="/login" className="rounded-md border border-white/[.10] px-2.5 py-1 text-[11.5px] font-bold text-[#B7C0D0] hover:bg-white/[.06]">
        로그인
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] text-[#B7C0D0]">{username}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await logoutAction(); })}
        className="rounded-md border border-white/[.10] px-2.5 py-1 text-[11.5px] font-bold text-[#8A94A6] hover:bg-white/[.06]"
      >
        로그아웃
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `AppShell`에 로그인 상태와 `/admins` nav 반영**

`apps/dashboard/components/AppShell.tsx`에서:

`activeNav` 타입에 `"admins"`를 추가한다:

```typescript
  activeNav: "members" | "matches" | "inactive" | "kakao-import" | "link-accounts" | "admins";
```

임포트를 추가한다:

```typescript
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { HeaderAuth } from "./HeaderAuth";
```

`AppShell` 본문 상단의 데이터 조회에 현재 관리자를 더한다:

```typescript
  const [totalCount, allMembersForInactivity, currentAdmin] = await Promise.all([
    prisma.member.count(),
    prisma.member.findMany({
      select: { id: true, kakaoUserId: true, kakaoNickname: true, lastActiveAt: true, createdAt: true },
    }),
    getCurrentAdmin(),
  ]);
```

`navItems` 뒤에 관리자 전용 항목을 붙인다:

```typescript
  if (currentAdmin) {
    navItems.push({ key: "admins" as const, href: "/admins", label: "관리자", icon: "06" });
  }
```

(`navItems`가 `const`로 선언돼 있어도 배열 요소 추가는 가능하다. 타입이 좁게 추론되면 `navItems`를 `const navItems: Array<{ key: AppShellProps["activeNav"]; href: string; label: string; icon: string; badge?: string }> = [...]`로 명시한다.)

헤더 우측의 회원 수 표시 옆에 로그인 영역을 넣는다:

```tsx
          <div className="flex items-center gap-4">
            <div className="text-[11.5px] text-[#8A94A6]">
              회원 <span className="font-mono font-semibold text-[#E6EAF2]">{totalCount}</span>명
            </div>
            <HeaderAuth username={currentAdmin?.username ?? null} />
          </div>
```

- [ ] **Step 3: 변경 UI를 `isAdmin`으로 감싸기**

`MemberTable.tsx` — prop을 추가하고 삭제 버튼을 조건부로 만든다:

```tsx
export function MemberTable({ rows, isAdmin }: { rows: MemberRow[]; isAdmin: boolean }) {
```

각 행의 `<DeleteMemberButton .../>` 자리를:

```tsx
          {isAdmin ? (
            <DeleteMemberButton
              memberId={m.id}
              label={displayLabel(m)}
              mentionCount={m.mentionCount}
              gameCount={m.gameCount}
            />
          ) : (
            <div />
          )}
```

`MatchBuilder.tsx`, `AccountMappingPanel.tsx`, `KakaoImportForm.tsx`도 같은 방식으로 `isAdmin: boolean` prop을 받아, 저장/연결/업로드 버튼을 비로그인 상태에서는 렌더링하지 않고 대신 다음 안내를 보여준다:

```tsx
      {!isAdmin && (
        <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[11.5px] text-[#8A94A6]">
          변경하려면 관리자 로그인이 필요합니다.
        </div>
      )}
```

- [ ] **Step 4: 각 페이지에서 `isAdmin` 전달**

`app/members/page.tsx`, `app/matches/page.tsx`, `app/link-accounts/page.tsx`, `app/kakao-import/page.tsx` 각각에서:

```tsx
import { getCurrentAdmin } from "@/lib/auth/current-admin";
```

를 임포트하고, 컴포넌트 본문에서:

```tsx
  const isAdmin = (await getCurrentAdmin()) !== null;
```

를 구한 뒤 해당 표시 컴포넌트에 `isAdmin={isAdmin}`을 넘긴다.

- [ ] **Step 5: 타입체크와 빌드**

Run: `npx tsc --noEmit --project apps/dashboard/tsconfig.json`
Expected: 에러 없음.

Run: `npm run build --workspace=dashboard`
Expected: 성공. `cookies()`를 쓰게 되어 모든 페이지가 `ƒ (Dynamic)`으로 바뀐다 — 정상이다.

- [ ] **Step 6: 커밋**

```bash
git add apps/dashboard/components apps/dashboard/app
git commit -m "feat(auth): show login state in the header and hide mutation UI from viewers"
```

---

### Task 12: 전체 검증

**Files:** 없음 — 검증만 한다.

**Interfaces:** 없음.

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전부 통과. 인증 관련으로 새로 추가된 테스트가 35개 안팎 늘어난다.

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build --workspace=dashboard`
Expected: 성공.

- [ ] **Step 3: 비로그인 시나리오 수동 확인**

Run: `npm run dev --workspace=dashboard`

로그아웃 상태에서:
- `/members`, `/inactive`, `/matches`, `/link-accounts` 모두 **열람은 된다**
- 회원 삭제 버튼, 게임 결과 저장 버튼, 계정 연결 버튼, 카톡 업로드 폼이 **보이지 않는다**
- `/admins`로 직접 가면 `/login`으로 리다이렉트된다
- 우상단에 "로그인" 버튼이 보인다

- [ ] **Step 4: 로그인 시나리오 수동 확인**

로그인 후:
- 우상단에 아이디와 "로그아웃"이 보인다
- 사이드바에 "관리자" 항목이 생긴다
- 회원 삭제, 게임 결과 저장, 계정 연결, 카톡 업로드가 모두 동작한다
- `/admins`에서 관리자를 하나 추가하고, 그 계정으로 로그인되는지 확인한다
- 추가한 계정으로 로그인해 원래 계정을 삭제하고, 삭제된 계정의 세션이 끊겼는지 확인한다(원래 브라우저에서 새로고침 시 로그아웃 상태)
- 마지막 남은 관리자를 삭제하려 하면 "마지막 관리자는 삭제할 수 없습니다"가 뜬다

- [ ] **Step 5: 부트스트랩 환경변수 정리**

로그인이 정상 동작하는 것을 확인한 뒤, 로컬 `.env`에서 `ADMIN_BOOTSTRAP_USERNAME`과 `ADMIN_BOOTSTRAP_PASSWORD`를 지운다. 이후 배포 계획에서 서버 `.env`에 한 번만 다시 넣는다.
