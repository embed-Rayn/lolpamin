"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BannerVariant } from "@lolpamin/db";
import { deleteHomeBannerAction, setHomeBannerAction } from "@/app/admins/actions";
import type { BannerSlot } from "@/lib/queries/home-banners";

const SLOTS = [0, 1, 2, 3];

export function BannerSlotGrid({
  variant,
  label,
  hint,
  filled,
}: {
  variant: BannerVariant;
  label: string;
  hint: string;
  filled: BannerSlot[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // 파일 입력 하나를 네 칸이 같이 쓴다. 어느 칸을 눌러 열었는지 여기 적어 둔다.
  const targetSlot = useRef(0);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function pick(slot: number) {
    targetSlot.current = slot;
    inputRef.current?.click();
  }

  function run(slot: number, action: () => Promise<{ error: string | null }>) {
    setError(null);
    setBusySlot(slot);
    startTransition(async () => {
      const result = await action();
      setBusySlot(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    const slot = targetSlot.current;
    const formData = new FormData();
    formData.set("variant", variant);
    formData.set("slot", String(slot));
    formData.set("file", file);
    run(slot, () => setHomeBannerAction(formData));
  }

  function remove(slot: number) {
    if (!window.confirm(`${label} ${slot + 1}번을 삭제할까요?`)) return;
    run(slot, () => deleteHomeBannerAction(variant, slot));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold text-fg-2">{label}</span>
        <span className="text-[12px] text-faint">{hint}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          // 같은 파일을 다시 골라도 change가 나도록 비운다.
          e.target.value = "";
        }}
      />
      <div className="grid max-w-2xl grid-cols-4 gap-3">
        {SLOTS.map((slot) => {
          const banner = filled.find((b) => b.slot === slot);
          const isBusy = busySlot === slot;
          if (!banner) {
            return (
              <button
                key={slot}
                type="button"
                onClick={() => pick(slot)}
                disabled={busySlot !== null}
                aria-label={`${label} ${slot + 1}번 추가`}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-ink/[.14] bg-ink/[.05] text-faint hover:bg-ink/[.08] disabled:opacity-50"
              >
                {isBusy ? (
                  <span className="text-[12px]">올리는 중…</span>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            );
          }
          return (
            <div key={slot} className="relative aspect-square overflow-hidden rounded-lg border border-ink/[.06] bg-inset">
              <img src={banner.src} alt="" className={`h-full w-full object-cover ${isBusy ? "opacity-40" : ""}`} />
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => pick(slot)}
                  disabled={busySlot !== null}
                  className="rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-fg-2 shadow-sm hover:bg-surface disabled:opacity-50"
                >
                  편집
                </button>
                <button
                  type="button"
                  onClick={() => remove(slot)}
                  disabled={busySlot !== null}
                  className="rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-danger-soft shadow-sm hover:bg-surface disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
    </div>
  );
}
