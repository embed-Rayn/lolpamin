import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MatchBuilder } from "@/components/MatchBuilder";
import { MmrSimulator } from "@/components/MmrSimulator";
import { getLinkedMembers } from "@/lib/queries/linked-members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getMmrConfig } from "@/lib/queries/mmr-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [pool, mmrConfig] = await Promise.all([getLinkedMembers(), getMmrConfig(prisma)]);

  return (
    <AppShell activeNav="matches" pageTitle="게임 결과 입력" pageDesc="내전 결과 기록 및 MMR 재계산" desktopOnly>
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <MatchBuilder pool={pool} isAdmin={true} config={mmrConfig} />
        <MmrSimulator config={mmrConfig} />
      </div>
    </AppShell>
  );
}
