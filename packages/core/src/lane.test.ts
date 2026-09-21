import { describe, expect, it } from "vitest";
import { LANE_OPTIONS, isMemberLane, laneLabel } from "./lane";

describe("laneLabel", () => {
  it("labels each lane in Korean", () => {
    expect(laneLabel("TOP")).toBe("탑");
    expect(laneLabel("JUNGLE")).toBe("정글");
    expect(laneLabel("MID")).toBe("미드");
    expect(laneLabel("ADC")).toBe("원딜");
    expect(laneLabel("SUPPORT")).toBe("서폿");
  });

  it("labels a member with no lane as 미지정", () => {
    expect(laneLabel(null)).toBe("미지정");
  });
});

describe("LANE_OPTIONS", () => {
  it("lists the five lanes in in-game order", () => {
    expect(LANE_OPTIONS.map((o) => o.value)).toEqual(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
  });

  it("carries the label the dropdown shows", () => {
    expect(LANE_OPTIONS[3]).toEqual({ value: "ADC", label: "원딜" });
  });
});

// 클라이언트가 보낸 문자열을 enum으로 좁히는 관문이다. 서버 액션이 이걸로 거른다.
describe("isMemberLane", () => {
  it("accepts a lane name", () => {
    expect(isMemberLane("JUNGLE")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMemberLane("정글")).toBe(false);
    expect(isMemberLane("")).toBe(false);
    expect(isMemberLane("toString")).toBe(false);
  });
});
