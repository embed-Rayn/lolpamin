import type { BannerVariant, PrismaClient } from "@lolpamin/db";

export const DEFAULT_BANNER_SRC = "/banner.png";

export interface BannerSlot {
  slot: number;
  /** 같은 슬롯을 바꿔 올려도 브라우저 캐시가 옛 이미지를 내지 않도록 URL에 붙는다. */
  src: string;
}

export interface HomeBanners {
  desktop: BannerSlot[];
  mobile: BannerSlot[];
}

export function bannerSrc(variant: BannerVariant, slot: number, updatedAt: Date): string {
  return `/api/branding/banners/${variant.toLowerCase()}/${slot}?v=${updatedAt.getTime()}`;
}

/** 채워진 슬롯만 슬롯 순서대로. 바이트는 읽지 않는다 — 이미지는 라우트 핸들러가 낸다. */
export async function getHomeBanners(prisma: PrismaClient): Promise<HomeBanners> {
  const rows = await prisma.homeBanner.findMany({
    select: { variant: true, slot: true, updatedAt: true },
    orderBy: { slot: "asc" },
  });
  const pick = (variant: BannerVariant) =>
    rows.filter((r) => r.variant === variant).map((r) => ({ slot: r.slot, src: bannerSrc(variant, r.slot, r.updatedAt) }));
  return { desktop: pick("DESKTOP"), mobile: pick("MOBILE") };
}

/**
 * 홈 화면이 실제로 그릴 이미지 목록. 데스크톱을 하나도 안 올렸으면 커밋된 기본 이미지,
 * 모바일을 하나도 안 올렸으면 데스크톱 세트를 그대로 쓴다 — 슬롯끼리 짝짓지 않는다.
 */
export function resolveHomeBannerSources(banners: HomeBanners): { desktop: string[]; mobile: string[] } {
  const desktop = banners.desktop.length > 0 ? banners.desktop.map((b) => b.src) : [DEFAULT_BANNER_SRC];
  const mobile = banners.mobile.length > 0 ? banners.mobile.map((b) => b.src) : desktop;
  return { desktop, mobile };
}
