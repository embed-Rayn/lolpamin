"use client";

import Link from "next/link";
import { useTransition } from "react";
import { logoutAction } from "@/app/login/actions";

export function HeaderAuth({ username }: { username: string | null }) {
  const [isPending, startTransition] = useTransition();

  if (!username) {
    return (
      <Link href="/login" className="rounded-md border border-ink/[.10] px-2.5 py-1 text-[12.5px] font-bold text-fg-2 hover:bg-ink/[.06]">
        로그인
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] text-fg-2">{username}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await logoutAction(); })}
        className="rounded-md border border-ink/[.10] px-2.5 py-1 text-[12.5px] font-bold text-muted hover:bg-ink/[.06]"
      >
        로그아웃
      </button>
    </div>
  );
}
