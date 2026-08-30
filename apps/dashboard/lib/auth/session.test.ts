import { createHash } from "node:crypto";
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
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
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
