import { describe, expect, it } from "vitest";
import { listBgmTracks } from "./bgm";

describe("listBgmTracks", () => {
  it("keeps only mp3 files", () => {
    const tracks = listBgmTracks(["a.mp3", "notes.txt", ".DS_Store", "b.MP3"]);
    expect(tracks.map((t) => t.name)).toEqual(["a.mp3", "b.MP3"]);
  });

  it("sorts by name", () => {
    const tracks = listBgmTracks(["Hidden Card.mp3", "A strange tail.mp3", "Counter Shot.mp3"]);
    expect(tracks.map((t) => t.name)).toEqual([
      "A strange tail.mp3",
      "Counter Shot.mp3",
      "Hidden Card.mp3",
    ]);
  });

  it("percent-encodes spaces so the static URL resolves", () => {
    expect(listBgmTracks(["Counter Shot.mp3"])[0].url).toBe("/bgm/Counter%20Shot.mp3");
  });

  it("returns an empty list for an empty directory", () => {
    expect(listBgmTracks([])).toEqual([]);
  });
});
