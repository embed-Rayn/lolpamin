"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminAction, deleteAdminAction } from "@/app/admins/actions";

export interface AdminRow {
  id: string;
  username: string;
  createdByLabel: string;
  createdAtLabel: string;
  isSelf: boolean;
}

export function AdminPanel({ rows }: { rows: AdminRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAdminAction(formData);
      setError(result.error);
      router.refresh();
    });
  }

  function handleDelete(row: AdminRow) {
    if (!window.confirm(`'${row.username}' 관리자를 삭제합니다. 이 계정의 로그인 세션도 함께 끊깁니다.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAdminAction(row.id);
      setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={handleCreate} className="flex flex-col gap-3 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="text-[12.5px] font-bold">관리자 추가</div>
        <div className="flex gap-2">
          <input
            name="username"
            placeholder="아이디 (3자 이상)"
            className="w-[200px] rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="비밀번호 (8자 이상)"
            className="w-[200px] rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg px-4 py-2 text-[12.5px] font-extrabold ${
              isPending ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#70AD47] text-[#0E1117]"
            }`}
          >
            추가
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[11px] text-[#EE8B8B]">
            {error}
          </div>
        )}
      </form>

      <section className="overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="grid grid-cols-[1fr_1fr_1fr_72px] gap-4 border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[11.5px] font-bold tracking-wide text-[#6E7889]">
          <div>아이디</div>
          <div>추가한 관리자</div>
          <div>생성일</div>
          <div className="text-right">관리</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_1fr_1fr_72px] items-center gap-4 border-b border-white/[.04] px-5 py-3.5 text-[14px]"
          >
            <div className="truncate font-semibold">
              {row.username}
              {row.isSelf && <span className="ml-2 text-[10.5px] text-[#6E7889]">(나)</span>}
            </div>
            <div className="truncate text-[12.5px] text-[#8A94A6]">{row.createdByLabel}</div>
            <div className="font-mono text-[12.5px] text-[#8A94A6]">{row.createdAtLabel}</div>
            <div className="flex justify-end">
              {!row.isSelf && (
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  disabled={isPending}
                  className="cursor-pointer rounded-md border border-[#E05A5A]/30 px-2 py-1 text-[11px] font-bold text-[#EE8B8B] hover:bg-[#E05A5A]/[.12]"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
