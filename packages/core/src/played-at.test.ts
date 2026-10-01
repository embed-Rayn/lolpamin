import { describe, expect, it } from "vitest";
import { formatPlayedAt, parseSeoulDateTimeInput, seoulYearRange, toSeoulDateTimeInput } from "./played-at";

describe("formatPlayedAt", () => {
  it("shows month, day and time in Seoul time", () => {
    expect(formatPlayedAt(new Date("2026-09-28T13:25:34Z"))).toBe("09-28 22:25");
    expect(formatPlayedAt(new Date("2026-09-28T15:45:00Z"))).toBe("09-29 00:45");
  });

  it("shows only the date for a game saved as a bare date (UTC midnight)", () => {
    // Before times were kept, a date-only input landed at 00:00Z and read as a fake 09:00.
    expect(formatPlayedAt(new Date("2026-09-28T00:00:00.000Z"))).toBe("09-28");
  });
});

describe("toSeoulDateTimeInput", () => {
  it("formats an instant for <input type=datetime-local> in Seoul time", () => {
    expect(toSeoulDateTimeInput(new Date("2026-09-28T15:45:59Z"))).toBe("2026-09-29T00:45");
  });
});

describe("parseSeoulDateTimeInput", () => {
  it("reads the input as Seoul time whatever the server's zone", () => {
    expect(parseSeoulDateTimeInput("2026-09-29T00:45")?.toISOString()).toBe("2026-09-28T15:45:00.000Z");
  });

  it("rejects anything else, a bare date included", () => {
    expect(parseSeoulDateTimeInput("2026-09-29")).toBeNull();
    expect(parseSeoulDateTimeInput("nope")).toBeNull();
    expect(parseSeoulDateTimeInput("2026-13-40T25:99")).toBeNull();
  });
});

describe("seoulYearRange", () => {
  it("spans the Seoul calendar year containing now", () => {
    const range = seoulYearRange(new Date("2026-10-01T03:00:00Z"));
    expect(range.year).toBe(2026);
    expect(range.start.toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("is already next year in Seoul on UTC's New Year's Eve evening", () => {
    expect(seoulYearRange(new Date("2026-12-31T15:30:00Z")).year).toBe(2027);
  });
});
