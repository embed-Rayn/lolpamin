import type { DrawCandidate } from "@lolpamin/core";

export function ResultList({ drawn }: { drawn: DrawCandidate[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[.07] bg-[#12161F] p-4">
      <div className="text-[12px] font-bold tracking-wider text-[#5C6577]">뽑힌 순서</div>
      {drawn.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-[#6E7889]">아직 뽑지 않았습니다.</div>
      ) : (
        <ol className="flex flex-col gap-1">
          {drawn.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-lg bg-[#161B26] px-2.5 py-2">
              <span className="w-6 text-center font-mono text-[12px] text-[#8FB4F5]">{i + 1}</span>
              <span className="text-[14px] font-semibold text-[#E6EAF2]">{c.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
