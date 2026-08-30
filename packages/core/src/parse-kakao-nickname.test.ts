import { describe, expect, it } from "vitest";
import { parseKakaoNickname } from "./parse-kakao-nickname";

describe("parseKakaoNickname", () => {
  it("parses realName/age/nicknameTag", () => {
    expect(parseKakaoNickname("이서준/96/뚜비뚜밥#뚜비얌")).toEqual({
      realName: "이서준",
      age: 96,
      nicknameTag: "뚜비뚜밥#뚜비얌",
    });
  });

  it("keeps an internal space in the nicknameTag segment", () => {
    expect(parseKakaoNickname("김민준/94/늑 대#1003")).toEqual({
      realName: "김민준",
      age: 94,
      nicknameTag: "늑 대#1003",
    });
  });

  it("returns null when there aren't exactly two slashes", () => {
    expect(parseKakaoNickname("올빼미")).toBeNull();
    expect(parseKakaoNickname("이서준/96")).toBeNull();
    expect(parseKakaoNickname("이서준/96/뚜비뚜밥/추가슬래시")).toBeNull();
  });

  it("returns null when the age segment isn't numeric", () => {
    expect(parseKakaoNickname("이서준/나이모름/뚜비뚜밥#뚜비얌")).toBeNull();
  });

  it("returns null when realName or nicknameTag is empty", () => {
    expect(parseKakaoNickname("/96/뚜비뚜밥#뚜비얌")).toBeNull();
    expect(parseKakaoNickname("이서준/96/")).toBeNull();
  });
});
