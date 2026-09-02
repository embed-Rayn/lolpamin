export interface BgmTrack {
  name: string;
  url: string;
}

// The listing is derived from the directory at request time rather than from a
// hard-coded array, so dropping another mp3 into public/bgm is all it takes to
// add a track.
export function listBgmTracks(fileNames: string[]): BgmTrack[] {
  return fileNames
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((name) => ({ name, url: `/bgm/${encodeURIComponent(name)}` }));
}
