import { AppShell } from "@/components/AppShell";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
import { getPendingDiscordAccounts } from "@/lib/queries/pending-accounts";
import { getKakaoAccountsWithCandidates, getMembersWithAliases } from "@/lib/queries/link-candidates";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function LinkAccountsPage() {
  const [discordAccounts, kakaoAccounts, membersWithAliases, currentAdmin] = await Promise.all([
    getPendingDiscordAccounts(),
    getKakaoAccountsWithCandidates(),
    getMembersWithAliases(),
    getCurrentAdmin(),
  ]);

  return (
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
      <div className="px-7 pb-10 pt-6">
        <AccountMappingPanel
          discordAccounts={discordAccounts}
          kakaoAccounts={kakaoAccounts}
          membersWithAliases={membersWithAliases}
          isAdmin={currentAdmin !== null}
        />
      </div>
    </AppShell>
  );
}
