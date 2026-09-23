import { describe, expect, it } from "vitest";
import { draftReducer, emptyDraft, seatOf } from "@lolpamin/core";
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft, type StoredDraft } from "./storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const none = { mainLane: null, subLane: null };

function sample(): StoredDraft {
  let draft = draftReducer(emptyDraft(), { type: "setCaptain", side: "blue", key: "m:a", prefs: none });
  draft = draftReducer(draft, { type: "setCaptain", side: "red", key: "g:손님", prefs: none });
  draft = draftReducer(draft, { type: "pick", key: "m:b", prefs: none });
  return { participantIds: ["a", "b"], guests: [{ name: "손님", mmr: 1000, mainLane: null, subLane: "SUP" }], draft };
}

describe("draft storage", () => {
  it("round-trips a saved draft", () => {
    const storage = memoryStorage();
    saveDraft(storage, sample());
    expect(loadDraft(storage, new Set(["a", "b"]))).toEqual(sample());
  });

  it("drops members that left the pool from the participants and their seats", () => {
    const storage = memoryStorage();
    saveDraft(storage, sample());
    const loaded = loadDraft(storage, new Set(["a"]))!;
    expect(loaded.participantIds).toEqual(["a"]);
    expect(seatOf(loaded.draft, "m:b")).toBeNull();
    expect(loaded.draft.picks).toEqual([]);
  });

  it("returns null for missing, broken or mis-shaped data", () => {
    expect(loadDraft(memoryStorage(), new Set())).toBeNull();
    expect(loadDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: "{not json" }), new Set())).toBeNull();
    expect(loadDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify({ participantIds: "a" }) }), new Set())).toBeNull();
    expect(loadDraft(null, new Set())).toBeNull();
  });

  it("never throws when the storage itself throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadDraft(hostile, new Set())).toBeNull();
    expect(() => saveDraft(hostile, sample())).not.toThrow();
  });
});
