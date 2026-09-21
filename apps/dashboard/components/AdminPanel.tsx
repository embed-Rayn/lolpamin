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
      <form action={handleCreate} className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
        <div className="text-[13.5px] font-bold">관리자 추가</div>
        <div className="flex gap-2">
          <input
            name="username"
            placeholder="아이디 (3자 이상)"
            className="w-[200px] rounded-lg border border-ink/[.08] bg-inset px-3 py-2 text-[13.5px] text-fg outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="비밀번호 (8자 이상)"
            className="w-[200px] rounded-lg border border-ink/[.08] bg-inset px-3 py-2 text-[13.5px] text-fg outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg px-4 py-2 text-[13.5px] font-extrabold ${
              isPending ? "cursor-not-allowed bg-hover text-ghost" : "cursor-pointer bg-success text-page"
            }`}
          >
            추가
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/[.12] p-2.5 text-[12px] text-danger-soft">
            {error}
          </div>
        )}
      </form>

      <section className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
        <div className="grid grid-cols-[1fr_1fr_1fr_80px] gap-4 border-b border-ink/[.06] bg-surface-2 px-5 py-3 text-[12.5px] font-bold tracking-wide text-faint">
          <div>아이디</div>
          <div>추가한 관리자</div>
          <div>생성일</div>
          <div className="text-right">관리</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_1fr_1fr_80px] items-center gap-4 border-b border-ink/[.04] px-5 py-3.5 text-[15px]"
          >
            <div className="truncate font-semibold">
              {row.username}
              {row.isSelf && <span className="ml-2 text-[12px] text-faint">(나)</span>}
            </div>
            <div className="truncate text-[13.5px] text-muted">{row.createdByLabel}</div>
            <div className="font-mono text-[13.5px] text-muted">{row.createdAtLabel}</div>
            <div className="flex justify-end">
              {!row.isSelf && (
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  disabled={isPending}
                  className="cursor-pointer rounded-md border border-danger/30 px-2 py-1 text-[12px] font-bold text-danger-soft hover:bg-danger/[.12]"
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
