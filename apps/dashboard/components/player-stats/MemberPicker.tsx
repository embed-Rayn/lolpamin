"use client";

import { useState } from "react";

export interface PickerMember {
  id: string;
  name: string;
  games: number;
}

// Same shape as the draw screen's CandidateSetup chip grid, without its draw-only
// parts (manual names, locking).
const FIELD =
  "rounded-lg border border-ink/[.09] bg-page px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent";

export function MemberPicker({
  members,
  selectedIds,
  onChange,
}: {
  members: PickerMember[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink/[.07] bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${FIELD} min-w-0 flex-1`}
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={`${FIELD} font-semibold`} onClick={() => onChange(new Set(members.map((m) => m.id)))}>
          전체 선택
        </button>
        <button type="button" className={`${FIELD} font-semibold`} onClick={() => onChange(new Set())}>
          전체 해제
        </button>
        <span className="text-[12px] text-faint">{selectedIds.size}명 선택</span>
      </div>
      <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto md:grid-cols-8">
        {visible.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
              selectedIds.has(m.id) ? "bg-accent-tint text-accent-soft" : "bg-surface-3 text-muted"
            } ${m.games === 0 ? "opacity-50" : ""}`}
          >
            <input type="checkbox" className="accent-accent" checked={selectedIds.has(m.id)} onChange={() => toggle(m.id)} />
            <span className="truncate">{m.name}</span>
            <span className="ml-auto font-mono text-[11px] text-faint">{m.games}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
