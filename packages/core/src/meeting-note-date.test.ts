import { describe, expect, it } from "vitest";
import { formatMeetingDate, parseMeetingDateInput, seoulTodayInput, toMeetingDateInput } from "./meeting-note-date";

describe("meeting date", () => {
  it("parses a calendar day to UTC midnight and back", () => {
    const date = parseMeetingDateInput("2026-10-02");
    expect(date?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(toMeetingDateInput(date!)).toBe("2026-10-02");
    expect(formatMeetingDate(date!)).toBe("2026.10.02");
  });

  it("rejects malformed or impossible days", () => {
    expect(parseMeetingDateInput("")).toBeNull();
    expect(parseMeetingDateInput("2026-2-3")).toBeNull();
    expect(parseMeetingDateInput("2026-02-30")).toBeNull();
    expect(parseMeetingDateInput("2026-10-02T00:00")).toBeNull();
  });

  it("gives today's Seoul date even when UTC is still yesterday", () => {
    expect(seoulTodayInput(new Date("2026-10-01T16:30:00Z"))).toBe("2026-10-02");
  });
});
