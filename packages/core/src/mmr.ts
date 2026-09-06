export const MMR_K = 40;

// Everyone who shows up gains a bonus on top of the win/loss swing, so playing
// is always worth something and winning is worth a little more. It makes the
// system deliberately non-zero-sum.
export const WIN_POINT = 3;
export const LOSS_POINT = 1;

export type TeamSide = "BLUE" | "RED";

export interface TeamMmrInput {
  blueRatings: number[];
  redRatings: number[];
  winner: TeamSide;
}

export interface TeamMmrResult {
  blueDelta: number;
  redDelta: number;
  expectedBlueWinRate: number;
}

function average(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function calculateTeamMmrChange({
  blueRatings,
  redRatings,
  winner,
}: TeamMmrInput): TeamMmrResult {
  if (blueRatings.length === 0 || redRatings.length === 0) {
    throw new Error("Both teams must have at least one player");
  }

  const blueAvg = average(blueRatings);
  const redAvg = average(redRatings);
  const expectedBlueWinRate = 1 / (1 + Math.pow(10, (redAvg - blueAvg) / 400));

  const blueScore = winner === "BLUE" ? 1 : 0;
  const redScore = 1 - blueScore;

  const bluePoint = winner === "BLUE" ? WIN_POINT : LOSS_POINT;
  const redPoint = winner === "RED" ? WIN_POINT : LOSS_POINT;

  const blueDelta = Math.round(MMR_K * (blueScore - expectedBlueWinRate)) + bluePoint;
  const redDelta = Math.round(MMR_K * (redScore - (1 - expectedBlueWinRate))) + redPoint;

  return { blueDelta, redDelta, expectedBlueWinRate };
}

// Quarterly soft reset: every rating is pulled halfway back to the base, so the
// season's standings survive as an ordering while the gaps compress and a new
// quarter is winnable for everyone.
export const SOFT_RESET_BASE = 1000;
export const SOFT_RESET_RATIO = 0.5;

export function applySoftReset(mmr: number): number {
  return Math.round(SOFT_RESET_BASE + (mmr - SOFT_RESET_BASE) * SOFT_RESET_RATIO);
}

// Hard reset: the ordering is thrown away too, not just compressed. Everyone
// starts the quarter from the same rating a brand new member gets.
export function applyHardReset(): number {
  return SOFT_RESET_BASE;
}
