"use client";

import { useMemo, useState } from "react";
import { calculateTeamMmrChange, MMR_K, PARTICIPATION_POINT, type TeamSide } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { saveGameResultAction } from "@/app/matches/actions";

type Team = "blue" | "red";
type Assignment = Team | null;

const TEAM_SIZE = 5;

const ROSTER_GRID = "grid grid-cols-[32px_1fr_1fr_44px_44px_60px_92px_28px] items-center gap-2";

export function MatchBuilder({ pool, isAdmin }: { pool: LinkedMemberOption[]; isAdmin: boolean }) {
  const [poolQuery, setPoolQuery] = useState("");
  // Attendance order. Team assignment lives in a separate map so a participant
  // can sit in the roster unassigned until someone picks their side.
  const [roster, setRoster] = useState<string[]>([]);
  const [teamById, setTeamById] = useState<Record<string, Assignment>>({});
  const [winner, setWinner] = useState<TeamSide | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const attending = new Set(roster);

  const visiblePool = pool.filter((p) => !poolQuery || p.name.toLowerCase().includes(poolQuery.toLowerCase()));

  const blueIds = roster.filter((id) => teamById[id] === "blue");
  const redIds = roster.filter((id) => teamById[id] === "red");
  const unassignedCount = roster.length - blueIds.length - redIds.length;

  const preview = useMemo(() => {
    if (blueIds.length === 0 || redIds.length === 0 || !winner) return null;
    const blueRatings = blueIds.map((id) => byId.get(id)!.mmr);
    const redRatings = redIds.map((id) => byId.get(id)!.mmr);
    const result = calculateTeamMmrChange({ blueRatings, redRatings, winner });
    const toRow = (id: string, delta: number) => ({ ...byId.get(id)!, delta, after: byId.get(id)!.mmr + delta });
    return {
      ...result,
      rows: [...blueIds.map((id) => toRow(id, result.blueDelta)), ...redIds.map((id) => toRow(id, result.redDelta))],
    };
  }, [blueIds, redIds, winner, byId]);

  const canSave = blueIds.length > 0 && redIds.length > 0 && winner !== null && unassignedCount === 0;

  function averageMmr(ids: string[]): string {
    if (ids.length === 0) return "—";
    return String(Math.round(ids.reduce((sum, id) => sum + byId.get(id)!.mmr, 0) / ids.length));
  }

  function attend(id: string) {
    if (attending.has(id)) return;
    setRoster([...roster, id]);
    setTeamById({ ...teamById, [id]: null });
    setSavedMessage(null);
  }

  function leave(id: string) {
    setRoster(roster.filter((x) => x !== id));
    const next = { ...teamById };
    delete next[id];
    setTeamById(next);
    setSavedMessage(null);
  }

  function assign(id: string, team: Assignment) {
    setTeamById({ ...teamById, [id]: team });
    setSavedMessage(null);
  }

  function clearRoster() {
    setRoster([]);
    setTeamById({});
    setWinner(null);
  }

  async function handleSave() {
    if (!canSave || !winner) return;
    setIsSaving(true);
    try {
      const result = await saveGameResultAction({
        playedAt: new Date(),
        blueMemberIds: blueIds,
        redMemberIds: redIds,
        winner,
      });
      setSavedMessage(`저장됨 · ${result.updates.length}명의 MMR이 재계산되었습니다.`);
      clearRoster();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[296px_1fr_300px] items-start gap-4">
      <section className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="flex flex-col gap-2 border-b border-white/[.06] p-4">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[13px] font-bold">참가자 선택</h2>
            <span className="text-[10.5px] text-[#6E7889]">매핑 완료 회원만</span>
          </div>
          <input
            value={poolQuery}
            onChange={(e) => setPoolQuery(e.target.value)}
            placeholder="회원 검색"
            className="w-full rounded-lg border border-white/[.09] bg-[#0F131B] px-2.5 py-1.5 text-xs text-[#E6EAF2] outline-none focus:border-[#4472C4]"
          />
        </div>
        <div className="flex max-h-[520px] flex-col overflow-y-auto">
          {visiblePool.map((p) => {
            const isAttending = attending.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5 ${isAttending ? "opacity-35" : ""}`}
              >
                <div className="flex flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-semibold">{p.name}</span>
                  <span className="font-mono text-[10.5px] text-[#6E7889]">MMR {p.mmr}</span>
                </div>
                <button
                  onClick={() => attend(p.id)}
                  disabled={isAttending}
                  className={`rounded-md border px-2.5 py-1 text-[10.5px] font-bold ${
                    isAttending
                      ? "cursor-not-allowed border-white/[.09] text-[#5C6577]"
                      : "border-[#70AD47]/40 bg-[#70AD47]/[.12] text-[#9BD173]"
                  }`}
                >
                  {isAttending ? "참석됨" : "참석"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
            <div>
              <div className="text-[12.5px] font-bold">참가자 정보</div>
              <div className="text-[11px] text-[#6E7889]">
                참석 {roster.length}명
                {unassignedCount > 0 && <span className="text-[#F2C75C]"> · 미배정 {unassignedCount}명</span>}
              </div>
            </div>
            {roster.length > 0 && (
              <button onClick={clearRoster} className="rounded-md border border-white/[.12] px-2.5 py-1 text-[10.5px] text-[#7A8496]">
                전체 비우기
              </button>
            )}
          </div>

          {roster.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11.5px] text-[#5C6577]">
              왼쪽 목록에서 참석 버튼을 눌러 참가자를 추가하세요.
            </div>
          ) : (
            <>
              <div className={`${ROSTER_GRID} border-b border-white/[.06] bg-[#12161F] px-4 py-2.5 text-[11px] font-bold text-[#6E7889]`}>
                <div className="text-right">#</div>
                <div>이름</div>
                <div>디코 닉네임</div>
                <div className="text-right">승</div>
                <div className="text-right">패</div>
                <div className="text-right">MMR</div>
                <div className="text-center">팀</div>
                <div />
              </div>
              {roster.map((id, index) => {
                const m = byId.get(id)!;
                const team = teamById[id] ?? null;
                const blueFull = blueIds.length >= TEAM_SIZE && team !== "blue";
                const redFull = redIds.length >= TEAM_SIZE && team !== "red";
                return (
                  <div key={id} className={`${ROSTER_GRID} border-b border-white/[.04] px-4 py-2.5 text-[12.5px]`}>
                    <div className="text-right font-mono text-[11px] text-[#5C6577]">{index + 1}</div>
                    <div className="truncate font-semibold">{m.name}</div>
                    <div className="truncate font-mono text-[11.5px] text-[#8FA9F5]">{m.discordName}</div>
                    <div className="text-right font-mono text-[12px] text-[#9BD173]">{m.wins}</div>
                    <div className="text-right font-mono text-[12px] text-[#EE8B8B]">{m.losses}</div>
                    <div className="text-right font-mono text-[12.5px] font-bold">{m.mmr}</div>
                    <select
                      value={team ?? ""}
                      onChange={(e) => assign(id, (e.target.value || null) as Assignment)}
                      className={`rounded-md border bg-[#0F131B] px-1.5 py-1 text-[11px] font-bold outline-none ${
                        team === "blue"
                          ? "border-[#4472C4]/50 text-[#8FB4F5]"
                          : team === "red"
                            ? "border-[#E05A5A]/50 text-[#EE8B8B]"
                            : "border-[#F2C75C]/40 text-[#F2C75C]"
                      }`}
                    >
                      <option value="">미배정</option>
                      <option value="blue" disabled={blueFull}>
                        블루
                      </option>
                      <option value="red" disabled={redFull}>
                        레드
                      </option>
                    </select>
                    <button onClick={() => leave(id)} className="text-[13px] text-[#5C6577]">
                      ×
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-white/[.06] bg-[#151A24] px-4 py-3.5">
          <div>
            <div className="text-[12.5px] font-bold">경기 정보</div>
            <div className="text-[11px] text-[#6E7889]">
              5v5 내전 · 승/패 방식 · K값 {MMR_K} · 참여 점수 +{PARTICIPATION_POINT}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["blue", "red"] as const).map((team) => {
              const ids = team === "blue" ? blueIds : redIds;
              const side = team.toUpperCase() as TeamSide;
              const isWinner = winner === side;
              return (
                <div
                  key={team}
                  className="flex items-center justify-between rounded-lg border border-white/[.06] px-3 py-2.5"
                  style={{ background: team === "blue" ? "rgba(68,114,196,.12)" : "rgba(224,90,90,.11)" }}
                >
                  <div className="flex flex-col">
                    <span className="text-[12px] font-extrabold" style={{ color: team === "blue" ? "#8FB4F5" : "#EE8B8B" }}>
                      {team === "blue" ? "BLUE" : "RED"}{" "}
                      <span className="font-mono text-[11px] text-[#7A8496]">
                        {ids.length}/{TEAM_SIZE}
                      </span>
                    </span>
                    <span className="text-[10.5px] text-[#7A8496]">
                      평균 MMR <span className="font-mono font-bold text-[#E6EAF2]">{averageMmr(ids)}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => setWinner(isWinner ? null : side)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                      isWinner ? "border-transparent text-white" : "border-white/[.14] text-[#7A8496]"
                    }`}
                    style={isWinner ? { background: team === "blue" ? "#4472C4" : "#E05A5A" } : {}}
                  >
                    승리
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="border-b border-white/[.06] px-4 py-3.5">
          <h2 className="m-0 text-[13px] font-bold">저장 전 미리보기</h2>
          <span className="text-[10.5px] text-[#6E7889]">
            {preview ? "팀 평균 기준 · 참여 점수 포함" : "승리 팀 선택 시 계산"}
          </span>
        </div>
        <div className="flex flex-col">
          {preview ? (
            preview.rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5">
                <span className="flex-1 truncate text-xs font-semibold">{row.name}</span>
                <span className="font-mono text-[11px] text-[#6E7889]">{row.mmr}</span>
                <span className="text-[10px] text-[#4E576A]">→</span>
                <span className="w-9 text-right font-mono text-xs font-bold">{row.after}</span>
                <span className={`w-9 text-right font-mono text-[11px] font-bold ${row.delta > 0 ? "text-[#9BD173]" : "text-[#EE8B8B]"}`}>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-7 text-center text-[11.5px] leading-relaxed text-[#5C6577]">
              양 팀에 참가자를 배정하고
              <br />
              승리 팀을 선택하면
              <br />
              예상 MMR 변동이 표시됩니다.
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-white/[.06] p-4">
          {isAdmin ? (
            <button
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className={`w-full rounded-lg py-2.5 text-[13px] font-extrabold ${
                canSave && !isSaving ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
              }`}
            >
              결과 저장 · MMR 반영
            </button>
          ) : (
            <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[11.5px] text-[#8A94A6]">
              변경하려면 관리자 로그인이 필요합니다.
            </div>
          )}
          {isAdmin && unassignedCount > 0 && (
            <div className="rounded-lg border border-[#F2C75C]/30 bg-[#F2C75C]/[.10] p-2.5 text-[11px] text-[#F2C75C]">
              미배정 {unassignedCount}명 — 모두 팀을 정해야 저장할 수 있습니다.
            </div>
          )}
          {savedMessage && (
            <div className="rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[11px] leading-relaxed text-[#9BD173]">
              {savedMessage}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
