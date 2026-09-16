export interface DrawCandidate {
  id: string;
  label: string;
}

// The pool is stored as a fixed candidate list plus a stack of drawn ids rather
// than as two mutable arrays. Undo is then a pop, an undone candidate returns to
// its original position instead of the end of the list, and the undo depth is
// naturally unlimited.
export interface DrawState {
  candidates: DrawCandidate[];
  drawnIds: string[];
}

export function createDrawState(candidates: DrawCandidate[]): DrawState {
  return { candidates: [...candidates], drawnIds: [] };
}

export function remainingCandidates(state: DrawState): DrawCandidate[] {
  const drawn = new Set(state.drawnIds);
  return state.candidates.filter((c) => !drawn.has(c.id));
}

export function drawnCandidates(state: DrawState): DrawCandidate[] {
  const byId = new Map(state.candidates.map((c) => [c.id, c]));
  return state.drawnIds.map((id) => byId.get(id)!);
}

// nextIndex is injected so tests stay deterministic and core keeps no dependency
// on Web Crypto. It must return an integer in [0, n).
export function drawNext(
  state: DrawState,
  nextIndex: (n: number) => number
): { state: DrawState; picked: DrawCandidate } | null {
  const remaining = remainingCandidates(state);
  if (remaining.length === 0) return null;

  const picked = remaining[nextIndex(remaining.length)];
  return {
    state: { candidates: state.candidates, drawnIds: [...state.drawnIds, picked.id] },
    picked,
  };
}

export function undoDraw(state: DrawState): DrawState {
  if (state.drawnIds.length === 0) return state;
  return { candidates: state.candidates, drawnIds: state.drawnIds.slice(0, -1) };
}

export function resetDraw(state: DrawState): DrawState {
  return { candidates: state.candidates, drawnIds: [] };
}

// Used when the animation itself decides the winner (the marble race in 07):
// the renderer hands back whoever crossed the goal first and the state records
// that pick. Returns null if the id is unknown or already drawn.
export function drawById(
  state: DrawState,
  id: string
): { state: DrawState; picked: DrawCandidate } | null {
  const picked = remainingCandidates(state).find((c) => c.id === id);
  if (!picked) return null;
  return {
    state: { candidates: state.candidates, drawnIds: [...state.drawnIds, picked.id] },
    picked,
  };
}

// Team draw on 07: the finish order alternates BLUE, RED, BLUE, RED so the
// first two home face each other. An odd field leaves BLUE one up.
export interface TeamAssignment {
  blue: DrawCandidate[];
  red: DrawCandidate[];
}

export function assignTeams(order: DrawCandidate[]): TeamAssignment {
  return {
    blue: order.filter((_, i) => i % 2 === 0),
    red: order.filter((_, i) => i % 2 === 1),
  };
}
