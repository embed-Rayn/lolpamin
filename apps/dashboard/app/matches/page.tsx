import { AppShell } from "@/components/AppShell";
import { MatchBuilder } from "@/components/MatchBuilder";
import { getLinkedMembers } from "@/lib/queries/linked-members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function MatchesPage() {
  const pool = await getLinkedMembers();
  const isAdmin = (await getCurrentAdmin()) !== null;

  return (
    <AppShell activeNav="matches" pageTitle="게임 결과 입력" pageDesc="내전 결과 기록 및 ELO 재계산">
      <div className="px-7 pb-10 pt-6">
        <MatchBuilder pool={pool} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
