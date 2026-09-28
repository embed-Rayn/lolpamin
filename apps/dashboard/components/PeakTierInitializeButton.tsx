"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { initializePeakTierAction } from "@/app/member-admin/peak-actions";

export function PeakTierInitializeButton({ members }: { members: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  async function initialize() {
    if (running.current) return;
    running.current = true; setBusy(true); setErrors([]);
    let saved = 0, skipped = 0;
    const failures: string[] = [];
    try {
      for (const [index, member] of members.entries()) {
        setStatus(`${index + 1}/${members.length} · ${member.label} 조회 중`);
        const result = await initializePeakTierAction(member.id);
        if (result.error) { failures.push(`${member.label}: ${result.error}`); if (result.stopBatch) break; }
        else if (result.skipped) skipped++; else saved++;
      }
    } catch { failures.push("갱신이 중단되었습니다. 로그인 상태와 연결을 확인해 주세요."); }
    finally {
      setStatus(`${saved}명 초기화 · ${skipped}명 기존 값 유지`); setErrors(failures);
      running.current = false; setBusy(false); router.refresh();
    }
  }
  return <div className="rounded-xl border border-ink/[.08] bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><strong className="text-sm text-fg">최고티어 API 초기화</strong>
        <p className="mt-1 text-xs text-muted">연결 계정의 현재 솔로랭크 중 최고값을 처음 한 번 채웁니다. 역대 최고 기록은 운영진이 수정해 주세요.</p>
        <p className="mt-1 text-xs text-muted">기존 입력값과 초기화된 값은 유지하며, 산정티어는 변경하지 않습니다.</p>
      </div>
      <button className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !members.length} onClick={initialize}>
        {busy ? "조회 중…" : "미입력 최고티어 불러오기"}
      </button>
    </div>
    {status && <p role="status" className="mt-2 text-xs text-muted">{status}</p>}
    {!!errors.length && <ul role="alert" className="mt-2 text-xs text-danger-soft">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
  </div>;
}
