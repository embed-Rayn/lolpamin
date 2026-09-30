import { formatMasteryPoints, type MasteryEntry } from "@lolpamin/core";
import { championIcon, championIdByKey, championName } from "@/lib/ddragon/assets";

// /aram's 모스트: up to ten champions, each an icon over its summed mastery points. Unknown ids
// (a champion newer than the committed Data Dragon) stay blank, as in MasteryChampions.
export function MasteryChampionStrip({ masteries }: { masteries: MasteryEntry[] }) {
  if (masteries.length === 0) return <div className="text-center text-ghost">-</div>;
  return (
    <div className="flex justify-center gap-1.5">
      {masteries.map((m) => {
        const id = championIdByKey(m.championId);
        const icon = id ? championIcon(id) : null;
        const title = `${id ? championName(id) : "알 수 없는 챔피언"} · ${m.points.toLocaleString("ko-KR")}점 · 레벨 ${m.level}`;
        return (
          <div key={m.championId} className="flex w-[42px] flex-none flex-col items-center gap-0.5" title={title}>
            {icon ? (
              <img src={icon} alt="" width={28} height={28} loading="lazy" className="rounded" />
            ) : (
              <span className="inline-block h-7 w-7 rounded bg-ink/[.08]" />
            )}
            <span className="font-mono text-[10.5px] leading-none text-muted">{formatMasteryPoints(m.points)}</span>
          </div>
        );
      })}
    </div>
  );
}
