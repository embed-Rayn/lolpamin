import { AppShell } from "@/components/AppShell";
import { GameHistoryList } from "@/components/GameHistoryList";
import { getGameHistory } from "@/lib/queries/game-history";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function MatchHistoryPage() {
  const [rows, currentAdmin] = await Promise.all([getGameHistory(), getCurrentAdmin()]);
  const liveCount = rows.filter((r) => !r.isCancelled).length;

  return (
    <AppShell
      activeNav="match-history"
      pageTitle="경기 기록"
      pageDesc="입력한 순서대로 보기 · 가장 최근 한 판만 되돌릴 수 있습니다"
    >
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="font-mono text-[13px] text-[#8A94A6]">
          살아 있는 경기 {liveCount} / 전체 {rows.length}
        </div>
        <GameHistoryList rows={rows} isAdmin={currentAdmin !== null} />
      </div>
    </AppShell>
  );
}
