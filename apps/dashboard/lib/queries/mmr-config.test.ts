import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { DEFAULT_MMR_CONFIG } from "@lolpamin/core";
import { getMmrConfig, MMR_SETTING_ID } from "./mmr-config";

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

describe("getMmrConfig", () => {
  it("falls back to the built-in defaults when nothing has been saved", async () => {
    expect(await getMmrConfig(prisma)).toEqual(DEFAULT_MMR_CONFIG);
  });

  it("returns the saved row", async () => {
    await prisma.mmrSetting.create({ data: { id: MMR_SETTING_ID, k: 24, winPoint: 5, lossPoint: 2 } });

    expect(await getMmrConfig(prisma)).toEqual({ k: 24, winPoint: 5, lossPoint: 2 });
  });

  // 다른 id로 들어간 행은 설정이 아니다 — 싱글턴 id만 읽어야 기본값 폴백이 무너지지 않는다.
  it("ignores a row saved under a different id", async () => {
    await prisma.mmrSetting.create({ data: { id: "stray", k: 99, winPoint: 9, lossPoint: 9 } });

    expect(await getMmrConfig(prisma)).toEqual(DEFAULT_MMR_CONFIG);
  });
});
