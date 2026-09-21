import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TeamBuilder } from "@/components/TeamBuilder";
import { getLinkedMembers } from "@/lib/queries/linked-members";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the pool query read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function TeamBuilderPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const pool = await getLinkedMembers();

  return (
    <AppShell
      activeNav="team-builder"
      pageTitle="수동 팀짜기"
      pageDesc="티어 점수를 보며 손으로 양 팀을 맞춥니다"
      desktopOnly
    >
      <div className="px-7 pb-10 pt-6">
        <TeamBuilder pool={pool} isAdmin={true} />
      </div>
    </AppShell>
  );
}
