import type { Lane } from "@lolpamin/db";
import { DRAFT_LANES, type DraftSide, type DraftState, type MasteryEntry } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";

// 명단에 없는 사람. 팀 짜기에만 쓰고 DB에는 쓰지 않는다 — 결과는 리플레이로만 들어온다.
export interface Guest {
  name: string;
  mmr: number;
  mainLane: Lane | null;
  subLane: Lane | null;
}

export const GUEST_DEFAULT_MMR = 1000;

export interface Candidate {
  key: string;
  isGuest: boolean;
  name: string;
  mmr: number;
  wins: number | null;
  losses: number | null;
  mainLane: Lane | null;
  subLane: Lane | null;
  riotId: string | null;
  extraAccounts: number;
  masteries: MasteryEntry[];
}

// 회원 id와 게스트 이름이 같은 문자열이어도 부딪히지 않게 접두어로 나눈다.
export function memberKey(id: string): string {
  return `m:${id}`;
}

export function guestKey(name: string): string {
  return `g:${name}`;
}

export function normalizeGuestName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function guestNameError(name: string, guests: Guest[], pool: DraftPoolMember[]): string | null {
  if (name === "") return "이름을 입력해 주세요.";
  if (guests.some((g) => g.name === name)) return "이미 추가한 이름입니다.";
  if (pool.some((m) => m.name === name)) return "명단에 있는 이름입니다. 위에서 선택해 주세요.";
  return null;
}

export function buildCandidates(pool: DraftPoolMember[], participantIds: string[], guests: Guest[]): Candidate[] {
  const selected = new Set(participantIds);
  const members: Candidate[] = pool
    .filter((m) => selected.has(m.id))
    .map((m) => ({
      key: memberKey(m.id),
      isGuest: false,
      name: m.name,
      mmr: m.mmr,
      wins: m.wins,
      losses: m.losses,
      mainLane: m.mainLane,
      subLane: m.subLane,
      riotId: m.riotId,
      extraAccounts: m.extraAccounts,
      masteries: m.masteries,
    }));
  const visitors: Candidate[] = guests.map((g) => ({
    key: guestKey(g.name),
    isGuest: true,
    name: g.name,
    mmr: g.mmr,
    wins: null,
    losses: null,
    mainLane: g.mainLane,
    subLane: g.subLane,
    riotId: null,
    extraAccounts: 0,
    masteries: [],
  }));
  return [...members, ...visitors].sort((a, b) => b.mmr - a.mmr || a.name.localeCompare(b.name, "ko"));
}

export function teamAverage(state: DraftState, side: DraftSide, byKey: Map<string, Candidate>): number | null {
  const ratings = DRAFT_LANES.map((lane) => state.slots[side][lane])
    .map((key) => (key === null ? undefined : byKey.get(key)))
    .filter((c): c is Candidate => c !== undefined)
    .map((c) => c.mmr);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}
