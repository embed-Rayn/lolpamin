import { AppShell } from "@/components/AppShell";

// AppShell reads Postgres for the sidebar badge; without this Next bakes a
// build-time snapshot and next start would serve stale rows.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell activeNav="home" pageTitle="롤파민" pageDesc="롤파민 내전 운영 공간">
      <div className="flex flex-col items-center px-7 pb-10 pt-6">
        <img
          src="/banner.png"
          alt="롤파민"
          className="w-full max-w-4xl rounded-xl border border-white/[.06]"
        />
      </div>
    </AppShell>
  );
}
