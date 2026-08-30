import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { verifyPassword } from "./password";
import { ensureBootstrapAdmin, ensureBootstrapAdminOnce } from "./bootstrap";

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
    } as unknown as NodeJS.ProcessEnv);

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
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(1);
  });

  it("does nothing when the environment variables are absent", async () => {
    const result = await ensureBootstrapAdmin(prisma, {} as unknown as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(0);
  });

  it("does not create an admin when the bootstrap password is too short", async () => {
    const result = await ensureBootstrapAdmin(prisma, {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "short",
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(0);
  });

  it("only runs the bootstrap once per process when called repeatedly", async () => {
    const env = {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "hunter2hunter2",
    } as unknown as NodeJS.ProcessEnv;

    const first = await ensureBootstrapAdminOnce(prisma, env);
    const second = await ensureBootstrapAdminOnce(prisma, env);

    expect(first).toBe("created");
    expect(second).toBe(first);
    expect(await prisma.admin.count()).toBe(1);
  });

  it("resolves to skipped instead of rejecting when the admin count query fails", async () => {
    const brokenPrisma = {
      admin: {
        count: async () => {
          throw new Error("connection lost");
        },
      },
    } as unknown as PrismaClient;

    const result = await ensureBootstrapAdmin(brokenPrisma, {
      ADMIN_BOOTSTRAP_USERNAME: "sujin",
      ADMIN_BOOTSTRAP_PASSWORD: "hunter2hunter2",
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toBe("skipped");
    expect(await prisma.admin.count()).toBe(0);
  });
});
