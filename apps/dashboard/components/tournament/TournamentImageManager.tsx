"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTournamentImageAction,
  deleteTournamentImageAction,
  moveTournamentImageAction,
} from "@/app/tournament/actions";
import { TournamentImageLightbox, tournamentImageSrc } from "./TournamentImageLightbox";

// The image card grid. Everyone can open the lightbox; with canEdit the operator also
// uploads (several files at once, sent one per action), reorders and deletes.
export function TournamentImageManager({ ids, canEdit }: { ids: string[]; canEdit: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = progress !== null || isPending;

  // Sequential on purpose: parallel uploads would race for the same next position, and
  // one file per action keeps each body under the 20mb server-action limit. A failed
  // file is reported and the rest still go up.
  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setFailures([]);
    const failed: string[] = [];
    setProgress({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.set("image", file);
      try {
        const result = await addTournamentImageAction(formData);
        if (result.error) failed.push(`${file.name}: ${result.error}`);
      } catch {
        failed.push(`${file.name}: 저장 중 오류가 발생했습니다.`);
      }
      setProgress({ done: index + 1, total: files.length });
    }
    setFailures(failed);
    setProgress(null);
    router.refresh();
  }

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function remove(id: string, index: number) {
    if (!window.confirm(`${index + 1}번 이미지를 삭제할까요?`)) return;
    run(() => deleteTournamentImageAction(id));
  }

  const adminButton =
    "rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-fg-2 shadow-sm hover:bg-surface disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              // Let the same file be picked again.
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50"
            >
              + 이미지 추가
            </button>
            {progress && (
              <span className="font-mono text-[12.5px] text-muted">
                {progress.done}/{progress.total} 업로드 중
              </span>
            )}
            <span className="text-[12px] text-faint">png · jpg · webp · gif, 한 장 5MB, 최대 20장</span>
          </div>
          {(failures.length > 0 || error) && (
            <div className="flex flex-col gap-0.5 rounded-lg border border-danger/30 bg-danger/[.10] px-3 py-2.5 text-[12.5px] text-danger-soft">
              {failures.map((f, i) => (
                <span key={i}>{f}</span>
              ))}
              {error && <span>{error}</span>}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {ids.map((id, index) => (
          <div key={id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-3">
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`${index + 1}번 이미지 크게 보기`}
              className="h-full w-full cursor-zoom-in"
            >
              <img src={tournamentImageSrc(id)} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
            {canEdit && (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-center gap-1">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => run(() => moveTournamentImageAction(id, "up"))}
                  className={adminButton}
                >
                  앞으로
                </button>
                <button
                  type="button"
                  disabled={busy || index === ids.length - 1}
                  onClick={() => run(() => moveTournamentImageAction(id, "down"))}
                  className={adminButton}
                >
                  뒤로
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(id, index)}
                  className={`${adminButton} text-danger-soft`}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
        {ids.length === 0 && canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-ink/[.18] bg-inset px-3 text-center text-[12.5px] font-semibold text-faint hover:border-ink/[.28] hover:text-fg-2 disabled:opacity-50"
          >
            이미지를 올려 주세요
          </button>
        )}
      </div>

      {openIndex !== null && ids.length > 0 && (
        <TournamentImageLightbox
          ids={ids}
          index={Math.min(openIndex, ids.length - 1)}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}
