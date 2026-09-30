"use client";

import { useState } from "react";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { guestNameError, normalizeGuestName, type Guest } from "@/lib/draft/candidates";
import { MULTI_NAME_PLACEHOLDER, MultiNameMatchBar, useMultiNameSearch } from "@/components/MultiNameSearch";

export function ParticipantPicker({
  pool,
  selectedIds,
  guests,
  onToggle,
  onSelectMany,
  onAddGuest,
  onRemoveGuest,
}: {
  pool: DraftPoolMember[];
  selectedIds: string[];
  guests: Guest[];
  onToggle: (id: string) => void;
  // One call for a pasted list — calling onToggle per id would each read the same stale
  // selection and only the last one would stick.
  onSelectMany: (ids: string[]) => void;
  onAddGuest: (name: string) => void;
  onRemoveGuest: (name: string) => void;
}) {
  const search = useMultiNameSearch(pool);
  const [guestInput, setGuestInput] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);

  const selected = new Set(selectedIds);
  const visible = [...pool]
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .filter(search.matches);

  function addGuest() {
    const name = normalizeGuestName(guestInput);
    const error = guestNameError(name, guests, pool);
    setGuestError(error);
    if (error !== null) return;
    onAddGuest(name);
    setGuestInput("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[14px] font-bold">참여자 선택</h2>
        <span className="text-[12px] text-faint">
          {selectedIds.length + guests.length}명 선택
        </span>
      </div>
      <input
        value={search.query}
        onChange={(e) => search.onQueryChange(e.target.value)}
        onPaste={search.onPaste}
        placeholder={MULTI_NAME_PLACEHOLDER}
        className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
      />
      <MultiNameMatchBar
        search={search}
        onSelectMatched={onSelectMany}
      />
      <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-6 xl:grid-cols-8">
        {visible.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] ${
              selected.has(m.id) ? "border-accent/40 bg-accent/10 text-fg" : "border-ink/[.08] text-muted"
            }`}
          >
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => onToggle(m.id)} className="accent-[rgb(var(--c-accent))]" />
            <span className="truncate">{m.name}</span>
          </label>
        ))}
        {guests.map((g) => (
          <div key={g.name} className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[13px]">
            <span className="rounded bg-ink/[.08] px-1 text-[10.5px] font-bold text-muted">게스트</span>
            <span className="flex-1 truncate">{g.name}</span>
            <button onClick={() => onRemoveGuest(g.name)} className="text-faint" aria-label={`${g.name} 제거`}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={guestInput}
          onChange={(e) => setGuestInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addGuest();
          }}
          placeholder="명단에 없는 사람 이름 추가"
          className="flex-1 rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
        />
        <button onClick={addGuest} className="rounded-lg border border-ink/[.12] px-3 text-[12.5px] font-bold">
          추가
        </button>
      </div>
      {guestError && <div className="text-[12px] text-danger-soft">{guestError}</div>}
    </section>
  );
}
