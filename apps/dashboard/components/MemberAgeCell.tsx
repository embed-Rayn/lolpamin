"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { birthYearLabel } from "@lolpamin/core";
import { updateMemberAgeAction } from "@/app/member-admin/actions";

// 저장값(Member.age)이 없으면 닉네임에서 읽은 출생연도를 흐리게 보여 준다 — 비워 둬도
// 화면에는 그 값이 나간다는 걸 관리자가 알 수 있게.
export function MemberAgeCell({
  memberId,
  age,
  birthYear,
}: {
  memberId: string;
  age: number | null;
  birthYear: number | null;
}) {
  const router = useRouter();
  const stored = age === null ? "" : String(age).padStart(2, "0");
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setIsEditing(false);
    if (value.trim() === stored) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberAgeAction(memberId, value);
      setError(actionError);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        inputMode="numeric"
        placeholder={birthYearLabel(birthYear)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(stored);
            setIsEditing(false);
          }
        }}
        className="w-full rounded-md border border-accent/50 bg-inset px-1.5 py-1 text-center text-[13.5px] text-fg outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      title="클릭해서 출생연도 수정 (비우면 카톡 닉네임 값)"
      onClick={() => {
        // MemberRealNameCell과 같은 이유로 편집을 열 때마다 현재 prop에서 다시 잡는다.
        setValue(stored);
        setIsEditing(true);
      }}
      className={`w-full text-center text-[13.5px] hover:underline ${age !== null ? "text-fg-2" : "text-ghost"}`}
    >
      {isPending ? "…" : birthYearLabel(birthYear)}
      {error && <span className="ml-1 block text-[11.5px] text-danger-soft">{error}</span>}
    </button>
  );
}
