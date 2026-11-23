import { describe, expect, it } from "vitest";
import { isReplayPuuid } from "./replay-puuid";

describe("isReplayPuuid", () => {
  it("accepts the unencrypted UUID a .rofl carries", () => {
    expect(isReplayPuuid("2e8e7555-57bb-59ba-af2b-832690b4e7d4")).toBe(true);
    expect(isReplayPuuid("2E8E7555-57BB-59BA-AF2B-832690B4E7D4")).toBe(true);
  });

  it("rejects an API PUUID, which is what a name#tag registration stores", () => {
    expect(isReplayPuuid("mfY_Ry1XJ-9ORingmGfHGOPvpgFYqqFxURvWft798XtMf5FUVxlcL1m1obTz6KlQDKdHE_5AQNrCgw")).toBe(false);
    expect(isReplayPuuid("")).toBe(false);
  });
});
