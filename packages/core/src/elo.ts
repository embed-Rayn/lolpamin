export const ELO_K = 32;

export type TeamSide = "BLUE" | "RED";

export interface TeamEloInput {
  blueRatings: number[];
  redRatings: number[];
  winner: TeamSide;
}

export interface TeamEloResult {
  blueDelta: number;
  redDelta: number;
  expectedBlueWinRate: number;
}

function average(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function calculateTeamEloChange({
  blueRatings,
  redRatings,
  winner,
}: TeamEloInput): TeamEloResult {
  if (blueRatings.length === 0 || redRatings.length === 0) {
    throw new Error("Both teams must have at least one player");
  }

  const blueAvg = average(blueRatings);
  const redAvg = average(redRatings);
  const expectedBlueWinRate = 1 / (1 + Math.pow(10, (redAvg - blueAvg) / 400));

  const blueScore = winner === "BLUE" ? 1 : 0;
  const redScore = 1 - blueScore;

  const blueDelta = Math.round(ELO_K * (blueScore - expectedBlueWinRate));
  const redDelta = Math.round(ELO_K * (redScore - (1 - expectedBlueWinRate)));

  return { blueDelta, redDelta, expectedBlueWinRate };
}
