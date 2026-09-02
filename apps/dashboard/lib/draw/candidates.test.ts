import { describe, expect, it } from "vitest";
import {
  MAX_NUMBER_CANDIDATES,
  nextManualId,
  normalizeManualName,
  toMemberCandidates,
  toNumberCandidates,
  validateNumberRange,
} from "./candidates";

const members = [
  { id: "m1", name: "박병준", discordHandle: "byungjun", mmr: 1100, wins: 3, losses: 1 },
  { id: "m2", name: "김철수", discordHandle: "chulsoo", mmr: 1000, wins: 1, losses: 1 },
  { id: "m3", name: "이영희", discordHandle: null, mmr: 980, wins: 0, losses: 2 },
];

describe("toMemberCandidates", () => {
  it("keeps only selected members, in list order", () => {
    const result = toMemberCandidates(members, new Set(["m3", "m1"]));
    expect(result).toEqual([
      { id: "m1", label: "박병준" },
      { id: "m3", label: "이영희" },
    ]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(toMemberCandidates(members, new Set())).toEqual([]);
  });
});

describe("toNumberCandidates", () => {
  it("builds one candidate per number in the inclusive range", () => {
    expect(toNumberCandidates(3, 5)).toEqual([
      { id: "n-3", label: "3" },
      { id: "n-4", label: "4" },
      { id: "n-5", label: "5" },
    ]);
  });

  it("handles a single-number range", () => {
    expect(toNumberCandidates(7, 7)).toEqual([{ id: "n-7", label: "7" }]);
  });

  it("returns an empty list for an invalid range instead of throwing", () => {
    expect(toNumberCandidates(9, 2)).toEqual([]);
  });
});

describe("validateNumberRange", () => {
  it("accepts a normal range", () => {
    expect(validateNumberRange(1, 45)).toBeNull();
  });

  it("rejects a reversed range", () => {
    expect(validateNumberRange(10, 3)).toBe("시작 숫자가 끝 숫자보다 큽니다.");
  });

  it("rejects non-integers", () => {
    expect(validateNumberRange(1.5, 10)).toBe("정수만 입력할 수 있습니다.");
  });

  it("rejects a range wider than the cap", () => {
    expect(validateNumberRange(1, MAX_NUMBER_CANDIDATES + 1)).toBe(
      `숫자는 최대 ${MAX_NUMBER_CANDIDATES}개까지 뽑을 수 있습니다.`
    );
  });

  it("accepts a range exactly at the cap", () => {
    expect(validateNumberRange(1, MAX_NUMBER_CANDIDATES)).toBeNull();
  });
});

describe("normalizeManualName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeManualName("  박  병준 ")).toBe("박 병준");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeManualName("   ")).toBe("");
  });
});

describe("nextManualId", () => {
  it("starts at 1 when there is no manual candidate yet", () => {
    expect(nextManualId([{ id: "m1", label: "박병준" }])).toBe("manual-1");
  });

  it("does not collide with existing manual ids", () => {
    expect(nextManualId([{ id: "manual-1", label: "손님" }, { id: "manual-4", label: "손님2" }])).toBe(
      "manual-5"
    );
  });
});
