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
      <span className="text-fg-2">{player.name}</span>{" "}
      <span className="font-mono text-[12px] text-faint">
        {player.mmrBefore}→{player.mmrAfter}
      </span>{" "}
      <span className={`font-mono text-[12px] ${up ? "text-success-soft" : "text-danger-soft"}`}>
        {player.delta > 0 ? `+${player.delta}` : player.delta}
      </span>
    </span>
  );
}

export function GameHistoryList({
  rows,
  isAdmin,
  showMode,
}: {
  rows: GameHistoryRow[];
  isAdmin: boolean;
  // 전체 보기에서만 협곡/칼바람 배지를 붙인다. 한 모드로 걸러 놓으면 배지가 전부 같아 소음이다.
  showMode: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-ink/[.07] bg-surface-2 px-5 py-12 text-center text-[13.5px] text-ghost">
        조건에 맞는 경기가 없습니다.
      </div>
    );
  }

  function handleCancel(id: string) {
    if (!window.confirm("이 모드의 가장 최근 경기를 되돌립니다. 참가자들의 MMR이 경기 전 값으로 돌아갑니다.\n\n되돌린 경기는 다시 살릴 수 없습니다. 진행할까요?")) {
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
        <div className="rounded-lg border border-danger/30 bg-danger/[.10] px-3 py-2.5 text-[13px] text-danger-soft">
          {error}
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className={`rounded-xl border px-5 py-4 ${
            row.isCancelled
              ? "border-ink/[.05] bg-inset opacity-60"
              : "border-ink/[.07] bg-surface-2"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-muted">{formatPlayedAt(row.playedAt)}</span>
            {showMode && (
              <span
                className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${
                  row.mode === "ARAM" ? "bg-orange/15 text-orange" : "bg-accent-soft/15 text-accent-soft"
                }`}
              >
                {row.mode === "ARAM" ? "칼바람" : "협곡"}
              </span>
            )}
            {row.isCancelled ? (
              <span className="rounded-md bg-purple-tint px-2 py-0.5 text-[12px] font-bold text-purple">
                취소됨
              </span>
            ) : (
              <span
                className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${
                  row.winner === "BLUE"
                    ? "bg-accent/20 text-accent-soft"
                    : "bg-danger/20 text-danger-soft"
                }`}
              >
                {row.winner === "BLUE" ? "블루 승" : "레드 승"}
              </span>
            )}
            <span className="text-[12.5px] text-faint">
              {row.createdByLabel} 입력
              {row.cancelledByLabel !== null && ` · ${row.cancelledByLabel} 취소`}
            </span>

            {isAdmin && row.canCancel && (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleCancel(row.id)}
                className="ml-auto rounded-lg bg-raised px-3 py-1.5 text-[13px] font-bold text-fg-2 transition-colors hover:bg-raised-hover disabled:opacity-35"
              >
                되돌리기
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-[13.5px]">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="w-3 flex-none text-success-soft">↑</span>
              {row.winners.map((p) => (
                <PlayerLine key={p.name} player={p} up />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="w-3 flex-none text-danger-soft">↓</span>
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
