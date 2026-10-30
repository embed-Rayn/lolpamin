"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DRAFT_LANES,
  DRAFT_SIDES,
  emptyLineup,
  lineupReducer,
  type DraftSide,
  type LineupAction,
  type LineupSlots,
  type SlotRef,
} from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { GUEST_DEFAULT_MMR, guestKey, memberKey } from "@/lib/draft/candidates";
import { buildLineupCandidates, loadLineup, saveLineup, sideStats, type LineupGuest } from "@/lib/team-builder/lineup";
import { ParticipantPicker } from "@/components/draft/ParticipantPicker";
import type { DragPayload } from "@/components/draft/dnd";
import { ParticipantBench } from "./ParticipantBench";
import { LineupBoard } from "./LineupBoard";

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function TeamBuilder({ pool }: { pool: DraftPoolMember[] }) {
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<LineupGuest[]>([]);
  const [slots, setSlots] = useState<LineupSlots>(emptyLineup);
  // 서버 렌더와 첫 클라이언트 렌더를 맞추려고 저장본은 마운트 뒤에 읽는다. 읽기 전에
  // 저장하면 빈 상태가 저장본을 덮으므로 읽은 뒤에만 쓴다.
  const [hydrated, setHydrated] = useState(false);
  // 클릭으로 앉히기에서 고른 사람(대기 중이든 앉아 있든).
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicked(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const stored = loadLineup(sessionStore(), new Set(pool.map((m) => m.id)));
    if (stored !== null) {
      setParticipantIds(stored.participantIds);
      setGuests(stored.guests);
      setSlots(stored.slots);
    }
    setHydrated(true);
    // 풀은 서버가 준 값이라 첫 마운트 기준으로 충분하다.
  }, []);

  useEffect(() => {
    if (hydrated) saveLineup(sessionStore(), { participantIds, guests, slots });
  }, [hydrated, participantIds, guests, slots]);

  const candidates = useMemo(() => buildLineupCandidates(pool, participantIds, guests), [pool, participantIds, guests]);
  const byKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates]);
  const sides = useMemo(() => {
    const map = new Map<string, DraftSide>();
    for (const side of DRAFT_SIDES) {
      for (const lane of DRAFT_LANES) {
        const key = slots[side][lane];
        if (key !== null) map.set(key, side);
      }
    }
    return map;
  }, [slots]);
  const stats: Record<DraftSide, ReturnType<typeof sideStats>> = {
    blue: sideStats(slots, "blue", byKey),
    red: sideStats(slots, "red", byKey),
  };

  const apply = (action: LineupAction) => setSlots((current) => lineupReducer(current, action));

  function toggleParticipant(id: string) {
    if (picked === memberKey(id)) setPicked(null);
    if (participantIds.includes(id)) {
      setParticipantIds(participantIds.filter((x) => x !== id));
      apply({ type: "unseat", key: memberKey(id) });
    } else {
      setParticipantIds([...participantIds, id]);
    }
  }

  function removeGuest(name: string) {
    if (picked === guestKey(name)) setPicked(null);
    setGuests(guests.filter((g) => g.name !== name));
    apply({ type: "unseat", key: guestKey(name) });
  }

  function keyOf(payload: DragPayload): string | null {
    return payload.kind === "bench" ? payload.key : slots[payload.from.side][payload.from.lane];
  }

  function dropOnSeat(payload: DragPayload, to: SlotRef) {
    setPicked(null);
    const key = keyOf(payload);
    if (key !== null) apply({ type: "place", key, to });
  }

  function clickSeat(at: SlotRef) {
    const occupant = slots[at.side][at.lane];
    if (picked === null) {
      setPicked(occupant);
    } else if (picked === occupant) {
      setPicked(null);
    } else {
      apply({ type: "place", key: picked, to: at });
      setPicked(null);
    }
  }

  // 참여자 칸의 빈 곳을 누르면: 앉아 있던 사람을 골라 둔 상태라면 자리에서 뺀다.
  function clickBench() {
    if (picked !== null && sides.has(picked)) apply({ type: "unseat", key: picked });
    setPicked(null);
  }

  function dropOnBench(payload: DragPayload) {
    setPicked(null);
    if (payload.kind !== "slot") return;
    const key = keyOf(payload);
    if (key !== null) apply({ type: "unseat", key });
  }

  return (
    <div className="flex flex-col gap-4">
      <ParticipantPicker
        pool={pool}
        selectedIds={participantIds}
        guests={guests}
        onToggle={toggleParticipant}
        onSelectMany={(ids) => setParticipantIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))])}
        onAddGuest={(name) =>
          setGuests([...guests, { name, mmr: GUEST_DEFAULT_MMR, tier: "UNRANKED", mainLane: null, subLane: null }])
        }
        onRemoveGuest={removeGuest}
        onClearAll={() => {
          setPicked(null);
          setParticipantIds([]);
          setGuests([]);
          apply({ type: "reset" });
        }}
      />
      <ParticipantBench
        candidates={candidates}
        sideOf={(key) => sides.get(key) ?? null}
        picked={picked}
        onPick={(key) => setPicked(picked === key ? null : key)}
        onUnseat={clickBench}
        onDrop={dropOnBench}
        onGuestChange={(name, patch) => setGuests(guests.map((g) => (g.name === name ? { ...g, ...patch } : g)))}
      />
      <LineupBoard slots={slots} byKey={byKey} stats={stats} onDrop={dropOnSeat}
        onReset={() => {
          setPicked(null);
          apply({ type: "reset" });
        }}
        picked={picked}
        onSeatClick={clickSeat}
      />
    </div>
  );
}
