"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function MemberInfoSearch({ query }: { query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateQuery(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("q", next);
    else params.delete("q");
    router.push(`/member-info?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between border-b border-ink/[.06] px-5 py-3.5">
      <h2 className="m-0 text-[14.5px] font-bold">회원 명부</h2>
      <input
        defaultValue={query}
        onChange={(e) => updateQuery(e.target.value)}
        placeholder="이름 · 닉네임 검색"
        className="w-56 rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
      />
    </div>
  );
}
