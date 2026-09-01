"use client";

import { useState } from "react";
import type { PendingDiscordAccount } from "@/lib/queries/pending-accounts";
import type { KakaoAccountWithCandidates, MemberWithAliases } from "@/lib/queries/link-candidates";
import { absorbMemberAction, releaseMemberAction, importDiscordMembersAction } from "@/app/link-accounts/actions";

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
        <h2 className="m-0 text-[13.5px] font-bold">계정 매핑</h2>
        <span className="text-[11.5px] text-[#6E7889]">
          양쪽에서 한 개씩 골라 연결하세요. 연결하면 하나의 회원 데이터로 합쳐집니다.
        </span>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleImportDiscord}
            disabled={isImporting}
            className={`rounded-lg px-3.5 py-2 text-[12px] font-extrabold ${
              isImporting ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#5865F2] text-white"
            }`}
          >
            {isImporting ? "가져오는 중..." : "디스코드 회원 가져오기"}
          </button>
          {importStatus && <span className="text-[11.5px] text-[#8A94A6]">{importStatus}</span>}
        </div>
      )}
      <div className="grid grid-cols-[1fr_210px_1fr] items-stretch gap-3.5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] bg-[#5865F2]/[.07] px-4 py-3">
            <span className="text-[12.5px] font-bold">미연결 Discord 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{discordAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {discordAccounts.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedCandidateId(selectedCandidateId === d.id ? null : d.id)}
                className={`rounded-lg border px-2.5 py-2 text-left font-mono text-[12.5px] ${
                  selectedCandidateId === d.id ? "border-[#5865F2] bg-[#5865F2]/[.14]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                {d.handle}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] p-4">
          {selectedKakao === null ? (
            <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
              오른쪽에서 카카오톡 계정을 하나 고르세요
            </div>
          ) : selectedKakao.candidates.length === 0 ? (
            <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
              닮은 계정을 찾지 못했습니다. 왼쪽 목록에서 직접 고르세요.
            </div>
          ) : (
            selectedKakao.candidates.map((c) => (
              <button
                key={c.memberId}
                onClick={() => setSelectedCandidateId(selectedCandidateId === c.memberId ? null : c.memberId)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedCandidateId === c.memberId
                    ? "border-[#4472C4] bg-[#4472C4]/[.14]"
                    : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                <span className="text-[12px] font-semibold">
                  {c.displayName || c.handle}
                  {c.isSole && <span className="ml-1.5 text-[10px] text-[#9BD173]">유력</span>}
                </span>
                <span className="font-mono text-[10px] text-[#7A8496]">
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
              className={`w-full rounded-lg py-2.5 text-[12.5px] font-bold ${
                selectedKakaoId && selectedCandidateId && !isPending
                  ? "cursor-pointer bg-[#4472C4] text-white"
                  : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
              }`}
            >
              ↔ 선택 계정 연결
            </button>
          ) : (
            <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[11.5px] text-[#8A94A6]">
              변경하려면 관리자 로그인이 필요합니다.
            </div>
          )}
          {status && (
            <div
              className={`w-full rounded-lg border p-2.5 text-[10.5px] leading-relaxed ${
                status.ok
                  ? "border-[#9BD173]/30 bg-[#9BD173]/[.10] text-[#9BD173]"
                  : "border-[#C6553F]/40 bg-[#C6553F]/[.12] text-[#C6553F]"
              }`}
            >
              {status.text}
            </div>
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] bg-[#FFC000]/[.07] px-4 py-3">
            <span className="text-[12.5px] font-bold">미연결 카카오톡 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{kakaoAccounts.length}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
            {kakaoAccounts.map((k) => (
              <button
                key={k.id}
                onClick={() => selectKakao(k.id)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedKakaoId === k.id ? "border-[#FFC000] bg-[#FFC000]/[.12]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                <span className="text-[12.5px] font-semibold">{k.realName}</span>
                <span className="font-mono text-[10.5px] text-[#7A8496]">{k.kakaoNickname}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {membersWithAliases.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[.06] bg-[#151A24]">
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
            <span className="text-[12.5px] font-bold">연결된 계정</span>
            <span className="font-mono text-[11px] text-[#7A8496]">{membersWithAliases.length}</span>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {membersWithAliases.map((m) => (
              <div key={m.id} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold">{m.label}</span>
                {m.aliases.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/[.05] bg-[#1A2130] px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-[#8A94A6]">{a.kakaoNickname}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRelease(a.id)}
                        disabled={isPending}
                        className="rounded-md border border-white/[.08] px-2 py-1 text-[10.5px] text-[#C6553F] disabled:cursor-not-allowed disabled:text-[#5C6577]"
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
