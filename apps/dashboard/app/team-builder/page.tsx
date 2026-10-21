import { redirect } from "next/navigation";
import { loginPathFor } from "@/lib/auth/next-path";
import { AppShell } from "@/components/AppShell";
import { TeamBuilder } from "@/components/team-builder/TeamBuilder";
import { getDraftPool } from "@/lib/queries/draft-pool";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";

// AppShell and the pool query read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function TeamBuilderPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect(loginPathFor("/team-builder"));
  }

  // Same pool as /matches (getDraftPool), so both screens list the same people with the
  // same lanes, riot ids and masteries.
  const pool = await getDraftPool(prisma);

  return (
    <AppShell
      activeNav="team-builder"
      pageTitle="수동 팀짜기"
      pageDesc="참여자를 끌어 양 팀 라인업을 짜고 티어·MMR 차이를 봅니다"
      desktopOnly
    >
      <div className="px-7 pb-10 pt-6">
        <TeamBuilder pool={pool} />
      </div>
    </AppShell>
  );
}
