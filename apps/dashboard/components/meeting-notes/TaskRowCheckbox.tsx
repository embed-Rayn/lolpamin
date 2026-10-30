"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleMeetingNoteTaskAction } from "@/app/meeting-notes/actions";

// A tick on the task board saves straight into the note's body. The box flips before the
// server answers and flips back if the save is refused.
export function TaskRowCheckbox({
  noteId,
  line,
  text,
  checked,
}: {
  noteId: string;
  line: number;
  text: string;
  checked: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleMeetingNoteTaskAction(noteId, line, text, next);
        if (result.error) {
          setValue(!next);
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setValue(!next);
        setError("할 일을 저장하지 못했습니다.");
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={value}
        disabled={isPending}
        onChange={toggle}
        className="cursor-pointer accent-accent"
        aria-label={`${text} 완료`}
      />
      {error && <span className="text-[11.5px] text-danger-soft">{error}</span>}
    </span>
  );
}
