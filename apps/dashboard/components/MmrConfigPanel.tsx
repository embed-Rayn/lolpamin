"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_MMR_CONFIG,
  MMR_K_MAX,
  MMR_K_MIN,
  MMR_POINT_MAX,
  MMR_POINT_MIN,
  type MmrConfig,
} from "@lolpamin/core";
import { updateMmrConfigAction } from "@/app/admins/actions";

export interface MmrConfigPanelProps {
  config: MmrConfig;
  // 마지막으로 바꾼 사람과 시각. 한 번도 저장한 적이 없으면 null이고 "기본값" 으로 적는다.
  updatedLabel: string | null;
}

interface Field {
  key: keyof MmrConfig;
  label: string;
  hint: string;
  min: number;
  max: number;
}

const FIELDS: Field[] = [
  {
    key: "k",
    label: "K값",
    hint: "한 경기가 움직일 수 있는 최대 폭. 클수록 순위가 빨리 요동친다.",
    min: MMR_K_MIN,
    max: MMR_K_MAX,
  },
  {
    key: "winPoint",
    label: "승리 점수",
    hint: "이긴 팀 전원이 승패 변동에 더해 받는 참가 보너스.",
    min: MMR_POINT_MIN,
    max: MMR_POINT_MAX,
  },
  {
    key: "lossPoint",
    label: "패배 점수",
    hint: "진 팀 전원이 받는 참가 보너스. 승리 점수보다 클 수 없다.",
    min: MMR_POINT_MIN,
    max: MMR_POINT_MAX,
  },
];

export function MmrConfigPanel({ config, updatedLabel }: MmrConfigPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 입력 중에는 빈 칸이나 "1"처럼 아직 완성되지 않은 값이 지나가므로 문자열로 들고 있다가
  // 저장할 때만 숫자로 바꾼다.
  const [draft, setDraft] = useState<Record<keyof MmrConfig, string>>({
    k: String(config.k),
    winPoint: String(config.winPoint),
    lossPoint: String(config.lossPoint),
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const parsed: MmrConfig = {
    k: Number(draft.k),
    winPoint: Number(draft.winPoint),
    lossPoint: Number(draft.lossPoint),
  };
  const isDirty = parsed.k !== config.k || parsed.winPoint !== config.winPoint || parsed.lossPoint !== config.lossPoint;

  function set(key: keyof MmrConfig, value: string) {
    setDraft({ ...draft, [key]: value });
    setError(null);
    setSavedAt(null);
  }

  function fillDefaults() {
    setDraft({
      k: String(DEFAULT_MMR_CONFIG.k),
      winPoint: String(DEFAULT_MMR_CONFIG.winPoint),
      lossPoint: String(DEFAULT_MMR_CONFIG.lossPoint),
    });
    setError(null);
    setSavedAt(null);
  }

  function save() {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateMmrConfigAction(parsed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <div>
        <div className="text-[13.5px] font-bold">MMR 계산 설정</div>
        <div className="text-[12px] text-faint">
          다음 경기부터 적용됩니다. 이미 기록된 경기의 변동값은 그대로 남습니다.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-muted">{field.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={1}
              value={draft[field.key]}
              onChange={(event) => set(field.key, event.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-ink/[.08] bg-inset px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
            />
            <span className="text-[11.5px] leading-snug text-ghost">{field.hint}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !isDirty}
          className={`rounded-md border px-3 py-1.5 text-[12px] font-bold ${
            isPending || !isDirty
              ? "cursor-not-allowed border-ink/[.06] text-ghost"
              : "cursor-pointer border-accent/40 text-accent-soft hover:bg-accent/[.14]"
          }`}
        >
          {isPending ? "저장 중" : "저장"}
        </button>
        <button
          type="button"
          onClick={fillDefaults}
          disabled={isPending}
          className="cursor-pointer rounded-md border border-ink/[.08] px-3 py-1.5 text-[12px] font-bold text-muted hover:bg-ink/[.04]"
        >
          기본값 ({DEFAULT_MMR_CONFIG.k} / +{DEFAULT_MMR_CONFIG.winPoint} / +{DEFAULT_MMR_CONFIG.lossPoint})
        </button>
        {savedAt !== null && <span className="text-[12px] text-faint">저장 완료</span>}
        {error &&
          error.split("\n").map((line) => (
            <span key={line} className="text-[12px] text-danger-soft">
              {line}
            </span>
          ))}
      </div>

      <div className="text-[11.5px] text-ghost">
        {updatedLabel ? `마지막 변경: ${updatedLabel}` : "아직 저장된 적이 없어 기본값으로 계산 중입니다."}
      </div>
    </div>
  );
}
