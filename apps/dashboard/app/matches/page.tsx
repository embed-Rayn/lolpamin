import { AppShell } from "@/components/AppShell";
import { DraftBoard } from "@/components/draft/DraftBoard";
import { getDraftPool } from "@/lib/queries/draft-pool";
import { getMmrConfig } from "@/lib/queries/mmr-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  // Open to everyone: the draft is shown on one shared screen and writes nothing to the
  // database (state lives in sessionStorage), so there is nothing to gate.
  const [pool, mmrConfig] = await Promise.all([getDraftPool(prisma), getMmrConfig(prisma)]);

  return (
    <AppShell activeNav="matches" pageTitle="내전 팀 빌더" pageDesc="팀장이 스네이크 순서로 팀원을 뽑습니다" desktopOnly>
      <div className="px-7 pb-10 pt-6">
        <DraftBoard pool={pool} config={mmrConfig} />
      </div>
    </AppShell>
  );
}
