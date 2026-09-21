"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRealNameAction } from "@/app/rift/actions";

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
    if (value === (realName === "-" ? "" : realName)) {
      // 값이 바뀌지 않았다 — 편집만 종료하고 저장하지 않는다. 아무것도 타이핑하지
      // 않고 셀을 열었다 닫기만 해도 마운트 당시의 stale 값이 최신 값을 덮어쓰는 걸 막는다.
      return;
    }
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
        className="w-full rounded-md border border-[#4472C4]/50 bg-[#0F131B] px-1.5 py-1 text-[14px] text-[#E6EAF2] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        // 편집을 시작할 때마다 현재 prop에서 다시 값을 잡는다. 마운트 시점 값을 그대로
        // 쓰면, 편집을 열어 두는 동안 다른 경로(다른 관리자, 카톡 재업로드, 정규화
        // 스크립트)가 실명을 바꿔도 그 변화가 무시되고 stale 값이 blur로 저장돼 버린다.
        setValue(realName === "-" ? "" : realName);
        setIsEditing(true);
      }}
      title="클릭해서 실명 수정"
      disabled={isPending}
      className={`truncate text-left font-semibold hover:underline ${
        realName === "-" ? "text-[#5C6577]" : ""
      }`}
    >
      {isPending ? "저장 중..." : realName}
      {error && <span className="ml-1 text-[11.5px] text-[#EE8B8B]">{error}</span>}
    </button>
  );
}
