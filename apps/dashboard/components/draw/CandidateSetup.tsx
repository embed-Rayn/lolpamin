"use client";

import { useState } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { nextManualId, normalizeManualName, validateNumberRange } from "@/lib/draw/candidates";

// "teams" picks from the same member list as "members"; the difference is what
// the screen does with the draw, not who is in it.
export type CandidateSource = "members" | "numbers" | "teams";

const SOURCE_LABEL: Record<CandidateSource, string> = {
  members: "회원",
  numbers: "숫자",
  teams: "랜덤 팀짜기",
};

export interface CandidateSetupProps {
  pool: LinkedMemberOption[];
  sources: readonly CandidateSource[];
  source: CandidateSource;
  onSourceChange: (source: CandidateSource) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  manual: DrawCandidate[];
  onManualChange: (manual: DrawCandidate[]) => void;
  range: { min: number; max: number };
  onRangeChange: (range: { min: number; max: number }) => void;
  locked: boolean;
}

const FIELD =
  "rounded-lg border border-ink/[.09] bg-page px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent disabled:opacity-40";

export function CandidateSetup({
  pool,
  sources,
  source,
  onSourceChange,
  selectedIds,
  onSelectedIdsChange,
  manual,
  onManualChange,
  range,
  onRangeChange,
  locked,
}: CandidateSetupProps) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  // The pool arrives MMR-desc (shared with the ranking screens); a picker is
  // scanned by name, so reorder it here rather than in the query.
  const visible = pool
    .filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const rangeError = validateNumberRange(range.min, range.max);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function addManual() {
    const label = normalizeManualName(manualName);
    if (label === "") {
      setManualError("이름을 입력하세요.");
      return;
    }
    const taken =
      manual.some((c) => c.label === label) ||
      pool.some((m) => selectedIds.has(m.id) && m.name === label);
    if (taken) {
      setManualError("이미 있는 이름입니다.");
      return;
    }
    setManualError(null);
    setManualName("");
    onManualChange([...manual, { id: nextManualId(manual), label }]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink/[.07] bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-page p-1">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onSourceChange(s)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-bold disabled:opacity-40 ${
                source === s ? "bg-raised text-fg" : "text-muted"
              }`}
            >
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        {locked && (
          <div className="text-[12px] text-orange">진행 중 — 후보를 바꾸려면 리셋하세요</div>
        )}
      </div>

      {source !== "numbers" ? (
        <>
          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} flex-1`}
              placeholder="이름 검색"
              value={query}
              disabled={locked}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={() => onSelectedIdsChange(new Set(pool.map((m) => m.id)))}
            >
              전체 선택
            </button>
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={() => onSelectedIdsChange(new Set())}
            >
              전체 해제
            </button>
          </div>

          {pool.length === 0 ? (
            <div className="rounded-lg bg-surface-3 px-3 py-6 text-center text-[13px] text-muted">
              계정이 연결된 회원이 없습니다. 05 계정 연결에서 먼저 연결하거나, 위 탭에서 숫자 뽑기를
              쓰세요.
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-8 gap-1.5 overflow-y-auto">
              {visible.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
                    selectedIds.has(m.id) ? "bg-accent-tint text-accent-soft" : "bg-surface-3 text-muted"
                  } ${locked ? "opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={selectedIds.has(m.id)}
                    disabled={locked}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="truncate">{m.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} flex-1`}
              placeholder="명단에 없는 사람 이름 추가"
              value={manualName}
              disabled={locked}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManual();
                }
              }}
            />
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={addManual}
            >
              추가
            </button>
          </div>
          {manualError && <div className="text-[12.5px] text-danger-soft">{manualError}</div>}
          {manual.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manual.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1.5 rounded-full bg-purple-tint px-2.5 py-1 text-[12.5px] text-purple"
                >
                  {c.label}
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onManualChange(manual.filter((x) => x.id !== c.id))}
                    className="text-muted hover:text-fg disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[13.5px] text-muted">
            <input
              type="number"
              className={`${FIELD} w-24`}
              value={range.min}
              disabled={locked}
              onChange={(e) => onRangeChange({ ...range, min: Number(e.target.value) })}
            />
            <span>부터</span>
            <input
              type="number"
              className={`${FIELD} w-24`}
              value={range.max}
              disabled={locked}
              onChange={(e) => onRangeChange({ ...range, max: Number(e.target.value) })}
            />
            <span>까지</span>
          </div>
          {rangeError && <div className="text-[12.5px] text-danger-soft">{rangeError}</div>}
        </>
      )}
    </div>
  );
}
