import { championIcon } from "@/lib/ddragon/assets";

// A champion the committed patch does not know draws an empty square, never a broken image.
export function ChampionIcon({ champion, size }: { champion: string; size: number }) {
  const icon = championIcon(champion);
  return icon ? (
    <img src={icon} alt="" width={size} height={size} loading="lazy" className="flex-none rounded-lg" />
  ) : (
    <span className="inline-block flex-none rounded-lg bg-ink/[.08]" style={{ width: size, height: size }} />
  );
}
