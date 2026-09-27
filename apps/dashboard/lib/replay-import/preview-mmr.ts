import { calculateTeamMmrChange, type MmrConfig } from "@lolpamin/core";

/**
 * The MMR each assigned member would end on if the admin saved right now — the upload
 * preview's stand-in for GameParticipant.mmrBefore/mmrAfter, which do not exist yet.
 * Uses the same team-average formula and stored config the save uses. While one team has
 * no member assigned the change is undefined (the save would refuse too), so members
 * show their current rating with mmrAfter null.
 */
export function previewReplayMmr(input: {
  assignments: Array<{ team: "BLUE" | "RED"; memberId: string | null }>;
  ratingOf: (memberId: string) => number;
  winner: "BLUE" | "RED";
  config: MmrConfig;
}): Map<string, { mmrBefore: number; mmrAfter: number | null }> {
  const ids = (team: "BLUE" | "RED") =>
    input.assignments.filter((a) => a.team === team && a.memberId !== null).map((a) => a.memberId!);
  const blue = ids("BLUE");
  const red = ids("RED");

  const result = new Map<string, { mmrBefore: number; mmrAfter: number | null }>();
  if (blue.length === 0 || red.length === 0) {
    for (const id of [...blue, ...red]) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: null });
    return result;
  }

  const { blueDelta, redDelta } = calculateTeamMmrChange({
    blueRatings: blue.map(input.ratingOf),
    redRatings: red.map(input.ratingOf),
    winner: input.winner,
    config: input.config,
  });
  for (const id of blue) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: input.ratingOf(id) + blueDelta });
  for (const id of red) result.set(id, { mmrBefore: input.ratingOf(id), mmrAfter: input.ratingOf(id) + redDelta });
  return result;
}
