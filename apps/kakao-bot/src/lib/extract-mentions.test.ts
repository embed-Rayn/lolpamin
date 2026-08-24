import { describe, expect, it } from "vitest";
import { extractMentionedKakaoUserIds } from "./extract-mentions";

describe("extractMentionedKakaoUserIds", () => {
  it("returns an empty array when there are no mentions", () => {
    expect(extractMentionedKakaoUserIds([])).toEqual([]);
  });

  it("returns the stringified user id for a single mention", () => {
    const result = extractMentionedKakaoUserIds([{ user_id: "12345" }]);
    expect(result).toEqual(["12345"]);
  });

  it("stringifies non-string user ids (e.g. bson.Long-like objects)", () => {
    const longLike = { toString: () => "98765" };
    const result = extractMentionedKakaoUserIds([{ user_id: longLike }]);
    expect(result).toEqual(["98765"]);
  });

  it("preserves first-occurrence order across distinct mentions", () => {
    const result = extractMentionedKakaoUserIds([{ user_id: "a" }, { user_id: "b" }]);
    expect(result).toEqual(["a", "b"]);
  });

  it("deduplicates repeated mentions of the same user in one message", () => {
    const result = extractMentionedKakaoUserIds([
      { user_id: "a" },
      { user_id: "a" },
      { user_id: "b" },
    ]);
    expect(result).toEqual(["a", "b"]);
  });
});
