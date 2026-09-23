import type { ReplayPlayerStats } from "@lolpamin/core";
import type { GameMode } from "@lolpamin/db";

/**
 * The member behind a replay player. mmrAfter is null only in the upload preview when the
 * change cannot be computed yet (a team with no member assigned).
 */
export interface GameDetailMember {
  name: string;
  mmrBefore: number;
  mmrAfter: number | null;
}

export interface GameDetailPlayer extends ReplayPlayerStats {
  /** null for an outsider — someone who played but is not one of our members. */
  member: GameDetailMember | null;
}

export interface GameDetail {
  winner: "BLUE" | "RED";
  mode: GameMode;
  gameLengthMs: number;
  players: GameDetailPlayer[];
}
