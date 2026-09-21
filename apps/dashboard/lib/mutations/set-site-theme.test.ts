import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getSiteTheme } from "../queries/site-theme";
import { setSiteTheme } from "./set-site-theme";

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

describe("site theme", () => {
  it("reads the default when nothing has been saved", async () => {
    expect(await getSiteTheme(prisma)).toBe("clean");
  });

  it("round-trips a chosen theme and overwrites it in place", async () => {
    await setSiteTheme(prisma, "pink", "admin-1");
    expect(await getSiteTheme(prisma)).toBe("pink");

    await setSiteTheme(prisma, "dark", null);
    expect(await getSiteTheme(prisma)).toBe("dark");
    expect(await prisma.siteSetting.count()).toBe(1);
  });

  it("refuses an unknown theme by falling back to the default", async () => {
    expect(await setSiteTheme(prisma, "neon", null)).toBe("clean");
    expect(await getSiteTheme(prisma)).toBe("clean");
  });
});
