"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseMeetingDateInput, toggleMeetingNoteTaskLine } from "@lolpamin/core";
import { toggleMeetingNoteTaskAction } from "@/app/meeting-notes/actions";
import { MeetingNoteBody, type MeetingNoteTaskToggle } from "./MeetingNoteBody";

// The note view's body: ticking a task saves at once. The box flips before the server
// answers and flips back if the save is refused.
export function MeetingNoteViewBody({
  noteId,
  body: initialBody,
  meetingDate,
  imageIds,
}: {
  noteId: string;
  body: string;
  meetingDate: string;
  imageIds: string[];
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const date = parseMeetingDateInput(meetingDate) ?? new Date();

  function toggle({ line, text, checked }: MeetingNoteTaskToggle) {
    const before = body;
    const next = toggleMeetingNoteTaskLine(before, date, line, text, checked);
    if (next === null) return;
    setBody(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleMeetingNoteTaskAction(noteId, line, text, checked);
        if (result.error) {
          setBody(before);
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setBody(before);
        setError("할 일을 저장하지 못했습니다. 로그인 상태를 확인해 주세요.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <div className="text-[12.5px] text-danger-soft">{error}</div>}
      <MeetingNoteBody body={body} imageIds={imageIds} meetingDate={meetingDate} onToggleTask={toggle} />
    </div>
  );
}
