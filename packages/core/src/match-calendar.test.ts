import { describe, expect, it } from "vitest";
import {
  buildMonthCalendar,
  calendarHeatLevel,
  CALENDAR_DOT_LIMIT,
  parseDateKey,
  parseMonthKey,
  seoulDateKey,
  seoulDayRange,
  seoulMonthRange,
  shiftMonth,
} from "./match-calendar";

describe("seoulDateKey", () => {
  it("reads the instant in Seoul time", () => {
    // 2026-10-03 23:30 Seoul
    expect(seoulDateKey(new Date("2026-10-03T14:30:00Z"))).toBe("2026-10-03");
    // 2026-10-04 00:30 Seoul — a UTC-date reading would say the 3rd
    expect(seoulDateKey(new Date("2026-10-03T15:30:00Z"))).toBe("2026-10-04");
  });

  it("keeps a bare-date import (UTC midnight) on its own date", () => {
    expect(seoulDateKey(new Date("2026-10-04T00:00:00Z"))).toBe("2026-10-04");
  });
});

describe("parseDateKey", () => {
  it("accepts a real calendar day only", () => {
    expect(parseDateKey("2026-10-04")).toBe("2026-10-04");
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-10-4")).toBeNull();
    expect(parseDateKey(undefined)).toBeNull();
  });
});

describe("seoulDayRange", () => {
  it("is the half-open Seoul day", () => {
    const { start, end } = seoulDayRange("2026-10-04");
    expect(start.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-04T15:00:00.000Z");
  });
});

describe("parseMonthKey", () => {
  const now = new Date("2026-10-21T03:00:00Z");

  it("defaults to the current Seoul month", () => {
    expect(parseMonthKey(undefined, now)).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey("garbage", now)).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey("2026-13", now)).toEqual({ year: 2026, month: 10 });
  });

  it("takes a past month and refuses a future one", () => {
    expect(parseMonthKey("2026-03", now)).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey("2026-11", now)).toEqual({ year: 2026, month: 10 });
  });

  it("uses the Seoul month at a UTC month boundary", () => {
    expect(parseMonthKey(undefined, new Date("2026-10-31T16:00:00Z"))).toEqual({ year: 2026, month: 11 });
  });
});

describe("seoulMonthRange / shiftMonth", () => {
  it("spans the Seoul month", () => {
    const { start, end } = seoulMonthRange({ year: 2026, month: 12 });
    expect(start.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("rolls over the year", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("calendarHeatLevel", () => {
  it("steps by absolute game count, not relative to the month", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(calendarHeatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("buildMonthCalendar", () => {
  const games = [
    { playedAt: new Date("2026-10-04T11:00:00Z"), mode: "RIFT" as const },
    { playedAt: new Date("2026-10-04T12:00:00Z"), mode: "RIFT" as const },
    { playedAt: new Date("2026-10-04T13:00:00Z"), mode: "ARAM" as const },
    // 00:10 on the 4th in Seoul, still the 3rd in UTC
    { playedAt: new Date("2026-10-03T15:10:00Z"), mode: "ARAM" as const },
    { playedAt: new Date("2026-10-10T00:00:00Z"), mode: "RIFT" as const },
  ];

  const cal = buildMonthCalendar({ year: 2026, month: 10 }, games, "2026-10-21");

  it("lays the month out in Sunday-first weeks", () => {
    // 2026-10-01 is a Thursday: four blanks first, and every week has seven cells.
    expect(cal.weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(cal.weeks[0][4]?.day).toBe(1);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    expect(cal.weeks.flat().filter((c) => c !== null)).toHaveLength(31);
  });

  it("counts each Seoul day's games per mode", () => {
    const day4 = cal.weeks.flat().find((c) => c?.day === 4)!;
    expect(day4).toMatchObject({ key: "2026-10-04", rift: 2, aram: 2, total: 4, heat: 2 });
    const day10 = cal.weeks.flat().find((c) => c?.day === 10)!;
    expect(day10).toMatchObject({ rift: 1, aram: 0, total: 1, heat: 1 });
  });

  it("marks today and sums the month", () => {
    expect(cal.weeks.flat().find((c) => c?.isToday)?.day).toBe(21);
    expect(cal.summary).toEqual({ total: 5, rift: 3, aram: 2, activeDays: 2 });
  });

  it("ignores games outside the month", () => {
    const other = buildMonthCalendar({ year: 2026, month: 9 }, games, "2026-10-21");
    expect(other.summary.total).toBe(0);
  });

  it("caps dots at the limit", () => {
    expect(CALENDAR_DOT_LIMIT).toBe(8);
  });
});
