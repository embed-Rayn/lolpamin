import type { MemberTier } from "@lolpamin/db";
import {
  DRAFT_LANES,
  DRAFT_SIDES,
  isLane,
  lineupReducer,
  lineupSideStats,
  TIER_SCORES,
  type DraftSide,
  type LineupSideStats,
  type LineupSlots,
} from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { buildCandidates, guestKey, memberKey, type Candidate, type Guest } from "@/lib/draft/candidates";

// 수동 팀짜기의 게스트는 티어를 손으로 고른다 — 팀 티어 합에 들어가야 해서다.
export interface LineupGuest extends Guest {
  tier: MemberTier;
}

export interface LineupCandidate extends Candidate {
  tier: MemberTier;
}

export function buildLineupCandidates(
  pool: DraftPoolMember[],
  participantIds: string[],
  guests: LineupGuest[],
): LineupCandidate[] {
  const tiers = new Map<string, MemberTier>([
    ...pool.map((m) => [memberKey(m.id), m.tier] as const),
    ...guests.map((g) => [guestKey(g.name), g.tier] as const),
  ]);
  return buildCandidates(pool, participantIds, guests).map((c) => ({ ...c, tier: tiers.get(c.key) ?? "UNRANKED" }));
}

export function sideStats(
  slots: LineupSlots,
  side: DraftSide,
  byKey: Map<string, LineupCandidate>,
): LineupSideStats {
  const seated = DRAFT_LANES.map((lane) => slots[side][lane])
    .map((key) => (key === null ? undefined : byKey.get(key)))
    .filter((c): c is LineupCandidate => c !== undefined);
  return lineupSideStats(seated);
}

// 내전 팀 빌더(lolpamin.draft.v1)와 따로 둔다 — 두 화면을 오가도 서로의 판을 덮지 않게.
// 탭을 닫으면 사라지는 것도 같은 이유다: 어제 짠 팀이 남아 있으면 다음 판에 헷갈린다.
export const TEAM_BUILDER_STORAGE_KEY = "lolpamin.team-builder.v1";

export interface StoredLineup {
  participantIds: string[];
  guests: LineupGuest[];
  slots: LineupSlots;
}

const isLaneOrNull = (v: unknown) => v === null || isLane(v);
const isTier = (v: unknown): v is MemberTier => typeof v === "string" && Object.hasOwn(TIER_SCORES, v);

function isGuest(v: unknown): v is LineupGuest {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.name === "string" &&
    typeof g.mmr === "number" &&
    Number.isFinite(g.mmr) &&
    isTier(g.tier) &&
    isLaneOrNull(g.mainLane) &&
    isLaneOrNull(g.subLane)
  );
}

function isSlots(v: unknown): v is LineupSlots {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, any>;
  return DRAFT_SIDES.every(
    (side) =>
      typeof s[side] === "object" &&
      s[side] !== null &&
      DRAFT_LANES.every((lane) => s[side][lane] === null || typeof s[side][lane] === "string"),
  );
}

/** 저장본을 읽고, 풀에서 사라진 회원을 참여자·좌석에서 걷어낸다. 무엇이든 실패하면 null. */
export function loadLineup(
  storage: Pick<Storage, "getItem"> | null,
  validMemberIds: ReadonlySet<string>,
): StoredLineup | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(TEAM_BUILDER_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.participantIds) || !parsed.participantIds.every((id) => typeof id === "string")) return null;
    if (!Array.isArray(parsed.guests) || !parsed.guests.every(isGuest)) return null;
    if (!isSlots(parsed.slots)) return null;

    const participantIds = (parsed.participantIds as string[]).filter((id) => validMemberIds.has(id));
    const guests = parsed.guests as LineupGuest[];
    const validKeys = new Set([...participantIds.map(memberKey), ...guests.map((g) => guestKey(g.name))]);

    let slots = parsed.slots;
    for (const side of DRAFT_SIDES) {
      for (const lane of DRAFT_LANES) {
        const key = slots[side][lane];
        if (key !== null && !validKeys.has(key)) slots = lineupReducer(slots, { type: "unseat", key });
      }
    }
    return { participantIds, guests, slots };
  } catch {
    return null;
  }
}

export function saveLineup(storage: Pick<Storage, "setItem"> | null, value: StoredLineup): void {
  if (storage === null) return;
  try {
    storage.setItem(TEAM_BUILDER_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 사생활 모드·저장소 차단: 보존만 포기하고 화면은 계속 동작한다.
  }
}
