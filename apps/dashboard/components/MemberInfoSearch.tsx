"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberInfoSort, SortDirection } from "@/lib/queries/member-info";
import { SortSelect } from "@/components/SortSelect";

const SORT_OPTIONS: Array<{ value: string; label: string; sort: MemberInfoSort; dir: SortDirection }> = [
  { value: "realName:asc", label: "이름순", sort: "realName", dir: "asc" },
  { value: "tier:desc", label: "티어 높은 순", sort: "tier", dir: "desc" },
  { value: "riftMmr:desc", label: "협곡 MMR 높은 순", sort: "riftMmr", dir: "desc" },
  { value: "riftGames:desc", label: "협곡 판수 많은 순", sort: "riftGames", dir: "desc" },
  { value: "riftWinRate:desc", label: "협곡 승률 높은 순", sort: "riftWinRate", dir: "desc" },
  { value: "aramMmr:desc", label: "칼바람 MMR 높은 순", sort: "aramMmr", dir: "desc" },
  { value: "aramGames:desc", label: "칼바람 판수 많은 순", sort: "aramGames", dir: "desc" },
  { value: "aramWinRate:desc", label: "칼바람 승률 높은 순", sort: "aramWinRate", dir: "desc" },
];

export function MemberInfoSearch({
  query,
  sort,
  dir,
}: {
  query: string;
  sort: MemberInfoSort;
  dir: SortDirection;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { q?: string; sort?: string; dir?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.sort !== undefined) params.set("sort", next.sort);
    if (next.dir !== undefined) params.set("dir", next.dir);
    router.push(`/member-info?${params.toString()}`);
  }

  function onSortSelect(value: string) {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    updateParams({ sort: option.sort, dir: option.dir });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink/[.06] px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <h2 className="m-0 hidden text-[14.5px] font-bold md:block">회원 명부</h2>
      <div className="md:hidden">
        <SortSelect
          value={SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? SORT_OPTIONS[0].value}
          options={SORT_OPTIONS}
          onChange={onSortSelect}
        />
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="이름 · 닉네임 검색"
        className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent md:w-56"
      />
    </div>
  );
}
