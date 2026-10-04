import Link from "next/link";
import { redirect } from "next/navigation";
import { formatEventDate, formatEventDateTime, formatMeetingDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { listMeetingNotes, parseMeetingNotesPage } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

function pageHref(page: number): string {
  return page > 1 ? `/meeting-notes?page=${page}` : "/meeting-notes";
}

export default async function MeetingNotesPage({ searchParams }: { searchParams: { page?: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/meeting-notes"));
  const list = await listMeetingNotes(prisma, parseMeetingNotesPage(searchParams.page));

  const pagerLink = "rounded-md border border-ink/[.09] px-2.5 py-1 text-[12.5px] text-faint hover:text-fg-2";
  const pagerOff = "rounded-md border border-ink/[.05] px-2.5 py-1 text-[12.5px] text-ghost-2";

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록" pageDesc="운영진 전용 · 관리자만 볼 수 있습니다" desktopOnly>
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-faint">
            총 {list.total}건{list.pageCount > 1 && ` · ${list.page}/${list.pageCount}쪽`}
          </div>
          <Link
            href="/meeting-notes/new"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
          >
            새 회의록
          </Link>
        </div>

        {list.rows.length === 0 ? (
          <div className="rounded-xl border border-ink/[.06] bg-surface px-5 py-10 text-center text-[13.5px] text-faint">
            아직 회의록이 없습니다. 「새 회의록」으로 첫 글을 남겨 보세요.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-ink/[.06] text-left text-[12px] font-bold text-faint">
                  <th className="w-[110px] px-4 py-2.5">회의일</th>
                  <th className="px-4 py-2.5">제목</th>
                  <th className="w-[130px] px-4 py-2.5">작성자</th>
                  <th className="w-[110px] px-4 py-2.5">작성일</th>
                  <th className="w-[200px] px-4 py-2.5">최종 수정</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink/[.04] last:border-b-0 hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-fg-2">{formatMeetingDate(row.meetingDate)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/meeting-notes/${row.id}`} className="font-semibold text-fg hover:text-accent">
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-fg-2">{row.createdByName}</td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-faint">{formatEventDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-faint">
                      {row.edited ? `${row.updatedByName} · ${formatEventDateTime(row.updatedAt)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.pageCount > 1 && (
          <nav className="flex items-center justify-center gap-1.5" aria-label="쪽">
            {list.page > 1 ? (
              <Link href={pageHref(list.page - 1)} className={pagerLink}>
                ‹ 이전
              </Link>
            ) : (
              <span className={pagerOff}>‹ 이전</span>
            )}
            <span className="px-2 font-mono text-[12.5px] text-fg-2">
              {list.page} / {list.pageCount}
            </span>
            {list.page < list.pageCount ? (
              <Link href={pageHref(list.page + 1)} className={pagerLink}>
                다음 ›
              </Link>
            ) : (
              <span className={pagerOff}>다음 ›</span>
            )}
          </nav>
        )}
      </div>
    </AppShell>
  );
}
