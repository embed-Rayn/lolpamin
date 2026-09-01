import { AppShell } from "@/components/AppShell";
import { AccountMappingPanel } from "@/components/AccountMappingPanel";
import { getPendingDiscordAccounts, getPendingKakaoAccounts } from "@/lib/queries/pending-accounts";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function LinkAccountsPage() {
  const [discordAccounts, kakaoAccounts] = await Promise.all([
    getPendingDiscordAccounts(),
    getPendingKakaoAccounts(),
  ]);

  return (
    <AppShell
      activeNav="link-accounts"
      pageTitle="계정 연결"
      pageDesc="Discord · 카카오톡 계정을 하나의 회원으로 연결"
    >
      <div className="px-7 pb-10 pt-6">
        <AccountMappingPanel discordAccounts={discordAccounts} kakaoAccounts={kakaoAccounts} />
      </div>
    </AppShell>
  );
}
