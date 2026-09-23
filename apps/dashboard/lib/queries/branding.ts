import type { PrismaClient } from "@lolpamin/db";
import { SITE_SETTING_ID } from "./site-theme";

export const DEFAULT_SITE_NAME = "롤파민";
export const DEFAULT_SITE_TAGLINE = "함께라서 더 즐거운 게임";

export interface Branding {
  // 저장 시점에 이미 새니타이즈를 거친 값이다 — 렌더할 때 다시 걸러내지 않는다.
  logoSvg: string | null;
  siteName: string;
  siteTagline: string;
}

/** 사이드바·드로어·홈 화면이 페이지마다 부르므로 가볍게 유지한다. 배너는 home-banners.ts. */
export async function getBranding(prisma: PrismaClient): Promise<Branding> {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: {
      logoSvg: true,
      siteName: true,
      siteTagline: true,
    },
  });
  return {
    logoSvg: row?.logoSvg ?? null,
    siteName: row?.siteName ?? DEFAULT_SITE_NAME,
    siteTagline: row?.siteTagline ?? DEFAULT_SITE_TAGLINE,
  };
}
