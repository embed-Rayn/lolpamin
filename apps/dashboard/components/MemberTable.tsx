"use client";

import { useMemo, useState } from "react";
import type { MemberRow } from "@/lib/queries/members";

type SortKey = "kakaoNickname" | "discordHandle" | "elo" | "lastActive";
type SortDir = "asc" | "desc";

const GRID = "grid grid-cols-[52px_1fr_1fr_1fr_100px_140px] gap-4";

const EMPTY = "-";

function isMissing(row: MemberRow, key: SortKey): boolean {
  if (key === "lastActive") return row.daysSinceActive === null;
  if (key === "elo") return false;
  return row[key] === EMPTY;
}

function compare(a: MemberRow, b: MemberRow, key: SortKey): number {
  if (key === "elo") return a.elo - b.elo;
  if (key === "lastActive") return (a.daysSinceActive ?? 0) - (b.daysSinceActive ?? 0);
  return a[key].localeCompare(b[key], "ko");
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[11.5px] font-bold tracking-wide hover:text-[#8FB4F5] ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-[#8FB4F5]" : "text-[#6E7889]"}`}
    >
      <span>{label}</span>
      <span className="text-[9px] leading-none">{active ? (dir === "asc" ? "▲" : "▼") : "⇅"}</span>
    </button>
  );
}

export function MemberTable({ rows }: { rows: MemberRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  function onSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // 세 번째 클릭 → 기본 순서 복귀
    });
  }

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      // 값 없는 항목("-"/기록 없음)은 정렬 방향과 무관하게 항상 뒤로
      const aMissing = isMissing(a, sort.key);
      const bMissing = isMissing(b, sort.key);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing) return 0;
      return compare(a, b, sort.key) * factor;
    });
  }, [rows, sort]);

  return (
    <>
      <div className={`${GRID} border-b border-white/[.06] bg-[#12161F] px-5 py-3 text-[11.5px] font-bold tracking-wide text-[#6E7889]`}>
        <div className="text-right">#</div>
        <div>실명</div>
        <SortHeader label="카톡 닉네임" sortKey="kakaoNickname" active={sort?.key === "kakaoNickname"} dir={sort?.dir ?? "asc"} onSort={onSort} />
        <SortHeader label="디코 닉네임" sortKey="discordHandle" active={sort?.key === "discordHandle"} dir={sort?.dir ?? "asc"} onSort={onSort} />
        <SortHeader label="ELO" sortKey="elo" active={sort?.key === "elo"} dir={sort?.dir ?? "asc"} onSort={onSort} align="right" />
        <SortHeader label="마지막 활동" sortKey="lastActive" active={sort?.key === "lastActive"} dir={sort?.dir ?? "asc"} onSort={onSort} align="right" />
      </div>
      {sorted.map((m, i) => (
        <div
          key={m.id}
          className={`${GRID} items-center border-b border-white/[.04] px-5 py-3.5 text-[14px] hover:bg-[#181E29]`}
        >
          <div className="text-right font-mono text-[12.5px] text-[#5C6577]">{i + 1}</div>
          <div className={`truncate font-semibold ${m.realName === EMPTY ? "text-[#5C6577]" : ""}`}>{m.realName}</div>
          <div className={`truncate font-mono text-[12.5px] ${m.kakaoNickname === EMPTY ? "text-[#5C6577]" : "text-[#F2C75C]"}`}>
            {m.kakaoNickname}
          </div>
          <div className={`truncate font-mono text-[12.5px] ${m.discordHandle === EMPTY ? "text-[#5C6577]" : "text-[#8FA9F5]"}`}>
            {m.discordHandle}
          </div>
          <div className={`text-right font-mono text-[14.5px] font-bold ${m.elo >= 1600 ? "text-[#F2C75C]" : "text-[#E6EAF2]"}`}>
            {m.elo}
          </div>
          <div
            className={`text-right font-mono text-[12.5px] ${
              m.daysSinceActive !== null && m.daysSinceActive >= 30
                ? "text-[#EE8B8B]"
                : m.daysSinceActive !== null && m.daysSinceActive >= 14
                ? "text-[#F2985C]"
                : "text-[#8A94A6]"
            }`}
          >
            {m.lastActiveLabel}
          </div>
        </div>
      ))}
    </>
  );
}
