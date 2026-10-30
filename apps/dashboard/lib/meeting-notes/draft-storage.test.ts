import { describe, expect, it } from "vitest";
import { clearDraft, draftKey, readDraft, stashKey, writeDraft, type MeetingNoteDraft } from "./draft-storage";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const draft: MeetingNoteDraft = {
  title: "회의",
  meetingDate: "2026-10-30",
  body: "- [ ] a",
  imageIds: ["img1"],
  baseVersion: 2,
  baseTitle: "회의",
  baseMeetingDate: "2026-10-30",
  baseBody: "",
  savedAt: "2026-10-30T03:00:00.000Z",
};

describe("draft storage", () => {
  it("names keys per note", () => {
    expect(draftKey()).toBe("lolpamin.meeting-note.draft.new");
    expect(draftKey("abc")).toBe("lolpamin.meeting-note.draft.abc");
    expect(stashKey("abc")).toBe("lolpamin.meeting-note.stash.abc");
  });

  it("round-trips and clears a draft", () => {
    const storage = memoryStorage();
    writeDraft(storage, draftKey("abc"), draft);
    expect(readDraft(storage, draftKey("abc"))).toEqual(draft);
    clearDraft(storage, draftKey("abc"));
    expect(readDraft(storage, draftKey("abc"))).toBeNull();
  });

  it("reads corrupt or foreign JSON as no draft", () => {
    const storage = memoryStorage();
    storage.setItem(draftKey(), "{not json");
    expect(readDraft(storage, draftKey())).toBeNull();
    storage.setItem(draftKey(), JSON.stringify({ title: 1 }));
    expect(readDraft(storage, draftKey())).toBeNull();
  });

  it("does nothing without storage or when storage throws", () => {
    expect(readDraft(null, draftKey())).toBeNull();
    expect(() => writeDraft(null, draftKey(), draft)).not.toThrow();
    const full = memoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeDraft(full, draftKey(), draft)).not.toThrow();
    expect(() => clearDraft(null, draftKey())).not.toThrow();
  });
});
