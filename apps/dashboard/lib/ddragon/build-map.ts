// Pure: turns the Data Dragon JSON files into the small lookup the board ships to the
// browser. The full JSONs are megabytes of tooltips; the board needs ids, names and file names.

export interface DdragonMap {
  version: string;
  champions: Record<string, string>;
  championKeys: Record<string, string>;
  items: Record<string, string>;
  spells: Record<string, { file: string; name: string }>;
  runes: Record<string, { icon: string; name: string }>;
}

interface RuneEntry {
  id: number;
  name: string;
  icon: string;
}

export interface DdragonSources {
  version: string;
  champion: { data: Record<string, { id: string; key: string; name: string }> };
  item: { data: Record<string, { name: string }> };
  summoner: { data: Record<string, { key: string; name: string; image: { full: string } }> };
  runes: Array<RuneEntry & { slots: Array<{ runes: RuneEntry[] }> }>;
}

export function buildDdragonMap(input: DdragonSources): DdragonMap {
  const champions = Object.fromEntries(Object.values(input.champion.data).map((c) => [c.id, c.name]));
  // Champion-Mastery-V4 identifies champions by champion.json's numeric "key", not its id.
  const championKeys = Object.fromEntries(Object.values(input.champion.data).map((c) => [c.key, c.id]));
  const items = Object.fromEntries(Object.entries(input.item.data).map(([id, item]) => [id, item.name]));
  // The replay stores SUMMONER_SPELL_1 as summoner.json's numeric "key", not its string id.
  const spells = Object.fromEntries(
    Object.values(input.summoner.data).map((s) => [s.key, { file: s.image.full, name: s.name }]),
  );
  // The board shows the keystone (first slot) and the secondary tree's style icon.
  const runes: DdragonMap["runes"] = {};
  for (const style of input.runes) {
    runes[String(style.id)] = { icon: style.icon, name: style.name };
    for (const keystone of style.slots[0]?.runes ?? []) {
      runes[String(keystone.id)] = { icon: keystone.icon, name: keystone.name };
    }
  }
  return { version: input.version, champions, championKeys, items, spells, runes };
}
