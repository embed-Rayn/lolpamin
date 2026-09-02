import { describe, expect, it } from "vitest";
import { secureNextIndex } from "./random";

describe("secureNextIndex", () => {
  it("always returns 0 for a pool of one", () => {
    for (let i = 0; i < 20; i++) expect(secureNextIndex(1)).toBe(0);
  });

  it("stays inside [0, n)", () => {
    for (let i = 0; i < 500; i++) {
      const value = secureNextIndex(7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it("eventually hits every index", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(secureNextIndex(4));
    expect(seen.size).toBe(4);
  });

  it("rejects a non-positive or non-integer pool size", () => {
    expect(() => secureNextIndex(0)).toThrow(RangeError);
    expect(() => secureNextIndex(-1)).toThrow(RangeError);
    expect(() => secureNextIndex(2.5)).toThrow(RangeError);
  });
});
