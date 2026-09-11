import { describe, expect, it } from "vitest";
import { discordRiotHint, kakaoRiotHint } from "./riot-hint";

describe("kakaoRiotHint", () => {
  it("takes the third segment of 실명/출생연도/게임닉#태그", () => {
    expect(kakaoRiotHint("김민준/01/정민이#KR12")).toBe("정민이#KR12");
  });

  it("drops a trailing parenthesised memo before taking the segment", () => {
    expect(kakaoRiotHint("박병준/94/늑구#KR1 (5시)")).toBe("늑구#KR1");
  });

  it("reads the spaced variant 실명 출생연도/게임닉#태그", () => {
    expect(kakaoRiotHint("선동엽 95/glenone#5022")).toBe("glenone#5022");
  });

  it("keeps extra segments out of the hint", () => {
    expect(kakaoRiotHint("배성민/97/성민탑#KR1/정글")).toBe("성민탑#KR1");
  });

  it("returns null when the second segment is not a year", () => {
    // 관례를 안 지킨 닉네임이다. 억지로 뽑으면 실명이나 포지션 글자가 게임닉과 대조되어
    // 엉뚱한 점수가 붙는다.
    expect(kakaoRiotHint("올빼미/정글/탑")).toBeNull();
  });

  it("returns null when there is nothing to split", () => {
    expect(kakaoRiotHint("올빼미")).toBeNull();
  });
});

describe("discordRiotHint", () => {
  it("takes the second segment as the riot id", () => {
    expect(discordRiotHint("김우성/우성정글#KR1/정글").riotId).toBe("우성정글#KR1");
  });

  it("maps the korean position words onto replay positions", () => {
    expect(discordRiotHint("김우성/우성정글#KR1/정글").positions).toEqual(["JUNGLE"]);
    expect(discordRiotHint("박병준/늑구#KR1/탑,미드").positions).toEqual(["TOP", "MIDDLE"]);
    expect(discordRiotHint("이수민/수민#KR1/원딜 서폿").positions).toEqual(["BOTTOM", "UTILITY"]);
  });

  it("treats 올포지션 as every position", () => {
    expect(discordRiotHint("김민준/민준#KR1/올").positions).toEqual([
      "TOP",
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
    ]);
  });

  it("returns no hint when the display name has no segments", () => {
    expect(discordRiotHint("dohyun_kr")).toEqual({ riotId: null, positions: [] });
  });

  it("ignores a position segment it does not recognise", () => {
    expect(discordRiotHint("김민준/민준#KR1/아무거나").positions).toEqual([]);
  });
});
