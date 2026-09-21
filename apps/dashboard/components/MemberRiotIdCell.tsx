"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRiotIdAction } from "@/app/rift/actions";

export function MemberRiotIdCell({
  memberId,
  riotId,
  isAdmin,
}: {
  memberId: string;
  riotId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(riotId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = riotId ?? "-";

  if (!isAdmin) {
    return (
      <div className={`truncate font-mono text-[13.5px] ${riotId === null ? "text-[#5C6577]" : "text-[#9BD173]"}`}>
        {label}
      </div>
    );
  }

  function save() {
    setIsEditing(false);
    if (value === (riotId ?? "")) {
      // 값이 바뀌지 않았다 — 편집만 종료한다. 셀을 열었다 닫기만 해도 마운트 당시의
      // stale 값이 최신 값을 덮어쓰는 걸 막는다.
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await updateMemberRiotIdAction(memberId, value);
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
            setValue(riotId ?? "");
            setIsEditing(false);
          }
        }}
        placeholder="이름#태그"
        className="w-full rounded-md border border-[#4472C4]/50 bg-[#0F131B] px-1.5 py-1 font-mono text-[13.5px] text-[#E6EAF2] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        // 편집을 시작할 때마다 현재 prop에서 값을 다시 잡는다. 편집을 열어 둔 사이에
        // 다른 관리자가 값을 바꿨다면 그쪽이 최신이다.
        setValue(riotId ?? "");
        setIsEditing(true);
      }}
      title="클릭해서 Riot ID 수정"
      disabled={isPending}
      className={`truncate text-left font-mono text-[13.5px] hover:underline ${
        riotId === null ? "text-[#5C6577]" : "text-[#9BD173]"
      }`}
    >
      {isPending ? "저장 중..." : label}
      {error && <span className="ml-1 text-[12px] text-[#EE8B8B]">{error}</span>}
    </button>
  );
}
