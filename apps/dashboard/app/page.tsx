import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/queries/branding";
import { getHomeBanners, resolveHomeBannerSources } from "@/lib/queries/home-banners";

// AppShell reads Postgres for the sidebar badge; without this Next bakes a
// build-time snapshot and next start would serve stale rows.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [branding, banners] = await Promise.all([getBranding(prisma), getHomeBanners(prisma)]);
  const sources = resolveHomeBannerSources(banners);

  return (
    <AppShell activeNav="home" pageTitle="롤파민" pageDesc="롤파민 내전 운영 공간">
      <div className="px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        {/* 데스크톱·모바일 세트를 둘 다 그리고 CSS로 하나만 보인다. loading="lazy"라 display:none
            쪽 이미지는 받지 않는다. 대체 규칙(기본 이미지, 모바일→데스크톱)은 resolveHomeBannerSources. */}
        <div className="hidden flex-col gap-4 md:flex">
          {sources.desktop.map((src) => (
            <img key={src} src={src} alt={branding.siteName} loading="lazy" className="block w-full rounded-xl border border-ink/[.06]" />
          ))}
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          {sources.mobile.map((src) => (
            <img key={src} src={src} alt={branding.siteName} loading="lazy" className="block w-full rounded-xl border border-ink/[.06]" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
