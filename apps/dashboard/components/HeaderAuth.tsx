"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/app/login/actions";
import { loginPathFor } from "@/lib/auth/next-path";

export function HeaderAuth({ username }: { username: string | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!username) {
    // Carry the current page so logging in comes back to it. Read at click time —
    // useSearchParams here would need a Suspense boundary on every page.
    return (
      <Link
        href="/login"
        onClick={(e) => {
          if (window.location.pathname === "/login") return;
          e.preventDefault();
          router.push(loginPathFor(window.location.pathname + window.location.search));
        }}
        className="rounded-md border border-ink/[.10] px-2.5 py-1 text-[12.5px] font-bold text-fg-2 hover:bg-ink/[.06]"
      >
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
