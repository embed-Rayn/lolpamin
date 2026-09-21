import { AppShell } from "@/components/AppShell";
import { GameHistoryList } from "@/components/GameHistoryList";
import { GameHistoryModeFilter, GameHistoryPagination } from "@/components/GameHistoryControls";
import { getGameHistory, parseGameHistoryMode, parseGameHistoryPage } from "@/lib/queries/game-history";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function MatchHistoryPage({
  searchParams,
}: {
  searchParams: { mode?: string; page?: string };
}) {
  const [history, currentAdmin] = await Promise.all([
    getGameHistory({
      mode: parseGameHistoryMode(searchParams.mode),
      page: parseGameHistoryPage(searchParams.page),
    }),
    getCurrentAdmin(),
  ]);

  return (
    <AppShell
      activeNav="match-history"
      pageTitle="내전 상세 기록"
      pageDesc="입력한 순서대로 보기 · 모드별로 가장 최근 한 판만 되돌릴 수 있습니다"
    >
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <GameHistoryModeFilter mode={history.mode} />
          <div className="font-mono text-[13px] text-muted">
            살아 있는 경기 {history.liveCount} / 전체 {history.totalCount}
            {history.pageCount > 1 && ` · ${history.page}/${history.pageCount}쪽`}
          </div>
        </div>
        <GameHistoryList rows={history.rows} isAdmin={currentAdmin !== null} showMode={history.mode === "all"} />
        <GameHistoryPagination mode={history.mode} page={history.page} pageCount={history.pageCount} />
      </div>
    </AppShell>
  );
}
