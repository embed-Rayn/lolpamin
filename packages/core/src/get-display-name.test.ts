import { describe, expect, it } from "vitest";
import { getDisplayName } from "./get-display-name";

describe("getDisplayName", () => {
  it("prefers realName when present", () => {
    expect(
      getDisplayName({ realName: "박병준", discordHandle: "handle", kakaoNickname: "kakao" })
    ).toBe("박병준");
  });

  it("falls back to discordHandle when realName is missing", () => {
    expect(getDisplayName({ realName: null, discordHandle: "handle", kakaoNickname: "kakao" })).toBe(
      "handle"
    );
  });

  it("falls back to kakaoNickname when realName and discordHandle are missing", () => {
    expect(getDisplayName({ realName: null, discordHandle: null, kakaoNickname: "kakao" })).toBe(
      "kakao"
    );
  });

  it("falls back to '이름 미확인' when nothing is set", () => {
    expect(getDisplayName({ realName: null, discordHandle: null, kakaoNickname: null })).toBe(
      "이름 미확인"
    );
  });
});
