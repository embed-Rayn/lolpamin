// The offline build has no database: the roster is a list of names the user types in,
// kept in this browser's localStorage. A name is its own id, so the same person keeps
// the same id across edits and re-imports.

export interface OfflineMember {
  id: string;
  name: string;
}

const KEY = "lolpamin.offline.members.v1";

export function parseMemberNames(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const data: unknown = JSON.parse(trimmed);
      if (Array.isArray(data)) {
        return dedupe(
          data.map((item) =>
            typeof item === "string" ? item : typeof item?.name === "string" ? item.name : ""
          )
        );
      }
    } catch {
      // Not JSON after all — fall through to one name per line.
    }
  }
  return dedupe(text.split(/\r?\n/));
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function toMembers(names: string[]): OfflineMember[] {
  return names.map((name) => ({ id: `m:${name}`, name }));
}

export function loadMemberNames(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? dedupe(data.filter((x): x is string => typeof x === "string")) : [];
  } catch {
    return [];
  }
}

export function saveMemberNames(names: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // Storage blocked: the list lives for this session only.
  }
}
