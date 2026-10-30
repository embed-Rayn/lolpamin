"use client";

import type { LinePrefix } from "@lolpamin/core";

const BUTTON =
  "rounded-md px-2 py-1 text-[12.5px] font-bold text-fg-2 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";

// Buttons keep the textarea's focus and selection: onMouseDown is prevented so a click does
// not blur it before the edit reads selectionStart/End.
export function EditorToolbar({
  onPrefix,
  onBold,
  onIndent,
  onImage,
}: {
  onPrefix: (prefix: LinePrefix) => void;
  onBold: () => void;
  onIndent: (outdent: boolean) => void;
  onImage: () => void;
}) {
  const item = (label: string, title: string, action: () => void, extra = "") => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
      className={`${BUTTON} ${extra}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="서식">
      {item("제목", "제목 (## )", () => onPrefix("heading"))}
      {item("B", "굵게 (Ctrl+B)", onBold, "font-extrabold")}
      <span className="mx-1 h-4 w-px bg-ink/[.1]" aria-hidden />
      {item("• 목록", "목록 (- )", () => onPrefix("bullet"))}
      {item("1. 번호", "번호 (1. )", () => onPrefix("number"))}
      {item("☐ 할 일", "할 일 (- [ ] )", () => onPrefix("task"))}
      <span className="mx-1 h-4 w-px bg-ink/[.1]" aria-hidden />
      {item("→ 들여쓰기", "들여쓰기 (Tab)", () => onIndent(false))}
      {item("← 내어쓰기", "내어쓰기 (Shift+Tab)", () => onIndent(true))}
      <span className="mx-1 h-4 w-px bg-ink/[.1]" aria-hidden />
      {item("이미지", "이미지 추가", onImage)}
    </div>
  );
}
