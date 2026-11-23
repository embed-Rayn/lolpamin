"use client";

import { useEffect } from "react";

export function tournamentImageSrc(id: string): string {
  return `/api/tournament/images/${id}`;
}

// Full-size viewer over the page. Backdrop click or Esc closes; ←/→ (keys or buttons)
// step through the images and wrap at both ends.
export function TournamentImageLightbox({
  ids,
  index,
  onIndexChange,
  onClose,
}: {
  ids: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const count = ids.length;
  const step = (by: number) => onIndexChange((index + by + count) % count);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      else if (e.key === "ArrowRight") onIndexChange((index + 1) % count);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndexChange, onClose]);

  if (count === 0) return null;
  const buttonClass =
    "rounded-full bg-surface/90 px-3 py-2 text-[16px] font-bold text-fg-2 shadow-sm hover:bg-surface";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이미지 크게 보기"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <img
        src={tournamentImageSrc(ids[index])}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-full object-contain"
      />
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="이전 이미지"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className={`absolute left-3 top-1/2 -translate-y-1/2 ${buttonClass}`}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 이미지"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${buttonClass}`}
          >
            ›
          </button>
        </>
      )}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {count > 1 && (
          <span className="rounded-full bg-surface/90 px-2.5 py-1 font-mono text-[12px] text-fg-2">
            {index + 1}/{count}
          </span>
        )}
        <button
          type="button"
          aria-label="닫기"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full bg-surface/90 px-3 py-1 text-[14px] font-bold text-fg-2 shadow-sm hover:bg-surface"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
