import { describe, expect, it } from "vitest";
import { birthYearLabel, fullBirthYear, parseBirthYearInput } from "./birth-year";

describe("fullBirthYear", () => {
  it("reads two digits below 30 as the 2000s", () => {
    expect(fullBirthYear(1)).toBe(2001);
    expect(fullBirthYear(29)).toBe(2029);
  });

  it("reads two digits from 30 as the 1900s", () => {
    expect(fullBirthYear(30)).toBe(1930);
    expect(fullBirthYear(94)).toBe(1994);
  });

  it("keeps a four-digit year", () => {
    expect(fullBirthYear(1994)).toBe(1994);
  });

  it("rejects three digits", () => {
    expect(fullBirthYear(123)).toBeNull();
  });
});

describe("parseBirthYearInput", () => {
  it("stores two digits as typed", () => {
    expect(parseBirthYearInput("94")).toEqual({ ok: true, age: 94 });
    expect(parseBirthYearInput("01")).toEqual({ ok: true, age: 1 });
  });

  it("shortens a four-digit year to two digits", () => {
    expect(parseBirthYearInput("1994")).toEqual({ ok: true, age: 94 });
    expect(parseBirthYearInput(" 2001 ")).toEqual({ ok: true, age: 1 });
  });

  it("clears on empty input", () => {
    expect(parseBirthYearInput("")).toEqual({ ok: true, age: null });
    expect(parseBirthYearInput("   ")).toEqual({ ok: true, age: null });
  });

  it("rejects anything else", () => {
    for (const raw of ["abc", "123", "9", "19x4", "1850"]) {
      expect(parseBirthYearInput(raw)).toEqual({
        ok: false,
        error: "출생연도를 두 자리(예: 94) 또는 네 자리로 입력해 주세요.",
      });
    }
  });
});

describe("birthYearLabel", () => {
  it("shows two digits the way the nickname writes them", () => {
    expect(birthYearLabel(1994)).toBe("94");
    expect(birthYearLabel(2001)).toBe("01");
    expect(birthYearLabel(null)).toBe("-");
  });
});
