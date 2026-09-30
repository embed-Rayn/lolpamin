"use client";

import { useState } from "react";
import { matchParticipantNames, parseParticipantNames, type ParticipantNameMatch } from "@lolpamin/core";

// Shared by the participant pickers (/matches, /draw/*, /player-stats). Typing searches as
// before; pasting the chatroom's recruit post (or any multi-name text) into the same box
// filters the list to the people it names instead.

interface Named {
  id: string;
  name: string;
}

// A paste is a list when it spans lines, mentions someone or separates names with commas;
// a single pasted word stays an ordinary search.
function looksLikeList(text: string): boolean {
  return /[\n@,]/.test(text.trim());
}

export interface MultiNameSearch {
  query: string;
  multi: (ParticipantNameMatch & { total: number }) | null;
  onQueryChange: (value: string) => void;
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  clear: () => void;
  matches: (member: Named) => boolean;
}

export function useMultiNameSearch(members: readonly Named[]): MultiNameSearch {
  const [query, setQuery] = useState("");
  const [multi, setMulti] = useState<MultiNameSearch["multi"]>(null);

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!looksLikeList(text)) return;
    const names = parseParticipantNames(text);
    if (names.length === 0) return;
    event.preventDefault();
    // matchParticipantNames trims a display name the way it trims the paste ("김복건(운영진)",
    // a whole 실명/연도/… nickname), so the shown name is enough.
    const candidates = members.map((m) => ({ id: m.id, names: [m.name] }));
    setMulti({ ...matchParticipantNames(names, candidates), total: names.length });
    setQuery("");
  }

  const matched = new Set(multi?.matchedIds ?? []);
  const q = query.trim().toLowerCase();
  return {
    query,
    multi,
    onQueryChange: (value) => {
      setMulti(null);
      setQuery(value);
    },
    onPaste,
    clear: () => {
      setMulti(null);
      setQuery("");
    },
    matches: (m) => (multi ? matched.has(m.id) : !q || m.name.toLowerCase().includes(q)),
  };
}

export const MULTI_NAME_PLACEHOLDER = "이름 검색 · 모집글을 붙여넣으면 여러 명을 한 번에 찾습니다";

export function MultiNameMatchBar({
  search,
  onSelectMatched,
  disabled = false,
}: {
  search: MultiNameSearch;
  onSelectMatched: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { multi } = search;
  if (!multi) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-accent/30 bg-accent-tint px-3 py-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-fg">
          붙여넣은 {multi.total}명 중 {multi.total - multi.unmatched.length}명 찾음
        </span>
        <button
          type="button"
          disabled={disabled || multi.matchedIds.length === 0}
          onClick={() => onSelectMatched(multi.matchedIds)}
          className="rounded-md bg-accent px-2.5 py-1 font-bold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          찾은 사람 모두 선택
        </button>
        <button
          type="button"
          onClick={search.clear}
          className="rounded-md border border-ink/[.12] px-2.5 py-1 font-bold text-fg-2 hover:bg-hover"
        >
          필터 해제
        </button>
      </div>
      {multi.unmatched.length > 0 && (
        <div className="text-danger-soft">못 찾음: {multi.unmatched.join(", ")}</div>
      )}
      {multi.ambiguous.length > 0 && (
        <div className="text-orange">동명이인이 있어 모두 표시: {multi.ambiguous.join(", ")}</div>
      )}
    </div>
  );
}
