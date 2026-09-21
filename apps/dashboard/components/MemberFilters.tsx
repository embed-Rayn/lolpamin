"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberFilter } from "@/lib/queries/members";

// 점수판이라 판수 기준으로만 가른다 — 연결 상태는 /link-accounts, 미활동은 /inactive.
const FILTERS: Array<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "played", label: "유저만" },
  { key: "unranked", label: "언랭만" },
];

export function MemberFilters({
  activeFilter,
  query,
  basePath,
}: {
  activeFilter: MemberFilter;
  query: string;
  // 이 표가 놓인 페이지("/rift" 또는 "/aram"). 협곡과 칼바람이 같은 표를 쓰므로 고정하면
  // 칼바람에서 필터를 누를 때 협곡으로 넘어간다.
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { filter?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-3.5">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-[14.5px] font-bold">전체 회원</h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => updateParams({ filter: f.key })}
              className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
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
        className="w-56 rounded-lg border border-white/[.09] bg-[#0F131B] px-2.5 py-1.5 text-[13px] text-[#E6EAF2] outline-none focus:border-[#4472C4]"
      />
    </div>
  );
}
