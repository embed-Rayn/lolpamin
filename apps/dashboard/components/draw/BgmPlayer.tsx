"use client";

import { useEffect, useRef, useState } from "react";
import type { BgmTrack } from "@/lib/draw/bgm";

const FIELD =
  "rounded-lg border border-ink/[.09] bg-page px-2.5 py-1.5 text-[13px] text-fg outline-none disabled:opacity-40";

export function BgmPlayer() {
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [selected, setSelected] = useState("");
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bgm")
      .then((res) => res.json())
      .then((data: { tracks: BgmTrack[] }) => {
        if (cancelled) return;
        setTracks(data.tracks);
        setSelected(data.tracks[0]?.url ?? "");
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, selected]);

  // Browsers refuse audio that no user gesture asked for, so playback only ever
  // starts from this button.
  function toggle() {
    const audio = audioRef.current;
    if (!audio || selected === "") return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-ink/[.07] bg-surface-2 px-3 py-2.5">
      <span className="text-[12px] font-bold tracking-wider text-ghost">BGM</span>
      {tracks.length === 0 ? (
        <span className="text-[13px] text-faint">BGM 없음</span>
      ) : (
        <>
          <select
            className={`${FIELD} w-40 min-w-0`}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPlaying(false);
            }}
          >
            {tracks.map((t) => (
              <option key={t.url} value={t.url}>
                {t.name.replace(/\.mp3$/i, "")}
              </option>
            ))}
          </select>
          <button type="button" className={`${FIELD} font-semibold`} onClick={toggle}>
            {playing ? "정지" : "재생"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20 accent-accent"
            aria-label="볼륨"
          />
          <audio ref={audioRef} src={selected} loop onEnded={() => setPlaying(false)} />
        </>
      )}
    </div>
  );
}
