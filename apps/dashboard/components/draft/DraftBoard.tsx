"use client";

import { useEffect, useMemo, useState } from "react";
import { currentTurn, draftReducer, emptyDraft, type DraftAction, type DraftSide, type DraftState, type MmrConfig, type SlotRef } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { buildCandidates, GUEST_DEFAULT_MMR, guestKey, memberKey, teamAverage, type Candidate, type Guest } from "@/lib/draft/candidates";
import { loadDraft, saveDraft } from "@/lib/draft/storage";
import { MmrSimulator } from "@/components/MmrSimulator";
import { ParticipantPicker } from "./ParticipantPicker";
import { CandidateTable } from "./CandidateTable";
import { TurnBanner } from "./TurnBanner";
import { EntryBoard } from "./EntryBoard";
import type { DragPayload } from "./dnd";

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function DraftBoard({
  pool,
  config,
}: {
  pool: DraftPoolMember[];
  config: MmrConfig;
}) {
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  // 서버 렌더와 첫 클라이언트 렌더를 맞추려고 저장본은 마운트 뒤에 읽는다. 읽기 전에
  // 저장하면 빈 상태가 저장본을 덮으므로 읽은 뒤에만 쓴다.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadDraft(sessionStore(), new Set(pool.map((m) => m.id)));
    if (stored !== null) {
      setParticipantIds(stored.participantIds);
      setGuests(stored.guests);
      setDraft(stored.draft);
    }
    setHydrated(true);
    // 풀은 서버가 준 값이라 첫 마운트 기준으로 충분하다.
  }, []);

  useEffect(() => {
    if (hydrated) saveDraft(sessionStore(), { participantIds, guests, draft });
  }, [hydrated, participantIds, guests, draft]);

  const candidates = useMemo(() => buildCandidates(pool, participantIds, guests), [pool, participantIds, guests]);
  const byKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates]);
  const turn = currentTurn(draft);
  const averages: Record<DraftSide, number | null> = {
    blue: teamAverage(draft, "blue", byKey),
    red: teamAverage(draft, "red", byKey),
  };

  const apply = (action: DraftAction) => setDraft((state) => draftReducer(state, action));
  const prefsOf = (c: Candidate) => ({ mainLane: c.mainLane, subLane: c.subLane });

  function toggleParticipant(id: string) {
    if (participantIds.includes(id)) {
      setParticipantIds(participantIds.filter((x) => x !== id));
      apply({ type: "removeParticipant", key: memberKey(id) });
    } else {
      setParticipantIds([...participantIds, id]);
    }
  }

  function removeGuest(name: string) {
    setGuests(guests.filter((g) => g.name !== name));
    apply({ type: "removeParticipant", key: guestKey(name) });
  }

  function handleDrop(payload: DragPayload, to: SlotRef) {
    if (payload.kind === "bench") apply({ type: "dropFromBench", key: payload.key, to });
    else apply({ type: "move", from: payload.from, to });
  }

  return (
    <div className="flex flex-col gap-4">
      <ParticipantPicker
        pool={pool}
        selectedIds={participantIds}
        guests={guests}
        onToggle={toggleParticipant}
        onAddGuest={(name) => setGuests([...guests, { name, mmr: GUEST_DEFAULT_MMR, mainLane: null, subLane: null }])}
        onRemoveGuest={removeGuest}
      />
      <CandidateTable
        candidates={candidates}
        draft={draft}
        turn={turn}
        onSetCaptain={(side, c) => apply({ type: "setCaptain", side, key: c.key, prefs: prefsOf(c) })}
        onPick={(c) => apply({ type: "pick", key: c.key, prefs: prefsOf(c) })}
        onGuestChange={(name, patch) => setGuests(guests.map((g) => (g.name === name ? { ...g, ...patch } : g)))}
      />
      <TurnBanner
        draft={draft}
        turn={turn}
        byKey={byKey}
        onUndo={() => apply({ type: "undo" })}
        onReset={() => apply({ type: "reset" })}
      />
      <EntryBoard draft={draft} byKey={byKey} averages={averages} onDrop={handleDrop} />
      <MmrSimulator config={config} blueAverage={averages.blue} redAverage={averages.red} />
    </div>
  );
}
