import { describe, expect, it } from "vitest";
import { isSoleCandidate, scoreAccountMatch } from "./score-account-match";

// 2026-09-01 실데이터(디스코드 25명 × 카톡 16명)에서 관측된 짝. 왼쪽이 카톡
// kakaoNickname, 가운데가 디스코드 표시 이름(서버 별명 우선), 오른쪽이 기대 점수.
const REAL_PAIRS: Array<[string, string, number]> = [
  ["국동명/99/kooki#kr99", "동명", 60],
  ["김나연/04/주디#주토피아", "김나연/주디#주토피아/미드정글", 180],
  ["김복건/96/뚜비뚜밥#뚜비얌", "김복건/96/뚜비뚜밥#뚜비얌", 180],
  ["김하제/96/모티애비#7805", "김하제/모티애비#7805/정글 탑", 180],
  ["박병준/94/늑 구#1003", "박병준/늑 구#1003/정글탑", 180],
  ["손민준/99/fukcin216", "손민준/fukcin216#7980/정글제외 무관", 180],
  ["송고은/95/고라니기운kr1", "송고은/95/고라니기운kr1", 180],
  ["시형/95/즐겜유저니로바#KR1", "박시형/95/즐겜유저니로바#KR1", 140],
  ["심현석/98/나는야칭찬무새kr1", "심현석/나는야칭찬무새#kr1", 180],
  ["유기훈/92/람스터#람스터", "유기훈/92/람스터#람스터/미드탑", 180],
  ["유대혁/95/유대혁#KR1", "유대혁/95/유대혁#KR1/sup", 180],
  ["유승수/98/MadCow#KR98", "유승수/MadCow/KR98", 180],
  ["윤소영/95/사육사#1003", "윤소영/사육사#1003/원딜미드서폿", 180],
  ["윤찬/85/드랍더비추kr3", "허윤찬/드랍더비추 #KR3/서폿", 140],
  ["이민우/99/네이내#KR1", "이민우/네이내#KR1/ALL", 180],
  ["최경준/98/뀨 잇#KR01", "최경준/뀨 잇/AD,SUP", 100],
];

describe("scoreAccountMatch", () => {
  it.each(REAL_PAIRS)("scores the observed pair %s / %s", (kakao, discord, expected) => {
    expect(scoreAccountMatch(kakao, discord).score).toBe(expected);
  });

  it("reports which signals fired", () => {
    expect(scoreAccountMatch("유대혁/95/유대혁#KR1", "유대혁/95/유대혁#KR1/sup").reasons).toEqual([
      "실명일치",
      "게임닉일치",
    ]);
    expect(scoreAccountMatch("국동명/99/kooki#kr99", "동명").reasons).toEqual(["실명접미사"]);
  });

  it("does not match a different person with a similar-looking name", () => {
    expect(scoreAccountMatch("윤소영/95/사육사#1003", "윤소영(지인)").score).toBe(0);
  });

  it("does not match two unrelated members", () => {
    expect(scoreAccountMatch("김하제/96/모티애비#7805", "김나연/주디#주토피아/미드정글").score).toBe(0);
  });

  it("scores nothing when either side is empty", () => {
    expect(scoreAccountMatch("", "김나연/주디#주토피아").score).toBe(0);
    expect(scoreAccountMatch("김나연/04/주디#주토피아", "").score).toBe(0);
  });

  it("ignores a segment shorter than three characters as a game-nickname signal", () => {
    // "뀨 잇" -> "뀨잇"(2자)은 신호로 쓰기에 너무 짧아 오탐이 나기 쉽다.
    expect(scoreAccountMatch("최경준/98/뀨 잇#KR01", "최경준/뀨 잇/AD,SUP").reasons).toEqual(["실명일치"]);
  });

  it("ignores the age segment", () => {
    // 나이가 같다는 이유로 점수가 붙으면 안 된다.
    expect(scoreAccountMatch("가나다/95/aaa", "라마바/95/bbb").score).toBe(0);
  });
});

describe("isSoleCandidate", () => {
  it("accepts a top score at or above the threshold", () => {
    expect(isSoleCandidate(140, 100)).toBe(true);
    expect(isSoleCandidate(180, 180)).toBe(true);
  });

  it("accepts a clear gap even below the threshold", () => {
    expect(isSoleCandidate(100, 0)).toBe(true);
    expect(isSoleCandidate(60, 0)).toBe(true);
  });

  it("rejects a close race below the threshold", () => {
    expect(isSoleCandidate(100, 60)).toBe(false);
    expect(isSoleCandidate(60, 60)).toBe(false);
  });
});
