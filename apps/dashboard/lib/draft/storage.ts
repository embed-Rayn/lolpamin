import {
  DRAFT_LANES,
  DRAFT_SIDES,
  draftReducer,
  isLane,
  seatOf,
  type DraftState,
} from "@lolpamin/core";
import { guestKey, memberKey, type Guest } from "./candidates";

// 탭을 닫으면 사라지는 게 맞다 — 어제 짠 팀이 남아 있으면 다음 판에 헷갈린다.
export const DRAFT_STORAGE_KEY = "lolpamin.draft.v1";

export interface StoredDraft {
  participantIds: string[];
  guests: Guest[];
  draft: DraftState;
}

const isKeyOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isLaneOrNull = (v: unknown) => v === null || isLane(v);

function isGuest(v: unknown): v is Guest {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.name === "string" && typeof g.mmr === "number" && Number.isFinite(g.mmr) && isLaneOrNull(g.mainLane) && isLaneOrNull(g.subLane);
}

function isDraftState(v: unknown): v is DraftState {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, any>;
  if (typeof d.captains !== "object" || d.captains === null) return false;
  if (typeof d.slots !== "object" || d.slots === null) return false;
  if (!Array.isArray(d.picks) || !d.picks.every((k: unknown) => typeof k === "string")) return false;
  return DRAFT_SIDES.every(
    (side) =>
      isKeyOrNull(d.captains[side]) &&
      typeof d.slots[side] === "object" &&
      d.slots[side] !== null &&
      DRAFT_LANES.every((lane) => isKeyOrNull(d.slots[side][lane])),
  );
}

/** 저장본을 읽고, 풀에서 사라진 회원을 참여자·좌석·픽에서 걷어낸다. 무엇이든 실패하면 null. */
export function loadDraft(
  storage: Pick<Storage, "getItem"> | null,
  validMemberIds: ReadonlySet<string>,
): StoredDraft | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.participantIds) || !parsed.participantIds.every((id) => typeof id === "string")) return null;
    if (!Array.isArray(parsed.guests) || !parsed.guests.every(isGuest)) return null;
    if (!isDraftState(parsed.draft)) return null;

    const participantIds = (parsed.participantIds as string[]).filter((id) => validMemberIds.has(id));
    const guests = parsed.guests as Guest[];
    const validKeys = new Set([...participantIds.map(memberKey), ...guests.map((g) => guestKey(g.name))]);

    let draft = parsed.draft;
    for (const side of DRAFT_SIDES) {
      for (const lane of DRAFT_LANES) {
        const key = draft.slots[side][lane];
        if (key !== null && !validKeys.has(key)) draft = draftReducer(draft, { type: "removeParticipant", key });
      }
    }
    // 좌석에 없는 픽(손상된 저장본)은 되돌리기를 헛돌게 하니 버린다.
    draft = { ...draft, picks: draft.picks.filter((k) => seatOf(draft, k) !== null) };

    return { participantIds, guests, draft };
  } catch {
    return null;
  }
}

export function saveDraft(storage: Pick<Storage, "setItem"> | null, value: StoredDraft): void {
  if (storage === null) return;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 사생활 모드·저장소 차단: 보존만 포기하고 화면은 계속 동작한다.
  }
}
