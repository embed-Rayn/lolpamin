"use client";

import { useState } from "react";
import { refreshRiotIdsAction, riotIdRefreshStatusAction } from "@/app/link-accounts/actions";
import { masteryRefreshStatusAction, refreshMasteriesAction } from "@/app/member-admin/actions";

type Kind = "riotIds" | "masteries";

const COPY: Record<Kind, { label: string; title: string; confirm: (n: number) => string; empty: string }> = {
  riotIds: {
    label: "PUUID로 라이엇 ID 갱신",
    title: "저장된 PUUID로 현재 라이엇 ID를 다시 읽어옵니다 (하루 한 번)",
    confirm: (n) => `계정 ${n}개의 PUUID로 현재 라이엇 ID를 다시 읽어옵니다. 하루 한 번만 할 수 있습니다. 계속할까요?`,
    empty: "갱신할 라이엇 계정이 없습니다.",
  },
  masteries: {
    label: "모스트 챔피언 갱신",
    title: "회원 계정의 챔피언 숙련도를 다시 받아옵니다 (하루 한 번)",
    confirm: (n) => `계정 ${n}개의 챔피언 숙련도를 다시 받아옵니다. 하루 한 번만 할 수 있습니다. 계속할까요?`,
    empty: "숙련도를 받을 라이엇 계정이 없습니다.",
  },
};

const KEY_EXPIRED = "Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY).";

// 하루 한 번짜리 Riot 배치 버튼. 상태를 먼저 물어 제한·대상 수를 확인하고, 확인창을 거쳐
// 실행한 뒤 결과를 옆에 적는다. 제한의 근거는 SiteSetting이라 관리자가 여럿이어도 같다.
export function DailyRefreshButton({ kind }: { kind: Kind }) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = COPY[kind];

  async function run(): Promise<string> {
    const status = kind === "riotIds" ? await riotIdRefreshStatusAction() : await masteryRefreshStatusAction();
    if (status.accountCount === 0) return copy.empty;
    if (!status.allowed) {
      const last = status.lastRefreshedAt ? new Date(status.lastRefreshedAt).toLocaleString("ko-KR") : "";
      return `오늘은 이미 갱신했습니다 (${last}). 24시간 뒤에 다시 시도해 주세요.`;
    }
    if (!window.confirm(copy.confirm(status.accountCount))) return "";

    if (kind === "riotIds") {
      const { result, error } = await refreshRiotIdsAction();
      if (error || !result) return error ?? "갱신하지 못했습니다.";
      const summary = `변경 ${result.updated} · 그대로 ${result.unchanged} · 못 찾음 ${result.notFound}`;
      return result.unauthorized ? `${KEY_EXPIRED} 중단 전까지 ${summary}` : summary;
    }
    const { result, error } = await refreshMasteriesAction();
    if (error || !result) return error ?? "갱신하지 못했습니다.";
    const summary = `갱신 ${result.refreshed} · 못 찾음 ${result.notFound}`;
    return result.unauthorized ? `${KEY_EXPIRED} 중단 전까지 ${summary}` : summary;
  }

  async function handleClick() {
    setIsRunning(true);
    setMessage(null);
    try {
      const text = await run();
      setMessage(text || null);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        title={copy.title}
        className={`rounded-lg border px-3.5 py-2 text-[13px] font-extrabold ${
          isRunning
            ? "cursor-not-allowed border-ink/[.06] bg-hover text-ghost"
            : "cursor-pointer border-orange/45 bg-orange/[.16] text-orange"
        }`}
      >
        {isRunning ? "갱신 중..." : copy.label}
      </button>
      {message && <span className="text-[12.5px] text-muted">{message}</span>}
    </div>
  );
}
