"use client";

import { useMemo, useRef, useState } from "react";
import { prepareReplayImportAction, saveReplayImportAction } from "@/app/replay-import/actions";
import { isMemberOfferable } from "@/lib/replay-import/offerable";
import type { ImportSlot, PreparedReplayImport } from "@/lib/replay-import/prepare-import";

// 화면이 관리하는 상태. manual은 관리자가 직접 고른 것이라 확정(녹색)으로 친다.
type Resolution = "confirmed" | "auto" | "outsider" | "manual" | "unresolved";

interface SlotState {
  memberId: string | null;
  resolution: Resolution;
}

const STRIPE: Record<Resolution, string> = {
  confirmed: "#70AD47",
  manual: "#70AD47",
  auto: "#4472C4",
  outsider: "#5C6577",
  unresolved: "#C9A227",
};

const STATUS_LABEL: Record<Resolution, string> = {
  confirmed: "확정",
  manual: "직접 선택",
  auto: "자동",
  outsider: "회원 아님",
  unresolved: "미해결",
};

const POSITION_LABEL: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서폿",
};

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, "0")}초`;
}

/** <input type="date">가 읽는 형식. 파일의 lastModified가 기본값이다 — 파일에 벽시계 시각이 없다. */
function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function initialState(slots: ImportSlot[]): Record<string, SlotState> {
  return Object.fromEntries(
    slots.map((s) => [s.puuid, { memberId: s.memberId, resolution: s.status as Resolution }]),
  );
}

export function ReplayImportForm({ isAdmin }: { isAdmin: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedReplayImport | null>(null);
  const [state, setState] = useState<Record<string, SlotState>>({});
  const [playedAt, setPlayedAt] = useState<string>(toDateInput(new Date()));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragleave는 자식 요소로 들어갈 때도 올라온다 — KakaoImportForm과 같은 이유로 깊이를 센다.
  const dragDepth = useRef(0);

  const unresolved = useMemo(
    () => Object.values(state).filter((s) => s.resolution === "unresolved").length,
    [state],
  );
  const takenMemberIds = useMemo(
    () => new Set(Object.values(state).map((s) => s.memberId).filter((id): id is string => id !== null)),
    [state],
  );
  const labelOf = (memberId: string) => prepared?.members.find((m) => m.id === memberId)?.label ?? memberId;

  async function accept(picked: File | null | undefined) {
    if (!picked) return;
    setSavedCount(null);
    if (!picked.name.toLowerCase().endsWith(".rofl")) {
      setFile(null);
      setError("rofl 파일만 올릴 수 있습니다.");
      return;
    }
    setError(null);
    setFile(picked);
    setPlayedAt(toDateInput(new Date(picked.lastModified)));

    setIsBusy(true);
    try {
      const form = new FormData();
      form.append("replay", picked);
      const result = await prepareReplayImportAction(form);
      setPrepared(result);
      setState(initialState(result.slots));
    } catch (e) {
      setPrepared(null);
      setError(e instanceof Error ? e.message : "리플레이를 읽는 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  function assign(puuid: string, memberId: string | null, resolution: Resolution) {
    setState((prev) => ({ ...prev, [puuid]: { memberId, resolution } }));
  }

  async function handleSave() {
    if (!prepared || unresolved > 0) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await saveReplayImportAction({
        replayKey: prepared.replayKey,
        playedAt,
        winner: prepared.winner,
        assignments: prepared.slots.map((s) => ({
          puuid: s.puuid,
          gameName: s.gameName,
          tagLine: s.tagLine,
          team: s.team,
          memberId: state[s.puuid].memberId,
        })),
      });
      setSavedCount(result.updates.length);
      setPrepared(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  function renderSlot(slot: ImportSlot) {
    const current = state[slot.puuid];
    const isOpen = current.resolution === "unresolved";
    // 칩과 선택 목록이 같은 판정을 쓰게 한다. 서버가 준 후보 목록은 정적이라, 관리자가
    // 다른 슬롯에 앉힌 회원이 여기 남아 있을 수 있다 — 그대로 두면 두 슬롯이 같은 회원을
    // 들고 초록으로 바뀌고, 저장이 서버에서 거부된 뒤에야 알게 된다.
    const isOfferable = (memberId: string) => isMemberOfferable(memberId, takenMemberIds, current.memberId);
    const candidates = slot.candidates.filter((c) => isOfferable(c.memberId));
    const others = prepared!.members.filter((m) => isOfferable(m.id));

    return (
      <div
        key={slot.puuid}
        className="flex gap-2.5 rounded-lg border border-white/[.06] bg-[#0F131B] p-2.5"
        style={{ borderLeft: `3px solid ${STRIPE[current.resolution]}` }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            {/* 이름 매칭이 실패해도 "와윅 15/2/4 탑"을 보면 사람은 누구인지 안다. */}
            <span className="text-[13.5px] font-bold">{slot.champion}</span>
            <span className="font-mono text-[12.5px] text-[#B7C0D0]">
              {slot.kills}/{slot.deaths}/{slot.assists}
            </span>
            <span className="text-[12px] text-[#6E7889]">
              {POSITION_LABEL[slot.position] ?? slot.position} · {slot.cs}CS · Lv{slot.level}
            </span>
          </div>
          <div className="truncate text-[12px] text-[#8A94A6]">
            {slot.gameName}#{slot.tagLine}
            {slot.wasAfk && <span className="ml-1.5 text-[#EE8B8B]">AFK</span>}
            {slot.wasLeaver && <span className="ml-1.5 text-[#EE8B8B]">탈주</span>}
          </div>

          {!isOpen ? (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-[#E6EAF2]">
                {current.memberId ? labelOf(current.memberId) : "회원 아님"}
              </span>
              <span className="text-[11.5px]" style={{ color: STRIPE[current.resolution] }}>
                {STATUS_LABEL[current.resolution]}
              </span>
              <button
                type="button"
                onClick={() => assign(slot.puuid, null, "unresolved")}
                className="cursor-pointer text-[11.5px] text-[#6E7889] underline"
              >
                바꾸기
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* 후보를 드롭다운에 숨기지 않는다. 근거와 점수가 보여야 관리자가 잘못된 매칭을 잡아낸다. */}
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((c) => (
                  <button
                    key={c.memberId}
                    type="button"
                    onClick={() => assign(slot.puuid, c.memberId, "manual")}
                    className="cursor-pointer rounded-md border border-[#4472C4]/40 bg-[#4472C4]/[.12] px-2 py-1 text-left"
                  >
                    <span className="text-[12.5px] font-bold text-[#8FB4F5]">{c.label}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-[#6E7889]">{c.score}</span>
                    <span className="ml-1.5 text-[11px] text-[#6E7889]">{c.reasons.join(" · ")}</span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <span className="text-[11.5px] text-[#6E7889]">후보 없음 — 직접 고르거나 회원 아님으로 두세요</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => e.target.value && assign(slot.puuid, e.target.value, "manual")}
                  className="rounded-md border border-white/[.12] bg-[#151A24] px-2 py-1 text-[12.5px]"
                >
                  <option value="">회원 직접 선택…</option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => assign(slot.puuid, null, "outsider")}
                  className="cursor-pointer rounded-md border border-white/[.12] px-2 py-1 text-[12.5px] text-[#8A94A6]"
                >
                  회원 아님
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-bold">리플레이 파일 (.rofl) 업로드</span>
          <span className="text-[12px] text-[#6E7889]">
            롤 클라이언트 &gt; 내 기록에서 내려받은 파일입니다. 같은 경기를 두 번 올리면 거부됩니다.
          </span>
        </div>
        {isAdmin ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".rofl"
              onChange={(e) => accept(e.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setIsDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setIsDragging(false);
                if (!isBusy) accept(e.dataTransfer.files?.[0]);
              }}
              disabled={isBusy}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
                isDragging
                  ? "border-[#70AD47] bg-[#70AD47]/[.10]"
                  : "border-white/[.14] bg-[#0F131B] hover:border-white/[.24] hover:bg-[#131926]"
              }`}
            >
              <span className="text-[13.5px] font-bold text-[#B7C0D0]">
                {isDragging ? "여기에 놓으세요" : "rofl 파일을 끌어다 놓거나 클릭해서 선택"}
              </span>
              <span className="text-[12px] text-[#6E7889]">{file ? file.name : "리플레이 파일 하나"}</span>
            </button>
          </>
        ) : (
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[12.5px] text-[#8A94A6]">
            변경하려면 관리자 로그인이 필요합니다.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[12px] text-[#EE8B8B]">
            {error}
          </div>
        )}
        {savedCount !== null && (
          <div className="rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[12px] text-[#9BD173]">
            저장했습니다. {savedCount}명의 MMR이 갱신됐습니다.
          </div>
        )}
      </div>

      {prepared && (
        <div className="flex flex-col gap-4 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13.5px] font-bold">
              {prepared.winner === "BLUE" ? "블루 승" : "레드 승"}
            </span>
            <span className="text-[12px] text-[#6E7889]">
              패치 {prepared.gameVersion} · {formatDuration(prepared.gameLengthMs)}
            </span>
            {/* 검증 칩. AFK·탈주가 있어도 막지 않는다 — 판단은 관리자 몫이다. */}
            {prepared.slots.some((s) => s.wasAfk) ? (
              <span className="rounded-md bg-[#C9A227]/[.15] px-2 py-0.5 text-[11.5px] text-[#C9A227]">AFK 있음</span>
            ) : (
              <span className="rounded-md bg-[#70AD47]/[.12] px-2 py-0.5 text-[11.5px] text-[#9BD173]">AFK 없음</span>
            )}
            {prepared.slots.some((s) => s.wasLeaver) && (
              <span className="rounded-md bg-[#C9A227]/[.15] px-2 py-0.5 text-[11.5px] text-[#C9A227]">탈주 있음</span>
            )}
            {prepared.endedInSurrender && (
              <span className="rounded-md bg-white/[.06] px-2 py-0.5 text-[11.5px] text-[#8A94A6]">항복 종료</span>
            )}
            <span
              className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-bold"
              style={{
                color: unresolved > 0 ? "#C9A227" : "#9BD173",
                background: unresolved > 0 ? "rgba(201,162,39,.15)" : "rgba(112,173,71,.12)",
              }}
            >
              미해결 {unresolved}
            </span>
          </div>

          <label className="flex w-fit items-center gap-2 text-[12.5px] text-[#8A94A6]">
            경기 날짜
            {/* 리플레이에 벽시계 시각이 없다. 파일의 lastModified를 기본값으로 두고 고치게 한다. */}
            <input
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
              className="rounded-md border border-white/[.12] bg-[#0F131B] px-2 py-1 text-[12.5px] text-[#E6EAF2]"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["BLUE", "RED"] as const).map((team) => (
              <div key={team} className="flex flex-col gap-2">
                <div className="text-[12.5px] font-bold text-[#8A94A6]">
                  {team === "BLUE" ? "블루팀" : "레드팀"}
                  {prepared.winner === team && <span className="ml-1.5 text-[#9BD173]">승</span>}
                </div>
                {prepared.slots.filter((s) => s.team === team).map(renderSlot)}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={!isAdmin || isBusy || unresolved > 0}
            className={`w-fit rounded-lg px-4 py-2 text-[13.5px] font-extrabold ${
              isAdmin && !isBusy && unresolved === 0
                ? "cursor-pointer bg-[#70AD47] text-[#0E1117]"
                : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            {isBusy ? "처리 중..." : unresolved > 0 ? `미해결 ${unresolved}명을 먼저 처리하세요` : "경기 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
