"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TITLE_MAX = 100;
const BODY_MAX = 5000;

// Shared by /events/new (create redirects on success) and the edit page (stays put).
export function EventPostForm({
  initialTitle = "",
  initialBody = "",
  submitLabel,
  onSubmit,
}: {
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-fg-2">제목</span>
        <input
          name="title"
          defaultValue={initialTitle}
          maxLength={TITLE_MAX}
          required
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-fg-2">내용</span>
        <textarea
          name="body"
          defaultValue={initialBody}
          maxLength={BODY_MAX}
          rows={6}
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] leading-relaxed text-fg"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "저장 중…" : submitLabel}
        </button>
        {saved && !error && <span className="text-[12.5px] text-faint">저장했습니다.</span>}
        {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
      </div>
    </form>
  );
}
