import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toMeetingDateInput } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteEditor } from "@/components/meeting-notes/MeetingNoteEditor";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { getMeetingNote } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

export default async function EditMeetingNotePage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor(`/meeting-notes/${params.id}/edit`));
  const note = await getMeetingNote(prisma, params.id);
  if (!note) notFound();

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록 수정" pageDesc={note.title} desktopOnly>
      <div className="flex max-w-4xl flex-col gap-3 px-7 pb-10 pt-6">
        <Link href={`/meeting-notes/${note.id}`} className="text-[13px] text-faint hover:text-fg-2">
          ← 보기로 돌아가기
        </Link>
        <MeetingNoteEditor
          noteId={note.id}
          version={note.version}
          initialTitle={note.title}
          initialMeetingDate={toMeetingDateInput(note.meetingDate)}
          initialBody={note.body}
          initialImageIds={note.imageIds}
        />
      </div>
    </AppShell>
  );
}
