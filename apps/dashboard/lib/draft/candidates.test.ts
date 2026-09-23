import { describe, expect, it } from "vitest";
import { draftReducer, emptyDraft } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { buildCandidates, guestKey, guestNameError, memberKey, normalizeGuestName, teamAverage } from "./candidates";

const member = (id: string, name: string, mmr: number): DraftPoolMember => ({
  id, name, mmr, wins: 1, losses: 2, mainLane: "TOP", subLane: null,
  riotId: `${name}#KR1`, extraAccounts: 0, masteries: [],
});

const pool = [member("a", "가", 1100), member("b", "나", 1000), member("c", "다", 900)];

describe("buildCandidates", () => {
  it("keeps only participants and sorts by MMR, guests included", () => {
    const rows = buildCandidates(pool, ["c", "a"], [{ name: "손님", mmr: 1050, mainLane: null, subLane: "SUP" }]);
    expect(rows.map((r) => r.key)).toEqual([memberKey("a"), guestKey("손님"), memberKey("c")]);
    expect(rows[1]).toMatchObject({ isGuest: true, wins: null, losses: null, riotId: null, masteries: [], subLane: "SUP" });
  });

  it("drops participant ids the pool no longer has", () => {
    expect(buildCandidates(pool, ["gone", "b"], []).map((r) => r.key)).toEqual([memberKey("b")]);
  });
});

describe("guest names", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeGuestName("  김   손님 ")).toBe("김 손님");
  });

  it("rejects empty, duplicate and member names", () => {
    const guests = [{ name: "손님", mmr: 1000, mainLane: null, subLane: null }];
    expect(guestNameError("", guests, pool)).toBe("이름을 입력해 주세요.");
    expect(guestNameError("손님", guests, pool)).toBe("이미 추가한 이름입니다.");
    expect(guestNameError("가", guests, pool)).toBe("명단에 있는 이름입니다. 위에서 선택해 주세요.");
    expect(guestNameError("새손님", guests, pool)).toBeNull();
  });
});

describe("teamAverage", () => {
  it("averages seated ratings, guests included, rounded; null for an empty team", () => {
    const rows = buildCandidates(pool, ["a"], [{ name: "손님", mmr: 1001, mainLane: null, subLane: null }]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    let state = draftReducer(emptyDraft(), { type: "setCaptain", side: "blue", key: memberKey("a"), prefs: { mainLane: null, subLane: null } });
    state = draftReducer(state, { type: "setCaptain", side: "red", key: guestKey("손님"), prefs: { mainLane: null, subLane: null } });
    expect(teamAverage(state, "blue", byKey)).toBe(1100);
    expect(teamAverage(state, "red", byKey)).toBe(1001);
    expect(teamAverage(emptyDraft(), "blue", byKey)).toBeNull();
  });
});
