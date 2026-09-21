import type { DrawCandidate } from "@lolpamin/core";

export function ResultList({ drawn }: { drawn: DrawCandidate[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink/[.07] bg-surface-2 p-4">
      <div className="text-[12px] font-bold tracking-wider text-ghost">뽑힌 순서</div>
      {drawn.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-faint">아직 뽑지 않았습니다.</div>
      ) : (
        <ol className="flex flex-col gap-1">
          {drawn.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-lg bg-surface-3 px-2.5 py-2">
              <span className="w-6 text-center font-mono text-[12px] text-accent-soft">{i + 1}</span>
              <span className="text-[14px] font-semibold text-fg">{c.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
