import type { DrawCandidate } from "@lolpamin/core";

export interface DrawAnimator {
  skip(): void;
  sync(remaining: DrawCandidate[]): void;
}

// 06: the winner is already decided when play() is called, so the animation only
// plays it back. Nothing is ever played in reverse — after undo/reset the screen
// calls sync() and the renderer redraws from the current pool.
export interface PlaybackAnimator extends DrawAnimator {
  play(winner: DrawCandidate): Promise<void>;
}

// 07: the marbles race under real physics, so the renderer decides who wins and
// hands the winner back. The screen then commits that candidate to the draw state.
export interface RaceAnimator extends DrawAnimator {
  race(): Promise<DrawCandidate>;
  // Team draw: one race that runs until the whole field is home. onFinish fires
  // for each crossing with the order so far, and the promise resolves with the
  // complete order.
  raceAll(onFinish?: (order: DrawCandidate[]) => void): Promise<DrawCandidate[]>;
}
