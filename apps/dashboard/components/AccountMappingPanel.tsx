"use client";

import { useState } from "react";
import type { PendingDiscordAccount } from "@/lib/queries/pending-accounts";
import type { KakaoAccountWithCandidates, MemberWithAliases } from "@/lib/queries/link-candidates";
import {
  absorbMemberAction,
  releaseMemberAction,
  importDiscordMembersAction,
  countRiotLookupTargetsAction,
  registerRiotAccountsFromHintsAction,
  riotIdRefreshStatusAction,
  refreshRiotIdsAction,
} from "@/app/link-accounts/actions";

export function AccountMappingPanel({
  discordAccounts,
  kakaoAccounts,
  membersWithAliases,
  isAdmin,
}: {
  discordAccounts: PendingDiscordAccount[];
  kakaoAccounts: KakaoAccountWithCandidates[];
  membersWithAliases: MemberWithAliases[];
  isAdmin: boolean;
}) {
  const [selectedKakaoId, setSelectedKakaoId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  // 성공과 실패를 색으로 구분한다 — 같은 회색 상자면 "연결 완료"와 거절 안내가
  // 똑같아 보인다.
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [riotStatus, setRiotStatus] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedKakao = kakaoAccounts.find((k) => k.id === selectedKakaoId) ?? null;

  function selectKakao(id: string) {
    const next = selectedKakaoId === id ? null : id;
    setSelectedKakaoId(next);
    setSelectedCandidateId(null);
    setStatus(null);
  }

  async function handleImportDiscord() {
    setIsImporting(true);
    setImportStatus(null);
    try {
      const { result, error } = await importDiscordMembersAction();
      setImportStatus(
        error ??
          `가져오기 완료 · 신규 ${result!.created}명 · 갱신 ${result!.updated}명 · 봇 제외 ${result!.skippedBots}개`
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleRiotLookup() {
    setIsLookingUp(true);
    setRiotStatus(null);
    try {
      const targetCount = await countRiotLookupTargetsAction();
      if (targetCount === 0) {
        setRiotStatus("새로 조회할 라이엇 ID가 없습니다.");
        return;
      }
      if (
        !window.confirm(
          `회원 ${targetCount}명의 닉네임에 적힌 라이엇 ID를 모두 Riot API로 조회합니다. 계속할까요?`,
        )
      ) {
        return;
      }

      const { result, error } = await registerRiotAccountsFromHintsAction();
      if (error || !result) {
        setRiotStatus(error ?? "조회하지 못했습니다.");
        return;
      }
      const summary = `등록 ${result.registered}개 · 못 찾음 ${result.notFound} · 충돌 ${result.conflicts} · 조회할 ID 없음 ${result.skipped}명`;
      setRiotStatus(
        result.unauthorized
          ? `Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY). 중단 전까지 ${summary}`
          : summary,
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleRefreshRiotIds() {
    setIsRefreshing(true);
    setRefreshStatus(null);
    try {
      const status = await riotIdRefreshStatusAction();
      if (status.accountCount === 0) {
        setRefreshStatus("갱신할 라이엇 계정이 없습니다.");
        return;
      }
      if (!status.allowed) {
        const last = status.lastRefreshedAt ? new Date(status.lastRefreshedAt).toLocaleString("ko-KR") : "";
        setRefreshStatus(`오늘은 이미 갱신했습니다 (${last}). 24시간 뒤에 다시 시도해 주세요.`);
        return;
      }
      if (!window.confirm(`계정 ${status.accountCount}개의 PUUID로 현재 라이엇 ID를 다시 읽어옵니다. 하루 한 번만 할 수 있습니다. 계속할까요?`)) {
        return;
      }

      const { result, error } = await refreshRiotIdsAction();
      if (error || !result) {
        setRefreshStatus(error ?? "갱신하지 못했습니다.");
        return;
      }
      const summary = `변경 ${result.updated} · 그대로 ${result.unchanged} · 못 찾음 ${result.notFound}`;
      setRefreshStatus(
        result.unauthorized
          ? `Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY). 중단 전까지 ${summary}`
          : summary,
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleAbsorb() {
    if (!selectedKakaoId || !selectedCandidateId) return;
    setIsPending(true);
    setStatus(null);
    try {
      const { error } = await absorbMemberAction(selectedKakaoId, selectedCandidateId);
      setStatus({ text: error ?? "연결 완료", ok: !error });
      if (!error) {
        setSelectedKakaoId(null);
        setSelectedCandidateId(null);
      }
    } finally {
      setIsPending(false);
    }
  }

  async function handleRelease(aliasId: string) {
    setIsPending(true);
    setStatus(null);
    try {
      const { error } = await releaseMemberAction(aliasId);
      setStatus({ text: error ?? "연결을 끊었습니다", ok: !error });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="m-0 text-[14.5px] font-bold">계정 매핑</h2>
        <span className="text-[12.5px] text-faint">
          양쪽에서 한 개씩 골라 연결하세요. 연결하면 하나의 회원 데이터로 합쳐집니다.
        </span>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleImportDiscord}
            disabled={isImporting}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-extrabold ${
              isImporting ? "cursor-not-allowed bg-hover text-ghost" : "cursor-pointer bg-discord text-white"
            }`}
          >
            {isImporting ? "가져오는 중..." : "디스코드 회원 가져오기"}
          </button>
          {importStatus && <span className="text-[12.5px] text-muted">{importStatus}</span>}
          <button
            type="button"
            onClick={handleRiotLookup}
            disabled={isLookingUp}
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-extrabold ${
              isLookingUp
                ? "cursor-not-allowed border-ink/[.06] bg-hover text-ghost"
                : "cursor-pointer border-accent/45 bg-accent/[.18] text-accent-soft"
            }`}
          >
            {isLookingUp ? "조회 중..." : "닉네임에서 라이엇 계정 찾기"}
          </button>
          {riotStatus && <span className="text-[12.5px] text-muted">{riotStatus}</span>}
          <button
            type="button"
            onClick={handleRefreshRiotIds}
            disabled={isRefreshing}
            title="저장된 PUUID로 현재 라이엇 ID를 다시 읽어옵니다 (하루 한 번)"
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-extrabold ${
              isRefreshing
                ? "cursor-not-allowed border-ink/[.06] bg-hover text-ghost"
                : "cursor-pointer border-orange/45 bg-orange/[.16] text-orange"
            }`}
          >
            {isRefreshing ? "갱신 중..." : "PUUID로 라이엇 ID 갱신"}
          </button>
          {refreshStatus && <span className="text-[12.5px] text-muted">{refreshStatus}</span>}
        </div>
      )}
      <div className="grid grid-cols-[1fr_210px_1fr] items-stretch gap-3.5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <div className="flex items-center justify-between border-b border-ink/[.06] bg-discord/[.07] px-4 py-3">
            <span className="text-[13.5px] font-bold">미연결 Discord 계정</span>
            <span className="font-mono text-[12px] text-faint">{discordAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {discordAccounts.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedCandidateId(selectedCandidateId === d.id ? null : d.id)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedCandidateId === d.id ? "border-discord bg-discord/[.14]" : "border-ink/[.05] bg-hover"
                }`}
              >
                <span className="text-[13px] font-semibold">{d.displayName || d.handle}</span>
                {d.displayName && <span className="font-mono text-[11.5px] text-faint">{d.handle}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-ink/[.1] bg-surface-2 p-4">
          {selectedKakao === null ? (
            <div className="text-center text-[12px] leading-relaxed text-faint">
              오른쪽에서 카카오톡 계정을 하나 고르세요
            </div>
          ) : selectedKakao.candidates.length === 0 ? (
            <div className="text-center text-[12px] leading-relaxed text-faint">
              닮은 계정을 찾지 못했습니다. 왼쪽 목록에서 직접 고르세요.
            </div>
          ) : (
            selectedKakao.candidates.map((c) => (
              <button
                key={c.memberId}
                onClick={() => setSelectedCandidateId(selectedCandidateId === c.memberId ? null : c.memberId)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedCandidateId === c.memberId
                    ? "border-accent bg-accent/[.14]"
                    : "border-ink/[.05] bg-hover"
                }`}
              >
                <span className="text-[13px] font-semibold">
                  {c.displayName || c.handle}
                  {c.isSole && <span className="ml-1.5 text-[11.5px] text-success-soft">유력</span>}
                </span>
                <span className="font-mono text-[11.5px] text-faint">
                  {c.handle} · {c.reasons.join(" · ")}
                  {c.kind === "linked" && " · 이미 연결된 회원"}
                </span>
              </button>
            ))
          )}
          {isAdmin ? (
            <button
              onClick={handleAbsorb}
              disabled={!selectedKakaoId || !selectedCandidateId || isPending}
              className={`w-full rounded-lg py-2.5 text-[13.5px] font-bold ${
                selectedKakaoId && selectedCandidateId && !isPending
                  ? "cursor-pointer bg-accent text-white"
                  : "cursor-not-allowed bg-hover text-ghost"
              }`}
            >
              ↔ 선택 계정 연결
            </button>
          ) : (
            <div className="rounded-lg border border-ink/[.06] bg-inset p-3 text-[12.5px] text-muted">
              변경하려면 관리자 로그인이 필요합니다.
            </div>
          )}
          {status && (
            <div
              className={`w-full rounded-lg border p-2.5 text-[12px] leading-relaxed ${
                status.ok
                  ? "border-success-soft/30 bg-success-soft/[.10] text-success-soft"
                  : "border-danger/40 bg-danger/[.12] text-danger"
              }`}
            >
              {status.text}
            </div>
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <div className="flex items-center justify-between border-b border-ink/[.06] bg-gold/[.07] px-4 py-3">
            <span className="text-[13.5px] font-bold">미연결 카카오톡 계정</span>
            <span className="font-mono text-[12px] text-faint">{kakaoAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {kakaoAccounts.map((k) => (
              <button
                key={k.id}
                onClick={() => selectKakao(k.id)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedKakaoId === k.id ? "border-gold bg-gold/[.12]" : "border-ink/[.05] bg-hover"
                }`}
              >
                <span className="text-[13.5px] font-semibold">{k.realName}</span>
                <span className="font-mono text-[12px] text-faint">{k.kakaoNickname}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {membersWithAliases.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
          <div className="flex items-center justify-between border-b border-ink/[.06] px-4 py-3">
            <span className="text-[13.5px] font-bold">연결된 계정</span>
            <span className="font-mono text-[12px] text-faint">{membersWithAliases.length}</span>
          </div>
          {/* 연결이 늘수록 길어지는 목록이라 남는 가로 폭을 빈칸이 아니라 단으로 쓴다.
              넓은 창에서 5단, 줄어들면 4단, 3단까지. */}
          <div className="grid grid-cols-3 gap-x-5 gap-y-3 p-3 xl:grid-cols-4 2xl:grid-cols-5">
            {membersWithAliases.map((m) => (
              <div key={m.id} className="flex flex-col items-start gap-1.5">
                <span className="text-[13px] font-semibold">{m.label}</span>
                {m.aliases.map((a) => (
                  // 행을 내용 폭에 맞춘다. 늘리면 「끊기」가 자기가 끊는 별칭에서
                  // 멀찍이 떨어진 오른쪽 끝에 가서 붙는다.
                  <div key={a.id} className="flex max-w-full items-center gap-2 rounded-lg border border-ink/[.05] bg-hover px-2.5 py-1.5">
                    <span className="truncate font-mono text-[12px] text-muted">{a.kakaoNickname}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRelease(a.id)}
                        disabled={isPending}
                        className="shrink-0 rounded-md border border-ink/[.08] px-2 py-1 text-[12px] text-danger disabled:cursor-not-allowed disabled:text-ghost"
                      >
                        끊기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
