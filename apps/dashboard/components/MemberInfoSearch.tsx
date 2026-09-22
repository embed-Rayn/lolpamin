"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberInfoSort, SortDirection } from "@/lib/queries/member-info";
import { SortSelect } from "@/components/SortSelect";
import { NavIcon } from "@/components/nav-icons";

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
    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7 md:py-6">
      <div className="hidden md:block">
        <h2 className="m-0 text-[22px] font-extrabold tracking-tight">회원 명부</h2>
        <p className="m-0 mt-1 text-[13.5px] text-faint">우리 클럽의 소중한 멤버들을 한눈에 확인하세요.</p>
      </div>
      <div className="md:hidden">
        <SortSelect
          value={SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? SORT_OPTIONS[0].value}
          options={SORT_OPTIONS}
          onChange={onSortSelect}
        />
      </div>
      <div className="relative w-full md:w-72">
        <NavIcon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ghost"
        />
        <input
          defaultValue={query}
          onChange={(e) => updateParams({ q: e.target.value })}
          placeholder="이름 · 닉네임 검색..."
          className="h-11 w-full rounded-xl border border-ink/[.09] bg-inset pl-10 pr-3 text-[14px] text-fg outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
