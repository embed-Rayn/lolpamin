"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberInfoRiotAccount } from "@/lib/queries/member-info";
import { registerRiotAccountByLookupAction, removeRiotAccountAction } from "@/app/member-info/actions";

export function MemberRiotAccountsCell({
  memberId,
  accounts,
  isAdmin,
}: {
  memberId: string;
  accounts: MemberInfoRiotAccount[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chips = accounts.map((a) => (
    <span
      key={a.id}
      className="inline-flex items-center gap-1 rounded-md border border-ink/[.09] bg-inset px-1.5 py-0.5 font-mono text-[12px] text-success-soft"
    >
      {a.gameName}#{a.tagLine}
      {isAdmin && (
        <button
          type="button"
          title="이 계정 떼기"
          disabled={isPending}
          onClick={() => {
            // 삭제다 — 외부인 확정(null)이 아니라 행을 지운다. 다음 리플레이에서 다시 후보로 뜬다.
            if (!window.confirm(`${a.gameName}#${a.tagLine} 계정을 뗍니다. 계속할까요?`)) return;
            setError(null);
            startTransition(async () => {
              const { error: actionError } = await removeRiotAccountAction(a.id);
              setError(actionError);
              router.refresh();
            });
          }}
          className="text-ghost hover:text-danger-soft"
        >
          ×
        </button>
      )}
    </span>
  ));

  if (!isAdmin) {
    return (
      <div className="flex flex-wrap justify-center gap-1">
        {chips.length > 0 ? chips : <span className="text-ghost">-</span>}
      </div>
    );
  }

  function submit() {
    const text = value.trim();
    if (text.length === 0) return;
    setError(null);
    startTransition(async () => {
      const { error: actionError } = await registerRiotAccountByLookupAction(memberId, text);
      setError(actionError);
      if (!actionError) setValue("");
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap justify-center gap-1">{chips}</div>
      <input
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setValue("");
        }}
        placeholder={isPending ? "조회 중..." : "이름#태그 추가"}
        title="Riot ID를 입력하고 Enter — Riot API로 PUUID를 조회해 등록합니다"
        className="w-full rounded-md border border-ink/[.09] bg-inset px-1.5 py-1 text-center font-mono text-[12.5px] text-fg outline-none focus:border-accent disabled:opacity-40"
      />
      {error && <span className="text-center text-[11.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
