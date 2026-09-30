// Multi-name search for the participant pickers: an admin pastes the chatroom's recruit post
// ("1. @최경준/98/뀨 잇#KR01", "7. @정승연/96/King Gnu#1088 (10시까지만...)") or a plain list of
// names, and gets the members back. The group writes 실명/출생연도/게임닉#태그, so the name is
// whatever stands before the first slash.

const LIST_MARKER = /^\s*(?:\d+\s*[.)]|[-*•·])\s*/;
const TRAILING_MEMO = /\s*[([].*$/;

function namePart(piece: string): string {
  return piece.split("/")[0].replace(TRAILING_MEMO, "").trim();
}

// Spaces and case never tell two members apart here ("조영빈 " vs "조영빈", "김 복건").
export function normalizeParticipantName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

export function parseParticipantNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const name = namePart(raw);
    const key = normalizeParticipantName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.includes("@")) {
      // Everything before the first @ is numbering or a header; each @ starts one person.
      for (const mention of line.split("@").slice(1)) add(mention);
      continue;
    }
    for (const piece of line.replace(LIST_MARKER, "").split(",")) add(piece);
  }
  return names;
}

export interface ParticipantNameMatch {
  matchedIds: string[];
  // Names no member answers to — a guest, a typo, or someone not registered yet.
  unmatched: string[];
  // Names two or more members share (동명이인). All of them are selected; the admin unticks.
  ambiguous: string[];
}

// `names` per member: whatever the picker shows for it (실명, or a whole nickname).
export function matchParticipantNames(
  names: readonly string[],
  members: ReadonlyArray<{ id: string; names: readonly string[] }>,
): ParticipantNameMatch {
  const byKey = new Map<string, string[]>();
  for (const member of members) {
    // Read member names by the paste's rule too: "김복건(운영진)" and a whole nickname
    // "유기훈/92/람스터#람스터" both answer to their bare name.
    const keys = member.names.flatMap((n) => [normalizeParticipantName(n), normalizeParticipantName(namePart(n))]);
    for (const key of new Set(keys.filter(Boolean))) {
      byKey.set(key, [...(byKey.get(key) ?? []), member.id]);
    }
  }

  const matchedIds: string[] = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  for (const name of names) {
    const ids = byKey.get(normalizeParticipantName(name)) ?? [];
    if (ids.length === 0) unmatched.push(name);
    if (ids.length > 1) ambiguous.push(name);
    for (const id of ids) if (!matchedIds.includes(id)) matchedIds.push(id);
  }
  return { matchedIds, unmatched, ambiguous };
}
