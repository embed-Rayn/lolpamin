"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { MemberFilter, MemberSort, SortDirection } from "@/lib/queries/members";
import { SortSelect } from "@/components/SortSelect";

// 점수판이라 판수 기준으로만 가른다 — 연결 상태는 /link-accounts, 미활동은 /inactive.
const FILTERS: Array<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "played", label: "유저만" },
  { key: "unranked", label: "언랭만" },
];

// 폰의 정렬 셀렉트가 고르는 값. "sort:dir"로 인코딩해 <select> 하나가 기준과 방향을
// 한 번에 바꾼다 — PC의 헤더 링크 클릭 두 번(기준 선택 + 방향 토글)을 압축한 것이다.
const SORT_OPTIONS: Array<{ value: string; label: string; sort: MemberSort; dir: SortDirection }> = [
  { value: "mmr:desc", label: "MMR 높은 순", sort: "mmr", dir: "desc" },
  { value: "mmr:asc", label: "MMR 낮은 순", sort: "mmr", dir: "asc" },
  { value: "realName:asc", label: "이름 가나다순", sort: "realName", dir: "asc" },
  { value: "realName:desc", label: "이름 가나다 역순", sort: "realName", dir: "desc" },
  { value: "tier:desc", label: "티어 높은 순", sort: "tier", dir: "desc" },
  { value: "tier:asc", label: "티어 낮은 순", sort: "tier", dir: "asc" },
  { value: "kakaoNickname:asc", label: "카톡 닉네임순", sort: "kakaoNickname", dir: "asc" },
];

export function MemberFilters({
  activeFilter,
  query,
  sort,
  dir,
  basePath,
}: {
  activeFilter: MemberFilter;
  query: string;
  sort: MemberSort;
  dir: SortDirection;
  // 이 표가 놓인 페이지("/rift" 또는 "/aram"). 협곡과 칼바람이 같은 표를 쓰므로 고정하면
  // 칼바람에서 필터를 누를 때 협곡으로 넘어간다.
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { filter?: string; q?: string; sort?: string; dir?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.sort !== undefined) params.set("sort", next.sort);
    if (next.dir !== undefined) params.set("dir", next.dir);
    router.push(`${basePath}?${params.toString()}`);
  }

  function onSortSelect(value: string) {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    updateParams({ sort: option.sort, dir: option.dir });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink/[.06] px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          {/* 폰에서는 필터 칩과 정렬 셀렉트가 이미 이 카드 목록의 정체를 말해주므로
              제목을 생략해 세로 공간을 아낀다. */}
          <h2 className="m-0 hidden text-[14.5px] font-bold md:block">전체 회원</h2>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => updateParams({ filter: f.key })}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
                  activeFilter === f.key
                    ? "border-accent/45 bg-accent/[.18] text-accent-soft"
                    : "border-ink/[.09] bg-transparent text-faint"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="md:hidden">
          <SortSelect
            value={SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? SORT_OPTIONS[0].value}
            options={SORT_OPTIONS}
            onChange={onSortSelect}
          />
        </div>
      </div>
      <input
        defaultValue={query}
        onChange={(e) => updateParams({ q: e.target.value })}
        placeholder="실명 · 카톡 · 디코 검색"
        className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent md:w-56"
      />
    </div>
  );
}
