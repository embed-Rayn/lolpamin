import { describe, expect, it } from "vitest";
import { parseLastActiveInput } from "./last-active-input";

const now = new Date(2026, 8, 16, 15, 0);

describe("parseLastActiveInput", () => {
  it("reads YYYY-MM-DD as local midnight of that day", () => {
    expect(parseLastActiveInput("2026-09-01", now)).toEqual({ date: new Date(2026, 8, 1), error: null });
  });

  it("accepts today", () => {
    expect(parseLastActiveInput("2026-09-16", now).error).toBeNull();
  });

  it("rejects a day in the future", () => {
    expect(parseLastActiveInput("2026-09-17", now)).toEqual({ date: null, error: "미래 날짜는 넣을 수 없습니다." });
  });

  it("rejects anything that is not a calendar date", () => {
    expect(parseLastActiveInput("", now).error).toBe("날짜 형식이 아닙니다.");
    expect(parseLastActiveInput("2026-13-01", now).error).toBe("날짜 형식이 아닙니다.");
    expect(parseLastActiveInput("2026-02-30", now).error).toBe("날짜 형식이 아닙니다.");
    expect(parseLastActiveInput("20260901", now).error).toBe("날짜 형식이 아닙니다.");
  });
});
