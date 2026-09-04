import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMmrConfig, MMR_SETTING_ID } from "../queries/mmr-config";
import { updateMmrConfig } from "./update-mmr-config";

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

describe("updateMmrConfig", () => {
  it("creates the singleton row on the first save", async () => {
    await updateMmrConfig(prisma, { k: 24, winPoint: 5, lossPoint: 2, updatedById: "admin-1" });

    const row = await prisma.mmrSetting.findUniqueOrThrow({ where: { id: MMR_SETTING_ID } });
    expect({ k: row.k, winPoint: row.winPoint, lossPoint: row.lossPoint }).toEqual({ k: 24, winPoint: 5, lossPoint: 2 });
    expect(row.updatedById).toBe("admin-1");
  });

  it("overwrites the same row on a later save instead of adding another", async () => {
    await updateMmrConfig(prisma, { k: 24, winPoint: 5, lossPoint: 2, updatedById: "admin-1" });
    await updateMmrConfig(prisma, { k: 32, winPoint: 4, lossPoint: 1, updatedById: "admin-2" });

    expect(await prisma.mmrSetting.count()).toBe(1);
    expect(await getMmrConfig(prisma)).toEqual({ k: 32, winPoint: 4, lossPoint: 1 });
  });

  it("rejects an invalid config and writes nothing", async () => {
    await expect(
      updateMmrConfig(prisma, { k: 0, winPoint: 3, lossPoint: 1, updatedById: "admin-1" })
    ).rejects.toThrow("K값은 1 이상 200 이하여야 합니다");

    expect(await prisma.mmrSetting.count()).toBe(0);
  });

  it("reports every problem in one error", async () => {
    await expect(
      updateMmrConfig(prisma, { k: 0, winPoint: 99, lossPoint: 1, updatedById: "admin-1" })
    ).rejects.toThrow("승리 점수는 0 이상 50 이하여야 합니다");
  });
});
