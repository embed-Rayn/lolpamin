import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/queries/branding";

// AppShell reads Postgres for the sidebar badge; without this Next bakes a
// build-time snapshot and next start would serve stale rows.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const branding = await getBranding(prisma);

  return (
    <AppShell activeNav="home" pageTitle="롤파민" pageDesc="롤파민 내전 운영 공간">
      <div className="flex flex-col items-center px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        {/* 모바일 배너를 안 올렸으면 /api/branding/banner/mobile이 데스크톱 라우트로
            302 하므로, <source>가 있든 없든 같은 이미지가 뜬다 — "안 올리면 데스크톱을
            축소해서 보여줌"이 별도 분기 없이 여기서 그냥 된다. */}
        <picture>
          <source media="(max-width: 767px)" srcSet="/api/branding/banner/mobile" />
          <img
            src="/api/branding/banner/desktop"
            alt={branding.siteName}
            className="w-full max-w-4xl rounded-xl border border-ink/[.06]"
          />
        </picture>
      </div>
    </AppShell>
  );
}
