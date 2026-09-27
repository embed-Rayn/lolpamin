import { describe, expect, it } from "vitest";
import { calculateTeamMmrChange, DEFAULT_MMR_CONFIG } from "@lolpamin/core";
import { previewReplayMmr } from "./preview-mmr";

const ratings: Record<string, number> = { a: 1000, b: 1100, c: 1200 };
const ratingOf = (id: string) => ratings[id];

describe("previewReplayMmr", () => {
  it("applies the same team delta the save will, using the stored config", () => {
    const config = { k: 20, winPoint: 5, lossPoint: 2 };
    const preview = previewReplayMmr({
      assignments: [
        { team: "BLUE", memberId: "a" },
        { team: "BLUE", memberId: "b" },
        { team: "RED", memberId: "c" },
        { team: "RED", memberId: null },
      ],
      ratingOf,
      winner: "RED",
      config,
    });

    const { blueDelta, redDelta } = calculateTeamMmrChange({
      blueRatings: [1000, 1100],
      redRatings: [1200],
      winner: "RED",
      config,
    });
    expect(preview.get("a")).toEqual({ mmrBefore: 1000, mmrAfter: 1000 + blueDelta });
    expect(preview.get("b")).toEqual({ mmrBefore: 1100, mmrAfter: 1100 + blueDelta });
    expect(preview.get("c")).toEqual({ mmrBefore: 1200, mmrAfter: 1200 + redDelta });
    expect(preview.size).toBe(3);
  });

  it("shows current mmr without a change while one team has no member yet", () => {
    // calculateTeamMmrChange throws on an empty team; the form must not crash mid-assignment.
    const preview = previewReplayMmr({
      assignments: [
        { team: "BLUE", memberId: "a" },
        { team: "RED", memberId: null },
      ],
      ratingOf,
      winner: "BLUE",
      config: DEFAULT_MMR_CONFIG,
    });

    expect(preview.get("a")).toEqual({ mmrBefore: 1000, mmrAfter: null });
  });
});
