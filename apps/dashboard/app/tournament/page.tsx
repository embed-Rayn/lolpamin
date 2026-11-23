import Link from "next/link";
import { notFound } from "next/navigation";
import type { GameKind } from "@lolpamin/db";
import { AppShell } from "@/components/AppShell";
import { GameHistoryList } from "@/components/GameHistoryList";
import { ReplayImportForm } from "@/components/ReplayImportForm";
import { TournamentImageManager } from "@/components/tournament/TournamentImageManager";
import { TournamentStandingsTable } from "@/components/tournament/TournamentStandingsTable";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getGameHistory, parseGameHistoryPage } from "@/lib/queries/game-history";
import {
  getTournamentStandings,
  getTournamentTeamNames,
  isTournamentEnabled,
  listTournamentImageIds,
} from "@/lib/tournament/queries";

// AppShell and the page queries read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

type KindFilter = "all" | "TOURNAMENT" | "SCRIM";

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "TOURNAMENT", label: "대회" },
  { key: "SCRIM", label: "스크림" },
];

function parseKindFilter(value: string | undefined): KindFilter {
  return value === "TOURNAMENT" || value === "SCRIM" ? value : "all";
}

function kindsFor(filter: KindFilter): GameKind[] {
  return filter === "all" ? ["TOURNAMENT", "SCRIM"] : [filter];
}

function tournamentHref(kind: KindFilter, page: number): string {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/tournament?${qs}` : "/tournament";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-bold text-fg">{children}</h2>;
}

export default async function TournamentPage({
  searchParams,
}: {
  searchParams: { kind?: string; page?: string };
}) {
  const [admin, enabled] = await Promise.all([getCurrentAdmin(), isTournamentEnabled(prisma)]);
  // 404, not a notice: while the page is off it does not exist for a visitor.
  if (!enabled && !admin) notFound();

  const kind = parseKindFilter(searchParams.kind);
  const [standings, teams, imageIds, history] = await Promise.all([
    getTournamentStandings(prisma),
    getTournamentTeamNames(prisma),
    listTournamentImageIds(prisma),
    getGameHistory({ kinds: kindsFor(kind), page: parseGameHistoryPage(searchParams.page) }),
  ]);
  const isAdmin = admin !== null;
  const canEdit = isAdmin && enabled;

  const linkClass = "rounded-md border border-ink/[.09] px-2.5 py-1 font-mono text-[12.5px] text-faint hover:text-fg-2";
  const disabledClass = "rounded-md border border-ink/[.05] px-2.5 py-1 font-mono text-[12.5px] text-ghost-2";

  return (
    <AppShell activeNav="tournament" pageTitle="대회" pageDesc="1~4팀 리그전 순위와 경기 기록">
      <div className="flex flex-col gap-7 px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        {!enabled && (
          <div className="rounded-lg border border-gold-deep/30 bg-gold-deep/[.12] px-3 py-2.5 text-[13px] text-gold-deep">
            대회 페이지가 꺼져 있습니다. 관리자 · 설정에서 켤 수 있습니다.
          </div>
        )}

        <section className="flex flex-col gap-3">
          <SectionTitle>순위표</SectionTitle>
          <TournamentStandingsTable standings={standings} isAdmin={canEdit} />
          <p className="text-[12px] text-faint">승 +3 · 패 −1 · 대회 경기만 셉니다(스크림 제외).</p>
        </section>

        {(imageIds.length > 0 || canEdit) && (
          <section className="flex flex-col gap-3">
            <SectionTitle>이미지</SectionTitle>
            <TournamentImageManager ids={imageIds} canEdit={canEdit} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>경기 및 스크림 기록</SectionTitle>
            <div className="flex gap-1">
              {KIND_FILTERS.map((f) => (
                <Link
                  key={f.key}
                  // A filter change starts at page 1 — page 3 of another filter may not exist here.
                  href={tournamentHref(f.key, 1)}
                  className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
                    kind === f.key
                      ? "border-accent/45 bg-accent/[.18] text-accent-soft"
                      : "border-ink/[.09] bg-transparent text-faint hover:text-fg-2"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
          <GameHistoryList rows={history.rows} isAdmin={isAdmin} showMode={false} />
          {history.pageCount > 1 && (
            <nav className="flex items-center justify-center gap-1.5" aria-label="쪽">
              {history.page > 1 ? (
                <Link href={tournamentHref(kind, history.page - 1)} className={linkClass}>
                  ‹
                </Link>
              ) : (
                <span className={disabledClass}>‹</span>
              )}
              <span className="px-1 font-mono text-[12.5px] text-muted">
                {history.page}/{history.pageCount}
              </span>
              {history.page < history.pageCount ? (
                <Link href={tournamentHref(kind, history.page + 1)} className={linkClass}>
                  ›
                </Link>
              ) : (
                <span className={disabledClass}>›</span>
              )}
            </nav>
          )}
        </section>

        {canEdit && (
          <section className="flex flex-col gap-3">
            <SectionTitle>리플레이 업로드</SectionTitle>
            <p className="text-[13px] text-muted md:hidden">리플레이 업로드는 PC에서 이용해 주세요</p>
            <div className="hidden md:block">
              <ReplayImportForm isAdmin={true} tournament={{ teams }} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
