import type { GameMode } from "@lolpamin/db";

export function ratingField(mode: GameMode): "mmr" | "aramMmr" {
  return mode === "ARAM" ? "aramMmr" : "mmr";
}
