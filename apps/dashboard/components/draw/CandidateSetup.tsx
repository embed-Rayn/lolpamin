"use client";

import { useState } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { nextManualId, normalizeManualName, validateNumberRange } from "@/lib/draw/candidates";

export type CandidateSource = "members" | "numbers";

export interface CandidateSetupProps {
  pool: LinkedMemberOption[];
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
  "rounded-lg border border-white/[.09] bg-[#0E1117] px-2.5 py-1.5 text-[13.5px] text-[#E6EAF2] outline-none focus:border-[#4472C4] disabled:opacity-40";

export function CandidateSetup({
  pool,
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

  const visible = pool.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
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
    <div className="flex flex-col gap-3 rounded-xl border border-white/[.07] bg-[#12161F] p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-[#0E1117] p-1">
          {(["members", "numbers"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onSourceChange(s)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-bold disabled:opacity-40 ${
                source === s ? "bg-[#20293A] text-white" : "text-[#8A94A6]"
              }`}
            >
              {s === "members" ? "회원" : "숫자"}
            </button>
          ))}
        </div>
        {locked && (
          <div className="text-[12px] text-[#F2985C]">진행 중 — 후보를 바꾸려면 리셋하세요</div>
        )}
      </div>

      {source === "members" ? (
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
            <div className="rounded-lg bg-[#161B26] px-3 py-6 text-center text-[13px] text-[#8A94A6]">
              계정이 연결된 회원이 없습니다. 05 계정 연결에서 먼저 연결하거나, 위 탭에서 숫자 뽑기를
              쓰세요.
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto">
              {visible.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
                    selectedIds.has(m.id) ? "bg-[#20293A] text-white" : "bg-[#161B26] text-[#95A0B2]"
                  } ${locked ? "opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    className="accent-[#4472C4]"
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
          {manualError && <div className="text-[12.5px] text-[#E06C75]">{manualError}</div>}
          {manual.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manual.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1.5 rounded-full bg-[#2A2033] px-2.5 py-1 text-[12.5px] text-[#D8B4F5]"
                >
                  {c.label}
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onManualChange(manual.filter((x) => x.id !== c.id))}
                    className="text-[#8A94A6] hover:text-white disabled:opacity-40"
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
          <div className="flex items-center gap-2 text-[13.5px] text-[#95A0B2]">
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
          {rangeError && <div className="text-[12.5px] text-[#E06C75]">{rangeError}</div>}
        </>
      )}
    </div>
  );
}
