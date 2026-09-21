import { AppShell } from "@/components/AppShell";

// AppShell reads Postgres for the sidebar badge; without this Next bakes a
// build-time snapshot and next start would serve stale rows.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell activeNav="home" pageTitle="롤파민" pageDesc="롤파민 내전 운영 공간">
      <div className="flex flex-col items-center px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        <img
          src="/banner.png"
          alt="롤파민"
          className="w-full max-w-4xl rounded-xl border border-ink/[.06]"
        />
      </div>
    </AppShell>
  );
}
