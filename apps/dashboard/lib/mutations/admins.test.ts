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
