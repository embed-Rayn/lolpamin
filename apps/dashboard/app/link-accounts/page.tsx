import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
import { getPendingDiscordAccounts } from "@/lib/queries/pending-accounts";
import { getKakaoAccountsWithCandidates, getMembersWithAliases } from "@/lib/queries/link-candidates";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function LinkAccountsPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [discordAccounts, kakaoAccounts, membersWithAliases] = await Promise.all([
    getPendingDiscordAccounts(),
    getKakaoAccountsWithCandidates(),
    getMembersWithAliases(),
  ]);

  return (
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
      desktopOnly
    >
      <div className="px-7 pb-10 pt-6">
        <AccountMappingPanel
          discordAccounts={discordAccounts}
          kakaoAccounts={kakaoAccounts}
          membersWithAliases={membersWithAliases}
          isAdmin={true}
        />
      </div>
    </AppShell>
  );
}
