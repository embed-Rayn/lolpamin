"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberFilter } from "@/lib/queries/members";

// "미연결만"은 카톡만 + 디코만이라 한 덩어리로 묶여 있었다. 어느 쪽이 비었는지가
// 연결 작업에서는 정작 중요한 정보라 둘로 나눴다.
const FILTERS: Array<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "linked", label: "연결됨" },
  { key: "kakaoOnly", label: "카톡만" },
  { key: "discordOnly", label: "디코만" },
  { key: "inactive", label: "미활동만" },
];

export function MemberFilters({ activeFilter, query }: { activeFilter: MemberFilter; query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { filter?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    router.push(`/members?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between border-b border-white/[.06] px-4.5 py-3.5">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-[13.5px] font-bold">전체 회원</h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => updateParams({ filter: f.key })}
              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${
                activeFilter === f.key
                  ? "border-[#4472C4]/45 bg-[#4472C4]/[.18] text-[#8FB4F5]"
                  : "border-white/[.09] bg-transparent text-[#7A8496]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="실명 · 카톡 · 디코 검색"
        className="w-56 rounded-lg border border-white/[.09] bg-[#0F131B] px-2.5 py-1.5 text-xs text-[#E6EAF2] outline-none focus:border-[#4472C4]"
      />
    </div>
  );
}
