"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberNoteAction } from "@/app/member-info/actions";

export function MemberNoteCell({
  memberId,
  note,
  isAdmin,
}: {
  memberId: string;
  note: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return <div className={`truncate ${note ? "text-fg-2" : "text-ghost"}`}>{note ?? "-"}</div>;
  }

  function save() {
    setIsEditing(false);
    if (value === (note ?? "")) {
      // 값이 바뀌지 않았다 — MemberRealNameCell과 같은 이유로, 열었다 닫기만 해도
      // 마운트 당시의 stale 값이 최신 값을 덮어쓰는 걸 막는다.
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberNoteAction(memberId, value);
      setError(actionError);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(note ?? "");
            setIsEditing(false);
          }
        }}
        placeholder="비고"
        className="w-full rounded-md border border-accent/50 bg-inset px-1.5 py-1 text-[13.5px] text-fg outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(note ?? "");
        setIsEditing(true);
      }}
      title="클릭해서 비고 수정"
      disabled={isPending}
      className={`truncate text-left hover:underline ${note ? "text-fg-2" : "text-ghost"}`}
    >
      {isPending ? "저장 중..." : note ?? "-"}
      {error && <span className="ml-1 text-[11.5px] text-danger-soft">{error}</span>}
    </button>
  );
}
