import { describe, expect, it } from "vitest";
import { parseRiotId } from "./parse-riot-id";

describe("parseRiotId", () => {
  it("splits game name and tag line on #", () => {
    expect(parseRiotId("늑 구#kr1")).toEqual({ gameName: "늑 구", tagLine: "kr1" });
  });

  it("trims whitespace around both parts", () => {
    expect(parseRiotId("  깔끔좌 # KR1 ")).toEqual({ gameName: "깔끔좌", tagLine: "KR1" });
  });

  it("splits on the last # so a # inside the name survives", () => {
    expect(parseRiotId("a#b#c")).toEqual({ gameName: "a#b", tagLine: "c" });
  });

  it("returns null without a #", () => {
    expect(parseRiotId("깔끔좌")).toBeNull();
  });

  it("returns null when either side is empty", () => {
    expect(parseRiotId("#kr1")).toBeNull();
    expect(parseRiotId("깔끔좌#")).toBeNull();
    expect(parseRiotId("#")).toBeNull();
    expect(parseRiotId("")).toBeNull();
  });
});
