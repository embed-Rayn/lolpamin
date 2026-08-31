"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRealNameAction } from "@/app/members/actions";

export function MemberRealNameCell({
  memberId,
  realName,
  isAdmin,
}: {
  memberId: string;
  realName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(realName === "-" ? "" : realName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) {
    return (
      <div className={`truncate font-semibold ${realName === "-" ? "text-[#5C6577]" : ""}`}>{realName}</div>
    );
  }

  function save() {
    setIsEditing(false);
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberRealNameAction(memberId, value);
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
            setValue(realName === "-" ? "" : realName);
            setIsEditing(false);
          }
        }}
        className="w-full rounded-md border border-[#4472C4]/50 bg-[#0F131B] px-1.5 py-1 text-[13px] text-[#E6EAF2] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      title="클릭해서 실명 수정"
      disabled={isPending}
      className={`truncate text-left font-semibold hover:underline ${
        realName === "-" ? "text-[#5C6577]" : ""
      }`}
    >
      {isPending ? "저장 중..." : realName}
      {error && <span className="ml-1 text-[10px] text-[#EE8B8B]">{error}</span>}
    </button>
  );
}
