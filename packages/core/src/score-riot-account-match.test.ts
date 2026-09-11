import { describe, expect, it } from "vitest";
import { isAutoAssignable, scoreRiotAccountMatch, type RiotMatchMember } from "./score-riot-account-match";

function member(overrides: Partial<RiotMatchMember> = {}): RiotMatchMember {
  return { realName: null, kakaoNickname: null, discordDisplayName: null, riotId: null, ...overrides };
}

describe("scoreRiotAccountMatch", () => {
  it("gives 100 when the kakao hint is exactly the riot id", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "챌린저가고싶나", tagLine: "JBD", position: "BOTTOM" },
      member({ realName: "이도현", kakaoNickname: "이도현/98/챌린저가고싶나#JBD", discordDisplayName: "이도현" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["카톡ID일치"] });
  });

  it("gives 100 when only spacing and case differ", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "Pink Taric Boy", tagLine: "KR2", position: "JUNGLE" },
      member({ realName: "김태릭", kakaoNickname: "김태릭/99/PinkTaricBoy", discordDisplayName: "김태릭" }),
    );

    expect(result.score).toBe(100);
  });

  it("separates two 동명이인 by their riot id", () => {
    const player = { gameName: "정민이", tagLine: "KR12", position: "UTILITY" };
    const younger = member({ realName: "김민준", kakaoNickname: "김민준/01/정민이#KR12", discordDisplayName: "김민준" });
    const older = member({ realName: "김민준", kakaoNickname: "김민준/95/민준탑#KR1", discordDisplayName: "김민준" });

    expect(scoreRiotAccountMatch(player, younger).score).toBe(100);
    expect(scoreRiotAccountMatch(player, older).score).toBe(0);
  });

  it("falls back to the real name fragment and the position when the in-game name changed", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "우성정글", tagLine: "KR1", position: "JUNGLE" },
      member({
        realName: "김우성",
        kakaoNickname: "김우성/96/정글의왕#KR1",
        discordDisplayName: "김우성/정글의왕#KR1/정글",
      }),
    );

    // 45(실명조각) + 25(포지션일치). 자동 배정 문턱 아래라 관리자가 확인해야 한다.
    expect(result).toEqual({ score: 70, reasons: ["실명조각", "포지션일치"] });
  });

  it("scores a brand new smurf at zero even when the position lines up", () => {
    // 포지션은 가산점 전용이다. 다른 신호가 0이면 후보로 만들지 않는다 — 그러지 않으면
    // UTILITY 슬롯 하나에 서폿 회원이 전부 같은 점수로 딸려 나온다.
    const result = scoreRiotAccountMatch(
      { gameName: "ZAMSU", tagLine: "KR1", position: "TOP" },
      member({ realName: "배성민", kakaoNickname: "배성민/97/성민탑#KR1", discordDisplayName: "배성민/성민탑#KR1/탑" }),
    );

    expect(result).toEqual({ score: 0, reasons: [] });
  });

  it("scores an outsider at zero", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "모든 것을 잃은 사나이", tagLine: "융탄폭격", position: "UTILITY" },
      member({ realName: "박병준", kakaoNickname: "박병준/94/늑구#KR1", discordDisplayName: "박병준/늑구#KR1/서폿" }),
    );

    expect(result).toEqual({ score: 0, reasons: [] });
  });

  it("counts only the strongest hint, never the sum of three", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "먀미뮤드래곤", tagLine: "7777", position: "MIDDLE" },
      member({ realName: "정수현", kakaoNickname: "정수현/00/먀미뮤드래곤#7777", riotId: "먀미뮤드래곤#7777" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["카톡ID일치"] });
  });

  it("gives 60 when a memo is glued onto the riot id", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "늑구", tagLine: "KR1", position: "TOP" },
      member({ realName: "박병준", kakaoNickname: "박병준/94/늑구#KR1 밥먹고옴" }),
    );

    expect(result).toEqual({ score: 60, reasons: ["카톡ID유사"] });
  });

  it("reads the hint off the registered riot id when there is no kakao nickname", () => {
    const result = scoreRiotAccountMatch(
      { gameName: "도여어어닝", tagLine: "KR1", position: "JUNGLE" },
      member({ realName: "김도영", riotId: "도여어어닝#KR1" }),
    );

    expect(result).toEqual({ score: 100, reasons: ["등록ID일치"] });
  });
});

describe("isAutoAssignable", () => {
  it("needs both an exact-hint score and a clear gap", () => {
    expect(isAutoAssignable(100, 0)).toBe(true);
    expect(isAutoAssignable(125, 85)).toBe(true);
  });

  it("refuses a close second", () => {
    expect(isAutoAssignable(100, 70)).toBe(false);
  });

  it("refuses anything below the exact-hint tier", () => {
    expect(isAutoAssignable(95, 0)).toBe(false);
  });
});
