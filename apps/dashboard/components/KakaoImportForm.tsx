"use client";

import { useRef, useState } from "react";
import { importKakaoExportAction } from "@/app/kakao-import/actions";
import type { ProcessKakaoExportResult } from "@/lib/kakao-import/process-export";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KakaoImportForm({ isAdmin }: { isAdmin: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ProcessKakaoExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragleave는 자식 요소로 들어갈 때도 올라온다. 들어온 횟수를 세지 않으면 존 안의
  // 글자 위를 지날 때마다 테두리가 깜빡인다.
  const dragDepth = useRef(0);

  function accept(picked: File | null | undefined) {
    if (!picked) return;
    setResult(null);
    // 카톡 내보내기는 .txt다. 다른 파일은 파싱이 조용히 0건으로 끝나므로 여기서 막는다.
    if (!picked.name.toLowerCase().endsWith(".txt")) {
      setFile(null);
      setError("txt 파일만 올릴 수 있습니다.");
      return;
    }
    setError(null);
    setFile(picked);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!isAdmin || isImporting) return;
    accept(event.dataTransfer.files?.[0]);
  }

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
        <span className="text-[13.5px] font-bold">내보낸 대화 파일 (.txt) 업로드</span>
        <span className="text-[12px] text-[#6E7889]">이미 처리한 시점 이후의 멘션만 반영됩니다.</span>
      </div>
      {isAdmin ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".txt"
            onChange={(e) => accept(e.target.files?.[0])}
            className="hidden"
          />
          {/* 드롭 존이자 파일 선택 버튼. 브라우저 기본 file input은 드롭을 받지만 생김새를
              바꿀 수 없어서 감춰 두고 이쪽에서 클릭을 넘긴다. */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setIsDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setIsDragging(false);
            }}
            onDrop={handleDrop}
            disabled={isImporting}
            className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
              isDragging
                ? "border-[#70AD47] bg-[#70AD47]/[.10]"
                : "border-white/[.14] bg-[#0F131B] hover:border-white/[.24] hover:bg-[#131926]"
            }`}
          >
            <span className="text-[13.5px] font-bold text-[#B7C0D0]">
              {isDragging ? "여기에 놓으세요" : "txt 파일을 끌어다 놓거나 클릭해서 선택"}
            </span>
            <span className="text-[12px] text-[#6E7889]">
              {file ? `${file.name} · ${formatBytes(file.size)}` : "카카오톡 대화 내보내기 파일 하나"}
            </span>
          </button>
          <button
            onClick={handleImport}
            disabled={!file || isImporting}
            className={`w-fit rounded-lg px-4 py-2 text-[13.5px] font-extrabold ${
              file && !isImporting ? "cursor-pointer bg-[#70AD47] text-[#0E1117]" : "cursor-not-allowed bg-[#1E2534] text-[#5C6577]"
            }`}
          >
            {isImporting ? "처리 중..." : "업로드 및 반영"}
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-white/[.06] bg-[#0F131B] p-3 text-[12.5px] text-[#8A94A6]">
          변경하려면 관리자 로그인이 필요합니다.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[12px] text-[#EE8B8B]">
          {error}
        </div>
      )}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[12px] text-[#7A8496]">신규 회원</div>
            <div className="font-mono text-[19px] font-bold text-[#8FB4F5]">{result.newMembers}</div>
            {result.newMembers > 0 && (
              <div className="mt-1 text-[11.5px] text-[#C9A227]">계정 연결에서 확인 필요</div>
            )}
          </div>
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[12px] text-[#7A8496]">활동 갱신</div>
            <div className="font-mono text-[19px] font-bold text-[#9BD173]">{result.activityUpdates}</div>
          </div>
          <div className="rounded-lg border border-white/[.06] bg-[#0F131B] px-3 py-2.5">
            <div className="text-[12px] text-[#7A8496]">중복 건너뜀</div>
            <div className="font-mono text-[19px] font-bold text-[#7A8496]">{result.skippedAsAlreadyProcessed}</div>
          </div>
        </div>
      )}
    </div>
  );
}
