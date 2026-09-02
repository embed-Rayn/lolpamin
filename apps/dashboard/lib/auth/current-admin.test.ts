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
