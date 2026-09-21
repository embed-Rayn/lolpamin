"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LANE_OPTIONS, UNSET_LANE_LABEL } from "@lolpamin/core";

// 「미지정」을 고른 상태를 URL에 실을 때 쓰는 토큰. 서버 쪽 UNSET_LANE_PARAM과 같은 값이고,
// 거기 모듈은 prisma를 끌고 들어와서 클라이언트 번들에 넣을 수 없어 값만 맞춰 둔다.
const UNSET_TOKEN = "-";

export function LaneFilterMenu({
  param,
  label,
  selected,
}: {
  param: "lane" | "sublane";
  label: string;
  selected: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

  const options = [...LANE_OPTIONS.map((o) => ({ token: o.value as string, label: o.label })), {
    token: UNSET_TOKEN,
    label: UNSET_LANE_LABEL,
  }];

  function apply(tokens: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (tokens.length > 0) params.set(param, tokens.join(","));
    else params.delete(param);
    router.push(`/member-info?${params.toString()}`);
  }

  function toggle(token: string) {
    apply(selected.includes(token) ? selected.filter((t) => t !== token) : [...selected, token]);
  }

  const isFiltered = selected.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title={`${label} 필터`}
        className={`flex w-full items-center gap-1 text-left font-bold hover:text-fg-2 ${
          isFiltered ? "text-accent-soft" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="flex-none text-[10px]">▾</span>
        {isFiltered && <span className="flex-none font-mono text-[10.5px]">{selected.length}</span>}
      </button>

      {isOpen && (
        <>
          {/* 바깥을 누르면 닫힌다. 메뉴보다 아래 층에 깔아 클릭을 가로챈다. */}
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-6 z-30 w-32 rounded-lg border border-ink/[.09] bg-raised p-1.5 shadow-xl">
            {options.map((option) => (
              <label
                key={option.token}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-fg-2 hover:bg-raised-hover"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.token)}
                  onChange={() => toggle(option.token)}
                  className="h-3 w-3 flex-none accent-[rgb(var(--c-accent))]"
                />
                {option.label}
              </label>
            ))}
            {isFiltered && (
              <button
                type="button"
                onClick={() => apply([])}
                className="mt-1 w-full rounded-md px-1.5 py-1 text-left text-[12px] text-faint hover:bg-raised-hover"
              >
                필터 해제
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
