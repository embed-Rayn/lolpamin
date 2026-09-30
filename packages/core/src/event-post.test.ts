import { describe, expect, it } from "vitest";
import { canViewEventImage, formatEventDate, pickEventThumbnailId } from "./event-post";

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
    expect(canViewEventImage({ kind: "HIDDEN", revealedAt }, false)).toBe(true);
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
