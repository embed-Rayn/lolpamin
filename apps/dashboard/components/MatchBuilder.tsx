"use client";

import { useMemo, useState } from "react";
import { calculateTeamEloChange, ELO_K, type TeamSide } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { saveGameResultAction } from "@/app/matches/actions";

export function MatchBuilder({ pool }: { pool: LinkedMemberOption[] }) {
  const [poolQuery, setPoolQuery] = useState("");
  const [blueIds, setBlueIds] = useState<string[]>([]);
  const [redIds, setRedIds] = useState<string[]>([]);
  const [winner, setWinner] = useState<TeamSide | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const usedIds = new Set([...blueIds, ...redIds]);

  const visiblePool = pool.filter((p) => !poolQuery || p.name.toLowerCase().includes(poolQuery.toLowerCase()));

  const preview = useMemo(() => {
    if (blueIds.length === 0 || redIds.length === 0 || !winner) return null;
    const blueRatings = blueIds.map((id) => byId.get(id)!.elo);
    const redRatings = redIds.map((id) => byId.get(id)!.elo);
    const result = calculateTeamEloChange({ blueRatings, redRatings, winner });
    return {
      ...result,
      blueRows: blueIds.map((id) => ({ ...byId.get(id)!, delta: result.blueDelta, after: byId.get(id)!.elo + result.blueDelta })),
      redRows: redIds.map((id) => ({ ...byId.get(id)!, delta: result.redDelta, after: byId.get(id)!.elo + result.redDelta })),
    };
  }, [blueIds, redIds, winner, byId]);

  const canSave = blueIds.length > 0 && redIds.length > 0 && winner !== null;

  function addTo(team: "blue" | "red", id: string) {
    if (usedIds.has(id)) return;
    if (team === "blue" && blueIds.length < 5) setBlueIds([...blueIds, id]);
    if (team === "red" && redIds.length < 5) setRedIds([...redIds, id]);
    setSavedMessage(null);
  }

  function removeFrom(team: "blue" | "red", id: string) {
    if (team === "blue") setBlueIds(blueIds.filter((x) => x !== id));
    if (team === "red") setRedIds(redIds.filter((x) => x !== id));
    setSavedMessage(null);
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
      setSavedMessage(`저장됨 · ${result.updates.length}명의 ELO가 재계산되었습니다.`);
      setBlueIds([]);
      setRedIds([]);
      setWinner(null);
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
          {visiblePool.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5 ${usedIds.has(p.id) ? "opacity-35" : ""}`}>
              <div className="flex flex-1 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{p.name}</span>
                <span className="font-mono text-[10.5px] text-[#6E7889]">ELO {p.elo}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => addTo("blue", p.id)} className="rounded-md border border-[#4472C4]/40 bg-[#4472C4]/[.12] px-1.5 py-1 text-[10.5px] font-bold text-[#8FB4F5]">
                  블루
                </button>
                <button onClick={() => addTo("red", p.id)} className="rounded-md border border-[#E05A5A]/40 bg-[#E05A5A]/[.12] px-1.5 py-1 text-[10.5px] font-bold text-[#EE8B8B]">
                  레드
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="rounded-xl border border-white/[.06] bg-[#151A24] px-4 py-3.5">
          <div className="text-[12.5px] font-bold">경기 정보</div>
          <div className="text-[11px] text-[#6E7889]">5v5 내전 · 승/패 방식 · K값 {ELO_K}</div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          {(["blue", "red"] as const).map((team) => {
            const ids = team === "blue" ? blueIds : redIds;
            const accent = team === "blue" ? "#8FB4F5" : "#EE8B8B";
            const isWinner = winner === team.toUpperCase();
            return (
              <div key={team} className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
                <div className="flex flex-col gap-2 border-b border-white/[.06] px-3.5 py-3" style={{ background: team === "blue" ? "rgba(68,114,196,.12)" : "rgba(224,90,90,.11)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold" style={{ color: accent }}>
                      {team === "blue" ? "BLUE TEAM" : "RED TEAM"}
                    </span>
                    <span className="font-mono text-[11px] text-[#7A8496]">{ids.length}/5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-[#7A8496]">
                      평균 ELO{" "}
                      <span className="font-mono font-bold text-[#E6EAF2]">
                        {ids.length ? Math.round(ids.reduce((s, id) => s + byId.get(id)!.elo, 0) / ids.length) : "—"}
                      </span>
                    </span>
                    <button
                      onClick={() => setWinner(isWinner ? null : (team.toUpperCase() as TeamSide))}
                      className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                        isWinner ? "border-transparent text-white" : "border-white/[.14] text-[#7A8496]"
                      }`}
                      style={isWinner ? { background: team === "blue" ? "#4472C4" : "#E05A5A" } : {}}
                    >
                      승리
                    </button>
                  </div>
                </div>
                <div className="flex min-h-[230px] flex-col gap-1.5 p-2">
                  {ids.map((id) => {
                    const m = byId.get(id)!;
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-lg border border-white/[.05] bg-[#1A2130] px-2.5 py-2">
                        <span className="flex-1 text-[12.5px] font-semibold">{m.name}</span>
                        <span className="font-mono text-[11px] text-[#8A94A6]">{m.elo}</span>
                        <button onClick={() => removeFrom(team, id)} className="text-[13px] text-[#5C6577]">
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {ids.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/[.09] text-[11.5px] text-[#5C6577]">
                      왼쪽 목록에서 {team === "blue" ? "블루" : "레드"} 추가
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
        <div className="border-b border-white/[.06] px-4 py-3.5">
          <h2 className="m-0 text-[13px] font-bold">저장 전 미리보기</h2>
          <span className="text-[10.5px] text-[#6E7889]">
            {preview ? "Elo K=32 · 팀 평균 기준" : "승리 팀 선택 시 계산"}
          </span>
        </div>
        <div className="flex flex-col">
          {preview ? (
            [...preview.blueRows, ...preview.redRows].map((row) => (
              <div key={row.id} className="flex items-center gap-2 border-b border-white/[.04] px-3.5 py-2.5">
                <span className="flex-1 truncate text-xs font-semibold">{row.name}</span>
                <span className="font-mono text-[11px] text-[#6E7889]">{row.elo}</span>
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
              양 팀에 참가자를 넣고
              <br />
              승리 팀을 선택하면
              <br />
              예상 ELO 변동이 표시됩니다.
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-white/[.06] p-4">
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className={`w-full rounded-lg py-2.5 text-[13px] font-extrabold ${
              canSave && !isSaving ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            결과 저장 · ELO 반영
          </button>
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
