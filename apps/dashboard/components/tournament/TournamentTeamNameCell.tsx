"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameTournamentTeamAction } from "@/app/tournament/actions";

// Admin-only inline rename, the same gesture as MemberRealNameCell: click → input,
// Enter or blur saves, Esc cancels.
export function TournamentTeamNameCell({ slot, name }: { slot: number; name: string }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setIsEditing(false);
    // Unchanged: just close, so opening and leaving the cell never writes a stale value.
    if (value.trim() === name) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await renameTournamentTeamAction(slot, value);
      setError(actionError);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col">
      {isEditing ? (
        <input
          autoFocus
          value={value}
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(name);
              setIsEditing(false);
            }
          }}
          className="w-full min-w-0 rounded-md border border-accent/50 bg-inset px-1.5 py-0.5 text-[13.5px] text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            // Re-read the prop each time: another admin may have renamed it meanwhile.
            setValue(name);
            setError(null);
            setIsEditing(true);
          }}
          title="클릭해서 팀 이름 수정"
          disabled={isPending}
          className="truncate text-left font-semibold text-fg hover:underline disabled:opacity-60"
        >
          {isPending ? "저장 중..." : name}
        </button>
      )}
      {error && <span className="text-[11.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
