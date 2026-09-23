import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DraftBoard } from "@/components/draft/DraftBoard";
import { getDraftPool } from "@/lib/queries/draft-pool";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getMmrConfig } from "@/lib/queries/mmr-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [pool, mmrConfig] = await Promise.all([getDraftPool(prisma), getMmrConfig(prisma)]);

  return (
    <AppShell activeNav="matches" pageTitle="팀 드래프트" pageDesc="팀장이 스네이크 순서로 팀원을 뽑습니다" desktopOnly>
      <div className="px-7 pb-10 pt-6">
        <DraftBoard pool={pool} config={mmrConfig} />
      </div>
    </AppShell>
  );
}
