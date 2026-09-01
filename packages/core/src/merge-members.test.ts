import { describe, expect, it } from "vitest";
import { mergeMembers } from "./merge-members";

describe("mergeMembers", () => {
  it("keeps the primary side's platform id and takes the secondary's missing platform id", () => {
    const primary = {
      id: "discord-half",
      realName: "최민재",
      riotId: null,
      discordUserId: "d-1",
      kakaoUserId: null,
      kakaoNickname: null,
      mmr: 1390,
      lastActiveAt: null,
    };
    const secondary = {
      id: "kakao-half",
      realName: null,
      riotId: "재현정글#KR2",
      discordUserId: null,
      kakaoUserId: "k-1",
      kakaoNickname: "재현정글#KR2",
      mmr: 1000,
      lastActiveAt: new Date("2026-08-20T00:00:00Z"),
    };

    const merged = mergeMembers(primary, secondary);

    expect(merged.discordUserId).toBe("d-1");
    expect(merged.kakaoUserId).toBe("k-1");
    expect(merged.realName).toBe("최민재");
    expect(merged.riotId).toBe("재현정글#KR2");
    expect(merged.mmr).toBe(1390);
    expect(merged.lastActiveAt).toEqual(new Date("2026-08-20T00:00:00Z"));
  });

  it("carries the secondary side's kakaoNickname through when the primary has none", () => {
    const primary = {
      id: "discord-half",
      realName: "최민재",
      riotId: null,
      discordUserId: "d-1",
      kakaoUserId: null,
      kakaoNickname: null,
      mmr: 1390,
      lastActiveAt: null,
    };
    const secondary = {
      id: "kakao-nickname-half",
      realName: null,
      riotId: null,
      discordUserId: null,
      kakaoUserId: null,
      kakaoNickname: "박병준/94/늑 구#1003",
      mmr: 1000,
      lastActiveAt: null,
    };

    const merged = mergeMembers(primary, secondary);

    expect(merged.kakaoNickname).toBe("박병준/94/늑 구#1003");
  });

  it("prefers the later lastActiveAt of the two sides", () => {
    const older = new Date("2026-08-01T00:00:00Z");
    const newer = new Date("2026-08-20T00:00:00Z");
    const merged = mergeMembers(
      { id: "a", realName: "a", riotId: null, discordUserId: "d", kakaoUserId: null, kakaoNickname: null, mmr: 1000, lastActiveAt: newer },
      { id: "b", realName: null, riotId: null, discordUserId: null, kakaoUserId: "k", kakaoNickname: null, mmr: 1000, lastActiveAt: older }
    );
    expect(merged.lastActiveAt).toEqual(newer);
  });
});
