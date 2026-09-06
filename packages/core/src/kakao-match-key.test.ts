import { describe, expect, it } from "vitest";
import { kakaoMatchKey, normalizeForMatch } from "./kakao-match-key";

describe("normalizeForMatch", () => {
  it("folds case, whitespace and decoration away", () => {
    expect(normalizeForMatch("늑 구#KR1")).toBe("늑구kr1");
    expect(normalizeForMatch("늑구#kr1")).toBe("늑구kr1");
  });

  it("leaves a plain nickname alone apart from case", () => {
    expect(normalizeForMatch("올빼미")).toBe("올빼미");
  });
});

describe("kakaoMatchKey", () => {
  // 같은 사람이 실제로 쓴 다섯 가지 표기. 하나로 모여야 한다.
  it("gives one key to every spelling of the same person", () => {
    const spellings = [
      "박병준/94/늑 구#kr1 (5시)",
      "박병준/94/늑 구#KR1",
      "박병준/94/늑구#KR1",
      "박병준/94/늑 구#KR1 밥먹고옴",
      "박병준/94/완전다른롤닉#KR2",
    ];

    expect(new Set(spellings.map(kakaoMatchKey))).toEqual(new Set(["박병준/94"]));
  });

  it("keeps the key when an extra segment is appended", () => {
    expect(kakaoMatchKey("박병준/94/늑구#KR1/정글")).toBe("박병준/94");
  });

  it("ignores spacing inside the real name", () => {
    expect(kakaoMatchKey("박 병준/94/늑구#KR1")).toBe(kakaoMatchKey("박병준/94/늑구#KR1"));
  });

  it("separates two people who share a birth year", () => {
    expect(kakaoMatchKey("박병준/94/늑구#KR1")).not.toBe(kakaoMatchKey("유성진/94/주유#KR1"));
  });

  it("separates one name across two birth years", () => {
    expect(kakaoMatchKey("박병준/94/늑구#KR1")).not.toBe(kakaoMatchKey("박병준/95/늑구#KR1"));
  });

  // 실제 명단에 있는 표기. 첫 슬래시가 공백이라 관례 검사를 통과하지 못했고, 그대로
  // 두면 이 사람만 롤 닉을 바꿀 때 새 회원이 된다.
  it("accepts a missing first slash between the name and the year", () => {
    expect(kakaoMatchKey("선동엽 95/glenone#5022")).toBe("선동엽/95");
    expect(kakaoMatchKey("선동엽 95/새로운롤닉#1")).toBe("선동엽/95");
    expect(kakaoMatchKey("선동엽 95/glenone#5022 (5시)")).toBe("선동엽/95");
  });

  it("reads the same person whether the separator is a slash or a space", () => {
    expect(kakaoMatchKey("선동엽 95/glenone#5022")).toBe(kakaoMatchKey("선동엽/95/glenone#5022"));
  });

  it("takes a four digit birth year too", () => {
    expect(kakaoMatchKey("선동엽 1995/glenone#5022")).toBe("선동엽/1995");
  });

  // 슬래시가 아예 없으면 이름 칸이라고 볼 근거가 없다. 쪼개면 "올빼미"와 "올빼미 2"가
  // 다른 사람이 되는 대신 엉뚱한 키가 생긴다.
  it("does not split a slashless nickname that happens to end in digits", () => {
    expect(kakaoMatchKey("올빼미 2")).toBe("올빼미2");
  });

  // 게임닉 뒤 숫자를 연도로 읽으면 안 된다.
  it("does not read a long trailing number as a birth year", () => {
    expect(kakaoMatchKey("늑구 5022/glenone#1")).toBe("늑구5022/glenone1");
  });

  // 관례를 안 지킨 닉네임은 쪼갤 조각이 없으므로 전체를 정규화해 쓴다.
  it("falls back to the whole string when the convention is not followed", () => {
    expect(kakaoMatchKey("올빼미")).toBe("올빼미");
    expect(kakaoMatchKey("올빼미 (7시)")).toBe("올빼미");
    expect(kakaoMatchKey("Dokkaebi#210")).toBe(kakaoMatchKey("dokkaebi #210"));
  });

  // 나이 자리가 숫자가 아니면 관례가 아니다 — 통째로 폴백한다. 폴백은 슬래시를 남기므로
  // 조각 수가 달라진 닉네임끼리 섞이지 않는다.
  it("falls back when the second segment is not a year", () => {
    expect(kakaoMatchKey("박병준/정글/늑구")).toBe("박병준/정글/늑구");
  });

  // 관례를 지킨 닉네임에서 뒤를 떼어 적은 것과 같은 키가 나온다 — 같은 사람이니 맞다.
  it("matches a shortened 실명/연도 nickname to the full one", () => {
    expect(kakaoMatchKey("박병준/94")).toBe(kakaoMatchKey("박병준/94/늑구#KR1"));
  });

  it("returns an empty key for an empty nickname", () => {
    expect(kakaoMatchKey("")).toBe("");
    expect(kakaoMatchKey("(8시 도착)")).toBe("");
  });
});
