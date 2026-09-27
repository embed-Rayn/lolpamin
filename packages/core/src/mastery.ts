export interface MasteryEntry {
  championId: number;
  level: number;
  points: number;
}

// One member can own several accounts. Points add up across them; levels do not — a level 12
// main plus a level 7 smurf is not "level 19", so the highest level stands for the champion.
export function topMasteries(entries: readonly MasteryEntry[], n = 3): MasteryEntry[] {
  const byChampion = new Map<number, MasteryEntry>();
  for (const entry of entries) {
    const previous = byChampion.get(entry.championId);
    byChampion.set(
      entry.championId,
      previous
        ? { championId: entry.championId, level: Math.max(previous.level, entry.level), points: previous.points + entry.points }
        : { ...entry },
    );
  }
  return [...byChampion.values()].sort((a, b) => b.points - a.points || a.championId - b.championId).slice(0, n);
}
