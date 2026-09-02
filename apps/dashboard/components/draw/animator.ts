import type { DrawCandidate } from "@lolpamin/core";

// The winner is already decided when play() is called; an animator only plays it
// back. sync() redraws from the current pool after undo/reset — nothing is ever
// played in reverse, so the picture cannot drift from the state.
export interface DrawAnimator {
  play(winner: DrawCandidate): Promise<void>;
  skip(): void;
  sync(remaining: DrawCandidate[]): void;
}
