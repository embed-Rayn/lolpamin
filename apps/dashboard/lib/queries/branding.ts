import type { PrismaClient } from "@lolpamin/db";
import { SITE_SETTING_ID } from "./site-theme";

export const DEFAULT_SITE_NAME = "롤파민";
export const DEFAULT_SITE_TAGLINE = "함께라서 더 즐거운 게임";

export interface Branding {
  // 저장 시점에 이미 새니타이즈를 거친 값이다 — 렌더할 때 다시 걸러내지 않는다.
  logoSvg: string | null;
  siteName: string;
  siteTagline: string;
  hasDesktopBanner: boolean;
  hasMobileBanner: boolean;
}

/**
 * 사이드바·드로어·홈 화면이 페이지마다 부르므로 가볍게 유지한다. 배너의 실제
 * 바이트(Bytes 컬럼)는 여기서 가져오지 않고 "있다/없다"만 본다 — *Type 컬럼의
 * null 여부로 판정한다. setBranding이 bytes와 type을 항상 같이 쓰고 같이
 * 지우므로 이 판정이 정확하다.
 */
export async function getBranding(prisma: PrismaClient): Promise<Branding> {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: {
      logoSvg: true,
      siteName: true,
      siteTagline: true,
      homeBannerDesktopType: true,
      homeBannerMobileType: true,
    },
  });
  return {
    logoSvg: row?.logoSvg ?? null,
    siteName: row?.siteName ?? DEFAULT_SITE_NAME,
    siteTagline: row?.siteTagline ?? DEFAULT_SITE_TAGLINE,
    hasDesktopBanner: row?.homeBannerDesktopType != null,
    hasMobileBanner: row?.homeBannerMobileType != null,
  };
}
