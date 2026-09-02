import { describe, expect, it } from "vitest";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "./normalize-kakao-nickname";

describe("normalizeKakaoNickname", () => {
  it("leaves a nickname without parentheses untouched", () => {
    expect(normalizeKakaoNickname("김민준/94/늑 대#1003")).toBe("김민준/94/늑 대#1003");
  });

  it("drops a parenthesised note and the space before it", () => {
    expect(normalizeKakaoNickname("유승수/98/ModCow#KR98(7시30분 도착)")).toBe("유승수/98/ModCow#KR98");
  });

  it("drops an unclosed parenthesised note", () => {
    expect(normalizeKakaoNickname("손민준/99/fukcin216 (8시 30분")).toBe("손민준/99/fukcin216");
  });

  it("drops a full-width parenthesised note", () => {
    expect(normalizeKakaoNickname("박지현/95/사육사#1003（늦음）")).toBe("박지현/95/사육사#1003");
  });

  it("keeps spaces inside the nickname itself", () => {
    expect(normalizeKakaoNickname("  김민준/94/늑 대#1003  ")).toBe("김민준/94/늑 대#1003");
  });

  it("returns an empty string when the whole value is a note", () => {
    expect(normalizeKakaoNickname("(8시 도착)")).toBe("");
  });
});

describe("realNameFromKakaoNickname", () => {
  it("takes the segment before the first slash", () => {
    expect(realNameFromKakaoNickname("김민준/94/늑 대#1003")).toBe("김민준");
  });

  it("takes the whole value when there is no slash", () => {
    expect(realNameFromKakaoNickname("모임장")).toBe("모임장");
  });

  it("trims the segment", () => {
    expect(realNameFromKakaoNickname(" 김민준 /94/늑 대#1003")).toBe("김민준");
  });

  it("returns null when the first segment is empty", () => {
    expect(realNameFromKakaoNickname("/94/늑 대#1003")).toBeNull();
    expect(realNameFromKakaoNickname("")).toBeNull();
  });
});
