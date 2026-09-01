"use client";

import { useState } from "react";
import { importKakaoExportAction } from "@/app/kakao-import/actions";
import type { ProcessKakaoExportResult } from "@/lib/kakao-import/process-export";

export function KakaoImportForm({ isAdmin }: { isAdmin: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ProcessKakaoExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file) return;
    setIsImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const summary = await importKakaoExportAction(text);
      setResult(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 처리 중 오류가 발생했습니다.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-bold">카카오톡 대화 내보내기 (.txt) 업로드</span>
        <span className="text-[10.5px] text-[#6E7889]">이미 처리한 시점 이후의 멘션만 반영됩니다.</span>
      </div>
      {isAdmin ? (
        <>
          <input
            type="file"
            accept=".txt"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
            className="text-[12px] text-[#B7C0D0]"
          />
          <button
            onClick={handleImport}
            disabled={!file || isImporting}
            className={`w-fit rounded-lg px-4 py-2 text-[12.5px] font-extrabold ${
              file && !isImporting ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            {isImporting ? "처리 중..." : "업로드 및 반영"}
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[11.5px] text-[#8A94A6]">
          변경하려면 관리자 로그인이 필요합니다.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[11px] text-[#EE8B8B]">
          {error}
        </div>
      )}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[10.5px] text-[#7A8496]">신규 회원</div>
            <div className="font-mono text-[18px] font-bold text-[#8FB4F5]">{result.newMembers}</div>
            {result.newMembers > 0 && (
              <div className="mt-1 text-[10px] text-[#C9A227]">계정 연결에서 확인 필요</div>
            )}
          </div>
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[10.5px] text-[#7A8496]">활동 갱신</div>
            <div className="font-mono text-[18px] font-bold text-[#9BD173]">{result.activityUpdates}</div>
          </div>
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[10.5px] text-[#7A8496]">중복 건너뜀</div>
            <div className="font-mono text-[18px] font-bold text-[#7A8496]">{result.skippedAsAlreadyProcessed}</div>
          </div>
        </div>
      )}
    </div>
  );
}
