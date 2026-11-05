import { describe, expect, it } from "vitest";
import {
  canViewEventImage,
  eventDaysLeft,
  formatEventDday,
  isEventPromoted,
  formatCountdown,
  formatEventDate,
  formatEventDateTime,
  isEventRevealed,
  pickEventThumbnailId,
} from "./event-post";

describe("canViewEventImage", () => {
  const revealedAt = new Date("2026-09-30T12:00:00Z");

  it("shows a main image to everyone", () => {
    expect(canViewEventImage({ kind: "MAIN", revealedAt: null }, false)).toBe(true);
  });

  it("hides an unrevealed hidden image from a visitor", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: null }, false)).toBe(false);
  });

  it("shows an unrevealed hidden image to an admin", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: null }, true)).toBe(true);
  });

  it("shows a revealed hidden image to everyone", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt }, false, revealedAt)).toBe(true);
  });
});

describe("pickEventThumbnailId", () => {
  const images = [
    { id: "m1", kind: "MAIN" as const, position: 1 },
    { id: "m0", kind: "MAIN" as const, position: 0 },
    { id: "h1", kind: "HIDDEN" as const, position: 1 },
    { id: "h0", kind: "HIDDEN" as const, position: 0 },
  ];

  it("prefers the first hidden image once revealed", () => {
    expect(pickEventThumbnailId(images, true)).toBe("h0");
  });

  it("uses the first main image while unrevealed", () => {
    expect(pickEventThumbnailId(images, false)).toBe("m0");
  });

  it("falls back to main when revealed but no hidden image is left", () => {
    expect(pickEventThumbnailId(images.filter((i) => i.kind === "MAIN"), true)).toBe("m0");
  });

  it("returns null with no usable image", () => {
    expect(pickEventThumbnailId([], true)).toBeNull();
    expect(pickEventThumbnailId([{ id: "h0", kind: "HIDDEN", position: 0 }], false)).toBeNull();
  });
});

describe("formatEventDate", () => {
  it("formats in Korean time, not UTC", () => {
    // 2026-09-30 16:00 UTC is already 10-01 in Seoul.
    expect(formatEventDate(new Date("2026-09-30T16:00:00Z"))).toBe("2026.10.01");
    expect(formatEventDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026.01.05");
  });
});

describe("isEventRevealed", () => {
  const at = new Date("2026-10-03T12:00:00Z");

  it("is hidden with no time and shown from the reveal time on", () => {
    expect(isEventRevealed(null, at)).toBe(false);
    expect(isEventRevealed(at, new Date(at.getTime() - 1))).toBe(false);
    expect(isEventRevealed(at, at)).toBe(true);
  });
});

describe("canViewEventImage with a scheduled reveal", () => {
  const at = new Date("2026-10-03T12:00:00Z");
  const before = new Date(at.getTime() - 1000);

  it("hides a scheduled hidden image from a visitor until its time", () => {
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: at }, false, before)).toBe(false);
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: at }, false, at)).toBe(true);
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt: at }, true, before)).toBe(true);
  });
});

describe("pickEventThumbnailId with a chosen image", () => {
  const images = [
    { id: "m0", kind: "MAIN" as const, position: 0 },
    { id: "m1", kind: "MAIN" as const, position: 1 },
    { id: "h0", kind: "HIDDEN" as const, position: 0 },
  ];

  it("uses the chosen main image", () => {
    expect(pickEventThumbnailId(images, false, "m1")).toBe("m1");
  });

  it("ignores a chosen hidden image until the post is revealed", () => {
    expect(pickEventThumbnailId(images, false, "h0")).toBe("m0");
    expect(pickEventThumbnailId(images, true, "h0")).toBe("h0");
  });

  it("falls back when the chosen id is not among the images", () => {
    expect(pickEventThumbnailId(images, false, "gone")).toBe("m0");
  });
});

describe("formatCountdown", () => {
  it("shows days only when there are any", () => {
    expect(formatCountdown(((2 * 24 + 3) * 3600 + 12 * 60 + 5) * 1000)).toBe("2일 03:12:05");
    expect(formatCountdown((59 * 60 + 9) * 1000 + 999)).toBe("00:59:09");
  });

  it("never goes below zero", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("formatEventDateTime", () => {
  it("formats month, day and time in Korean time", () => {
    expect(formatEventDateTime(new Date("2026-10-03T12:00:00Z"))).toBe("10.03 21:00");
  });
});

describe("eventDaysLeft", () => {
  const eventDate = new Date("2026-11-10T00:00:00Z");

  it("is null without an event date", () => {
    expect(eventDaysLeft(null, new Date("2026-11-05T03:00:00Z"))).toBeNull();
  });

  it("counts calendar days from Seoul today", () => {
    expect(eventDaysLeft(eventDate, new Date("2026-11-05T03:00:00Z"))).toBe(5);
  });

  it("is zero on the day itself, Seoul time", () => {
    // 11-09 15:00 UTC is already 11-10 00:00 in Seoul.
    expect(eventDaysLeft(eventDate, new Date("2026-11-09T15:00:00Z"))).toBe(0);
    expect(eventDaysLeft(eventDate, new Date("2026-11-10T14:59:00Z"))).toBe(0);
  });

  it("goes negative once the day is over", () => {
    expect(eventDaysLeft(eventDate, new Date("2026-11-10T15:00:00Z"))).toBe(-1);
  });
});

describe("isEventPromoted", () => {
  const eventDate = new Date("2026-11-10T00:00:00Z");

  it("promotes through the event day and stops after it", () => {
    expect(isEventPromoted(eventDate, new Date("2026-11-10T14:59:00Z"))).toBe(true);
    expect(isEventPromoted(eventDate, new Date("2026-11-10T15:00:00Z"))).toBe(false);
  });

  it("never promotes a post without a date", () => {
    expect(isEventPromoted(null, new Date())).toBe(false);
  });
});

describe("formatEventDday", () => {
  it("reads D-DAY, D-N or 종료", () => {
    expect(formatEventDday(0)).toBe("D-DAY");
    expect(formatEventDday(3)).toBe("D-3");
    expect(formatEventDday(-1)).toBe("종료");
  });
});
