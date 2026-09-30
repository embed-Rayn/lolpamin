"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventImageKind } from "@lolpamin/db";
import { addEventImageAction, deleteEventImageAction, moveEventImageAction } from "@/app/events/actions";
import type { EventImageRef } from "@/lib/queries/event-posts";

// One section (일반 사진 or 추후 공개 사진) of the edit page. Each change applies
// immediately, apart from the title/body form's 저장 — like BannerSlotGrid.
export function EventImageManager({
  postId,
  kind,
  label,
  hint,
  images,
}: {
  postId: string;
  kind: EventImageKind;
  label: string;
  hint: string;
  images: EventImageRef[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(status: string, work: () => Promise<string | null>) {
    setError(null);
    setBusy(status);
    startTransition(async () => {
      const failure = await work();
      setBusy(null);
      if (failure) setError(failure);
      router.refresh();
    });
  }

  // Sequential on purpose: parallel uploads would race for the same next position.
  function upload(files: File[]) {
    if (files.length === 0) return;
    run("올리는 중…", async () => {
      for (const [index, file] of files.entries()) {
        const formData = new FormData();
        formData.set("postId", postId);
        formData.set("kind", kind);
        formData.set("file", file);
        const result = await addEventImageAction(formData);
        if (result.error) {
          return `${file.name}: ${result.error}${index < files.length - 1 ? " (나머지는 올리지 않았습니다)" : ""}`;
        }
      }
      return null;
    });
  }

  function remove(imageId: string, index: number) {
    if (!window.confirm(`${label} ${index + 1}번을 삭제할까요?`)) return;
    run("삭제 중…", async () => (await deleteEventImageAction(imageId)).error);
  }

  function move(imageId: string, direction: "up" | "down") {
    run("옮기는 중…", async () => (await moveEventImageAction(imageId, direction)).error);
  }

  const disabled = busy !== null;
  const buttonClass =
    "rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-fg-2 shadow-sm hover:bg-surface disabled:opacity-40";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold text-fg">{label}</span>
        <span className="text-[12px] text-faint">{hint}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="ml-auto rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:opacity-50"
        >
          {busy ?? "+ 사진 추가"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          // Let the same file be picked again.
          e.target.value = "";
        }}
      />
      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/[.14] px-4 py-8 text-center text-[12.5px] text-faint">
          사진이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div key={image.id} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-ink/[.06] bg-inset">
              <img src={image.src} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-md bg-surface/90 px-1.5 text-[11.5px] font-bold text-fg-2">
                {index + 1}
              </span>
              <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => move(image.id, "up")}
                  disabled={disabled || index === 0}
                  className={buttonClass}
                  aria-label="앞으로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(image.id, "down")}
                  disabled={disabled || index === images.length - 1}
                  className={buttonClass}
                  aria-label="뒤로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(image.id, index)}
                  disabled={disabled}
                  className={`${buttonClass} text-danger-soft`}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </section>
  );
}
