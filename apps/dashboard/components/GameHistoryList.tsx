"use client";

import { useState, useTransition } from "react";
import type { GameHistoryPlayer, GameHistoryRow } from "@/lib/queries/game-history";
import { cancelGameResultAction } from "@/app/match-history/actions";

function formatPlayedAt(playedAt: Date): string {
  const d = new Date(playedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlayerLine({ player, up }: { player: GameHistoryPlayer; up: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[#C7D0DF]">{player.name}</span>{" "}
      <span className="font-mono text-[12px] text-[#6E7889]">
        {player.mmrBefore}→{player.mmrAfter}
      </span>{" "}
      <span className={`font-mono text-[12px] ${up ? "text-[#9BD173]" : "text-[#EE8B8B]"}`}>
        {player.delta > 0 ? `+${player.delta}` : player.delta}
      </span>
    </span>
  );
}

export function GameHistoryList({ rows, isAdmin }: { rows: GameHistoryRow[]; isAdmin: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/[.07] bg-[#12161F] px-5 py-12 text-center text-[13.5px] text-[#5C6577]">
        아직 입력된 경기가 없습니다.
      </div>
    );
  }

  function handleCancel(id: string) {
    if (!window.confirm("가장 최근 경기를 되돌립니다. 참가자들의 MMR이 경기 전 값으로 돌아갑니다.\n\n되돌린 경기는 다시 살릴 수 없습니다. 진행할까요?")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelGameResultAction(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.10] px-3 py-2.5 text-[13px] text-[#EE8B8B]">
          {error}
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className={`rounded-xl border px-5 py-4 ${
            row.isCancelled
              ? "border-white/[.05] bg-[#0F131B] opacity-60"
              : "border-white/[.07] bg-[#12161F]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-[#8A94A6]">{formatPlayedAt(row.playedAt)}</span>
            {row.isCancelled ? (
              <span className="rounded-md bg-[#2A2033] px-2 py-0.5 text-[12px] font-bold text-[#C79BE5]">
                취소됨
              </span>
            ) : (
              <span
                className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${
                  row.winner === "BLUE"
                    ? "bg-[#4472C4]/20 text-[#8FB4F5]"
                    : "bg-[#E05A5A]/20 text-[#EE8B8B]"
                }`}
              >
                {row.winner === "BLUE" ? "블루 승" : "레드 승"}
              </span>
            )}
            <span className="text-[12.5px] text-[#6E7889]">
              {row.createdByLabel} 입력
              {row.cancelledByLabel !== null && ` · ${row.cancelledByLabel} 취소`}
            </span>

            {isAdmin && row.canCancel && (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleCancel(row.id)}
                className="ml-auto rounded-lg bg-[#20293A] px-3 py-1.5 text-[13px] font-bold text-[#C7D0DF] transition-colors hover:bg-[#27324A] disabled:opacity-35"
              >
                되돌리기
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-[13.5px]">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="w-3 flex-none text-[#9BD173]">↑</span>
              {row.winners.map((p) => (
                <PlayerLine key={p.name} player={p} up />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="w-3 flex-none text-[#EE8B8B]">↓</span>
              {row.losers.map((p) => (
                <PlayerLine key={p.name} player={p} up={false} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
