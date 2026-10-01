import { describe, expect, it } from "vitest";
import { loginPathFor, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a path on this site, query included", () => {
    expect(safeNextPath("/member-admin")).toBe("/member-admin");
    expect(safeNextPath("/player-stats?period=all")).toBe("/player-stats?period=all");
  });

  it("falls back to home for anything that could leave the site or loop", () => {
    for (const value of [null, "", "member-admin", "//evil.com", "/\\evil.com", "https://evil.com", "/login", "/login?next=/x"]) {
      expect(safeNextPath(value)).toBe("/");
    }
  });
});

describe("loginPathFor", () => {
  it("carries the page to come back to", () => {
    expect(loginPathFor("/events/abc/edit")).toBe("/login?next=%2Fevents%2Fabc%2Fedit");
  });
});
