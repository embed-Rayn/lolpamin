export const MMR_K = 32;

// Everyone who shows up gains this on top of the win/loss swing, so playing is
// always worth a point. It makes the system deliberately non-zero-sum.
export const PARTICIPATION_POINT = 1;

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

  const blueDelta = Math.round(MMR_K * (blueScore - expectedBlueWinRate)) + PARTICIPATION_POINT;
  const redDelta = Math.round(MMR_K * (redScore - (1 - expectedBlueWinRate))) + PARTICIPATION_POINT;

  return { blueDelta, redDelta, expectedBlueWinRate };
}
