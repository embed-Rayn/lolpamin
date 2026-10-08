import { redirect } from "next/navigation";
import { seoulTodayInput } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNoteEditor } from "@/components/meeting-notes/MeetingNoteEditor";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";

export default async function NewMeetingNotePage() {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/meeting-notes/new"));

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록 작성" pageDesc="새 회의록" desktopOnly>
      <div className="flex max-w-4xl flex-col gap-3 px-7 pb-10 pt-6">
        <MeetingNoteEditor
          initialTitle=""
          initialMeetingDate={seoulTodayInput(new Date())}
          initialBody=""
          initialImageIds={[]}
        />
      </div>
    </AppShell>
  );
}
