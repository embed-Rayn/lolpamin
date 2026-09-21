import type { PrismaClient } from "@lolpamin/db";
import { parseTheme, type Theme } from "@lolpamin/core";

export const SITE_SETTING_ID = "default";

// 행이 없으면 기본 스킨. 첫 저장 때 upsert가 만든다 — 마이그레이션 시드에 기대지 않는다.
export async function getSiteTheme(prisma: PrismaClient): Promise<Theme> {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { theme: true },
  });
  return parseTheme(row?.theme);
}
