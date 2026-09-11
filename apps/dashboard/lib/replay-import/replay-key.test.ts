import { describe, expect, it } from "vitest";
import { parseRoflMetadata } from "@lolpamin/core";
import { computeReplayKey } from "./replay-key";
import { buildRoflFixture, tenPlayers } from "./test-fixture";

describe("computeReplayKey", () => {
  it("gives the same key for the same replay regardless of participant order", () => {
    const players = tenPlayers();
    const shuffled = [...players].reverse();

    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(players)));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(shuffled)));

    expect(a).toBe(b);
  });

  it("gives a different key for a different game length", () => {
    const players = tenPlayers();

    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(players, 1584502)));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(players, 1600000)));

    expect(a).not.toBe(b);
  });

  it("gives a different key when one participant differs", () => {
    const a = computeReplayKey(parseRoflMetadata(buildRoflFixture(tenPlayers())));
    const b = computeReplayKey(parseRoflMetadata(buildRoflFixture(tenPlayers([{ puuid: "someone-else" }]))));

    expect(a).not.toBe(b);
  });
});
