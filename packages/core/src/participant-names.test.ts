import { describe, expect, it } from "vitest";
import { matchParticipantNames, parseParticipantNames } from "./participant-names";

const RECRUIT_POST = `1. @최경준/98/뀨 잇#KR01
2. @김복건/96/뚜비뚜밥#뚜비얌
3. @조영빈 /95 / jogu
4. @유기훈/92/람스터#람스터
5. @이진형/95/민지콩#1218
6. @손민지/95/리진쿵야#1218
7. @정승연/96/King Gnu#1088 (10시까지만...)
8. @손민준/99/fukcin216
9. @유승수/98/MadCow#98
10. @이동용/99/메가 써니#kr2 `;

describe("parseParticipantNames", () => {
  it("takes the name before the first slash of every mention", () => {
    expect(parseParticipantNames(RECRUIT_POST)).toEqual([
      "최경준",
      "김복건",
      "조영빈",
      "유기훈",
      "이진형",
      "손민지",
      "정승연",
      "손민준",
      "유승수",
      "이동용",
    ]);
  });

  it("accepts plain names, one per line or comma separated, without duplicates", () => {
    expect(parseParticipantNames("김복건\n  유기훈 , 이진형\n\n김복건")).toEqual(["김복건", "유기훈", "이진형"]);
  });

  it("uses the part before the slash when there is no @", () => {
    expect(parseParticipantNames("- 손민지/95/리진쿵야#1218")).toEqual(["손민지"]);
  });

  it("drops a trailing memo in parentheses on a plain name", () => {
    expect(parseParticipantNames("3) 조영빈 (늦참)")).toEqual(["조영빈"]);
  });

  it("returns nothing for blank input", () => {
    expect(parseParticipantNames("  \n ")).toEqual([]);
  });
});

describe("matchParticipantNames", () => {
  const members = [
    { id: "a", names: ["최경준"] },
    { id: "b", names: ["김 복건"] },
    { id: "c", names: ["손민지"] },
    { id: "d", names: ["손민지"] },
  ];

  it("matches ignoring spaces and case, and lists what it could not find", () => {
    const result = matchParticipantNames(["최경준", "김복건", "없는사람"], members);
    expect(result.matchedIds).toEqual(["a", "b"]);
    expect(result.unmatched).toEqual(["없는사람"]);
    expect(result.ambiguous).toEqual([]);
  });

  it("reads member names the same way — a role in parentheses or a whole nickname still matches", () => {
    const result = matchParticipantNames(["김복건", "최경준", "유기훈"], [
      { id: "x", names: ["김복건(운영진)"] },
      { id: "y", names: ["최경준 (모임장)"] },
      { id: "z", names: ["유기훈/92/람스터#람스터"] },
    ]);
    expect(result.matchedIds).toEqual(["x", "y", "z"]);
    expect(result.unmatched).toEqual([]);
  });

  it("selects every member sharing a name and reports it as ambiguous", () => {
    const result = matchParticipantNames(["손민지"], members);
    expect(result.matchedIds).toEqual(["c", "d"]);
    expect(result.ambiguous).toEqual(["손민지"]);
  });
});
