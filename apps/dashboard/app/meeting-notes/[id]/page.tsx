import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatEventDate, formatEventDateTime, formatMeetingDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteBody } from "@/components/meeting-notes/MeetingNoteBody";
import { MeetingNoteDeleteButton } from "@/components/meeting-notes/MeetingNoteDeleteButton";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { getMeetingNote } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

export default async function MeetingNotePage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor(`/meeting-notes/${params.id}`));
  const note = await getMeetingNote(prisma, params.id);
  if (!note) notFound();

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록" pageDesc={note.title} desktopOnly>
      <article className="flex max-w-4xl flex-col gap-4 px-7 pb-10 pt-6">
        <Link href="/meeting-notes" className="text-[13px] text-faint hover:text-fg-2">
          ← 회의록
        </Link>
        <header className="flex items-start justify-between gap-4 border-b border-ink/[.06] pb-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-extrabold tracking-tight text-fg">{note.title}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-faint">
              <span>회의일 {formatMeetingDate(note.meetingDate)}</span>
              <span>
                작성 {note.createdByName} · {formatEventDate(note.createdAt)}
              </span>
              {note.edited && (
                <span>
                  수정 {note.updatedByName} · {formatEventDateTime(note.updatedAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`/meeting-notes/${note.id}/edit`}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-accent-hover"
            >
              수정
            </Link>
            <MeetingNoteDeleteButton noteId={note.id} />
          </div>
        </header>
        <MeetingNoteBody body={note.body} imageIds={note.imageIds} />
      </article>
    </AppShell>
  );
}
