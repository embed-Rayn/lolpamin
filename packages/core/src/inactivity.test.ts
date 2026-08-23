import { describe, expect, it } from "vitest";
import { getInactiveMembers, INACTIVITY_THRESHOLD_DAYS } from "./inactivity";

const NOW = new Date("2026-08-23T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("getInactiveMembers", () => {
  it("excludes members with no kakaoUserId (nothing to measure)", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: null, lastActiveAt: daysAgo(100), createdAt: daysAgo(100) }],
      NOW
    );
    expect(result).toEqual([]);
  });

  it("excludes members active within the threshold", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: daysAgo(13), createdAt: daysAgo(30) }],
      NOW
    );
    expect(result).toEqual([]);
  });

  it("includes members at or beyond the threshold, with days since active", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: daysAgo(14), createdAt: daysAgo(60) }],
      NOW
    );
    expect(result).toEqual([{ id: "1", daysSinceActive: 14 }]);
    expect(INACTIVITY_THRESHOLD_DAYS).toBe(14);
  });

  it("falls back to createdAt when lastActiveAt is null, treating them as inactive since joining", () => {
    const result = getInactiveMembers(
      [{ id: "1", kakaoUserId: "k1", lastActiveAt: null, createdAt: daysAgo(20) }],
      NOW
    );
    expect(result).toEqual([{ id: "1", daysSinceActive: 20 }]);
  });

  it("sorts by days inactive, longest first", () => {
    const result = getInactiveMembers(
      [
        { id: "short", kakaoUserId: "k1", lastActiveAt: daysAgo(15), createdAt: daysAgo(60) },
        { id: "long", kakaoUserId: "k2", lastActiveAt: daysAgo(40), createdAt: daysAgo(60) },
      ],
      NOW
    );
    expect(result.map((r) => r.id)).toEqual(["long", "short"]);
  });
});
