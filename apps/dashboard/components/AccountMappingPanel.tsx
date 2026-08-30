"use client";

import { useState } from "react";
import type { PendingDiscordAccount, PendingKakaoAccount } from "@/lib/queries/pending-accounts";
import { linkMembersAction } from "@/app/link-accounts/actions";

export function AccountMappingPanel({
  discordAccounts,
  kakaoAccounts,
  isAdmin,
}: {
  discordAccounts: PendingDiscordAccount[];
  kakaoAccounts: PendingKakaoAccount[];
  isAdmin: boolean;
}) {
  const [selectedDiscordId, setSelectedDiscordId] = useState<string | null>(null);
  const [selectedKakaoId, setSelectedKakaoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const linkReady = selectedDiscordId !== null && selectedKakaoId !== null;

  async function handleLink() {
    if (!linkReady) return;
    setIsPending(true);
    const formData = new FormData();
    formData.set("discordSideId", selectedDiscordId!);
    formData.set("kakaoSideId", selectedKakaoId!);
    try {
      await linkMembersAction(formData);
      const d = discordAccounts.find((a) => a.id === selectedDiscordId);
      const k = kakaoAccounts.find((a) => a.id === selectedKakaoId);
      setStatus(`연결 완료 · ${d?.handle} ↔ ${k?.realName}(${k?.nicknameTag})`);
      setSelectedDiscordId(null);
      setSelectedKakaoId(null);
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
                onClick={() => setSelectedDiscordId(selectedDiscordId === d.id ? null : d.id)}
                className={`rounded-lg border px-2.5 py-2 text-left font-mono text-[12.5px] ${
                  selectedDiscordId === d.id ? "border-[#5865F2] bg-[#5865F2]/[.14]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                {d.handle}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[.1] bg-[#12161F] p-4">
          <div className="text-center text-[11px] leading-relaxed text-[#6E7889]">
            {linkReady ? "선택한 두 계정을 같은 사람으로 연결합니다" : "양쪽에서 각각 하나씩 선택하세요"}
          </div>
          {isAdmin ? (
            <button
              onClick={handleLink}
              disabled={!linkReady || isPending}
              className={`w-full rounded-lg py-2.5 text-[12.5px] font-bold ${
                linkReady && !isPending ? "cursor-pointer bg-[#4472C4] text-white" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
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
            <div className="w-full rounded-lg border border-[#70AD47]/30 bg-[#70AD47]/[.12] p-2.5 text-[10.5px] leading-relaxed text-[#9BD173]">
              {status}
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
                onClick={() => setSelectedKakaoId(selectedKakaoId === k.id ? null : k.id)}
                className={`flex flex-col rounded-lg border px-2.5 py-2 text-left ${
                  selectedKakaoId === k.id ? "border-[#FFC000] bg-[#FFC000]/[.12]" : "border-white/[.05] bg-[#1A2130]"
                }`}
              >
                <span className="text-[12.5px] font-semibold">{k.realName}</span>
                <span className="font-mono text-[10.5px] text-[#7A8496]">{k.nicknameTag}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
