// Client-safe icon and name lookups over the committed Data Dragon map. Anything the
// committed patch does not know (an item added in a later patch) resolves to null / "",
// and the board draws an empty square — a stale asset folder must never break a page.
import rawMap from "./ddragon-map.json";
import type { DdragonMap } from "./build-map";

const map = rawMap as DdragonMap;
const BASE = "/ddragon";

export function championIcon(id: string): string | null {
  return id && map.champions[id] !== undefined ? `${BASE}/champion/${id}.png` : null;
}

export function itemIcon(id: number): string | null {
  return id !== 0 && map.items[String(id)] !== undefined ? `${BASE}/item/${id}.png` : null;
}

export function spellIcon(key: number): string | null {
  const spell = map.spells[String(key)];
  return spell ? `${BASE}/spell/${spell.file}` : null;
}

export function runeIcon(id: number): string | null {
  const rune = map.runes[String(id)];
  return rune ? `${BASE}/${rune.icon}` : null;
}

export function championName(id: string): string {
  return map.champions[id] ?? id;
}

export function itemName(id: number): string {
  return map.items[String(id)] ?? "";
}

export function spellName(key: number): string {
  return map.spells[String(key)]?.name ?? "";
}

export function runeName(id: number): string {
  return map.runes[String(id)]?.name ?? "";
}
