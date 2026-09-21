"use client";

import { useState } from "react";
import { calculateTeamMmrChange, type MmrConfig } from "@lolpamin/core";

const DEFAULT_BLUE = 1200;
const DEFAULT_RED = 1000;

function parseRating(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function deltaColor(delta: number): string {
  if (delta > 0) return "rgb(var(--c-success-soft))";
  if (delta < 0) return "rgb(var(--c-danger-soft))";
  return "rgb(var(--c-muted))";
}

export function MmrSimulator({ config }: { config: MmrConfig }) {
  const [blueRaw, setBlueRaw] = useState(String(DEFAULT_BLUE));
  const [redRaw, setRedRaw] = useState(String(DEFAULT_RED));

  const blueAvg = parseRating(blueRaw);
  const redAvg = parseRating(redRaw);

  // 팀 평균만 있으면 되는 계산이라 1인 팀으로 넣어도 실제 경기와 결과가 같다.
  // 화면에 뜨는 숫자와 저장되는 숫자가 어긋날 수 없도록 실제 계산 함수를 그대로 쓴다.
  const outcomes =
    blueAvg === null || redAvg === null
      ? null
      : {
          blueWins: calculateTeamMmrChange({ blueRatings: [blueAvg], redRatings: [redAvg], winner: "BLUE", config }),
          redWins: calculateTeamMmrChange({ blueRatings: [blueAvg], redRatings: [redAvg], winner: "RED", config }),
        };

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <div>
        <div className="text-[13.5px] font-bold">MMR 계산식</div>
        <div className="text-[12px] text-faint">팀 평균 Elo. 두 팀의 평균 MMR만으로 변동폭이 정해집니다.</div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-ink/[.06] bg-inset px-3.5 py-3 font-mono text-[12px] leading-relaxed text-muted">
        <div>
          <span className="text-accent-soft">기대승률(블루)</span> = 1 / (1 + 10<sup>((레드평균 − 블루평균) / 400)</sup>)
        </div>
        <div>
          <span className="text-accent-soft">변동</span> = round(K × (경기결과 − 기대승률)) + 참가점수
        </div>
        <div className="text-ghost">경기결과: 이기면 1, 지면 0 · 참가점수: 이기면 +{config.winPoint}, 지면 +{config.lossPoint}</div>
        <div className="pt-1 text-muted">
          현재 설정 · K {config.k} · 승리 +{config.winPoint} · 패배 +{config.lossPoint}
        </div>
      </div>

      <div>
        <div className="text-[13.5px] font-bold">시뮬레이터</div>
        <div className="text-[12px] text-faint">평균 MMR이 X, Y인 두 팀이 붙었을 때 각 결과의 변동폭.</div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {(
          [
            ["블루 평균", blueRaw, setBlueRaw, "rgb(var(--c-accent-soft))"],
            ["레드 평균", redRaw, setRedRaw, "rgb(var(--c-danger-soft))"],
          ] as const
        ).map(([label, value, setValue, color]) => (
          <label key={label} className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold" style={{ color }}>
              {label}
            </span>
            <input
              type="number"
              inputMode="numeric"
              step={10}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-[110px] rounded-md border border-ink/[.08] bg-inset px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
            />
          </label>
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-muted">기대 승률</span>
          <span className="py-1.5 font-mono text-[13px] text-fg">
            {outcomes
              ? `블루 ${(outcomes.blueWins.expectedBlueWinRate * 100).toFixed(1)}% · 레드 ${(
                  (1 - outcomes.blueWins.expectedBlueWinRate) *
                  100
                ).toFixed(1)}%`
              : "—"}
          </span>
        </div>
      </div>

      {outcomes === null ? (
        <div className="text-[12px] text-faint">두 팀의 평균 MMR을 모두 입력하세요.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[12px] text-faint">
                <th className="w-[110px] py-1.5 text-left font-bold"> </th>
                <th className="py-1.5 text-right font-bold">블루 승리 시</th>
                <th className="py-1.5 text-right font-bold">레드 승리 시</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["블루 팀원", "rgb(var(--c-accent-soft))", outcomes.blueWins.blueDelta, outcomes.redWins.blueDelta],
                  ["레드 팀원", "rgb(var(--c-danger-soft))", outcomes.blueWins.redDelta, outcomes.redWins.redDelta],
                ] as const
              ).map(([label, color, onBlueWin, onRedWin]) => (
                <tr key={label} className="border-t border-ink/[.06]">
                  <td className="py-2 text-[12.5px] font-extrabold" style={{ color }}>
                    {label}
                  </td>
                  {[onBlueWin, onRedWin].map((delta, index) => (
                    <td
                      key={index}
                      className="py-2 text-right font-mono text-[14px] font-bold"
                      style={{ color: deltaColor(delta) }}
                    >
                      {signed(delta)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pt-2 text-[11.5px] text-ghost">
            한 경기당 풀 전체로는 +{config.winPoint + config.lossPoint}점이 들어옵니다 — 참가 보너스만큼 인플레이션이
            일어납니다.
          </div>
        </div>
      )}
    </div>
  );
}
