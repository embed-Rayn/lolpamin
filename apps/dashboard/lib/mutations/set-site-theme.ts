import type { PrismaClient } from "@lolpamin/db";
import { parseTheme, type Theme } from "@lolpamin/core";
import { SITE_SETTING_ID } from "../queries/site-theme";

export async function setSiteTheme(
  prisma: PrismaClient,
  theme: string,
  adminId: string | null,
): Promise<Theme> {
  const parsed: Theme = parseTheme(theme);
  await prisma.siteSetting.upsert({
    where: { id: SITE_SETTING_ID },
    create: { id: SITE_SETTING_ID, theme: parsed, updatedById: adminId },
    update: { theme: parsed, updatedById: adminId },
  });
  return parsed;
}
