import type { MasteryEntry } from "@lolpamin/core";
import { championIcon, championIdByKey, championName } from "@/lib/ddragon/assets";

// 합산 숙련도 상위 챔피언. 모양은 /matches 후보 표(draft/CandidateTable의 MasteryIcons)와
// 같다 — 아이콘 + 최고 레벨. Data Dragon이 모르는 id(커밋된 패치보다 새 챔피언)는 빈 칸으로,
// 페이지가 깨지면 안 된다.
export function MasteryChampions({ masteries }: { masteries: MasteryEntry[] }) {
  if (masteries.length === 0) return <div className="text-center text-ghost">-</div>;
  return (
    <div className="flex justify-center gap-1.5">
      {masteries.map((m) => {
        const id = championIdByKey(m.championId);
        const icon = id ? championIcon(id) : null;
        const title = `${id ? championName(id) : "알 수 없는 챔피언"} · ${m.points.toLocaleString("ko-KR")}점`;
        return (
          <div key={m.championId} className="flex items-center gap-0.5" title={title}>
            {icon ? (
              <img src={icon} alt="" width={24} height={24} loading="lazy" className="rounded" />
            ) : (
              <span className="inline-block h-6 w-6 rounded bg-ink/[.08]" />
            )}
            <span className="font-mono text-[11px] text-muted">x{m.level}</span>
          </div>
        );
      })}
    </div>
  );
}
