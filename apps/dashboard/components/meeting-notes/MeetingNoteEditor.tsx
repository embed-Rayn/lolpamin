"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMeetingNoteImageAction,
  createMeetingNoteAction,
  updateMeetingNoteAction,
} from "@/app/meeting-notes/actions";
import { MeetingNoteBody } from "./MeetingNoteBody";

const TITLE_MAX = 100;
const BODY_MAX = 50_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Replaces (or with null removes) the first line equal to `line`. Placeholders are unique,
// so the line the upload inserted is found wherever the operator's typing has pushed it.
function replaceLine(body: string, line: string, next: string | null): string {
  const lines = body.split("\n");
  const index = lines.indexOf(line);
  if (index < 0) return body;
  if (next === null) lines.splice(index, 1);
  else lines[index] = next;
  return lines.join("\n");
}

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1 text-[12.5px] font-bold ${active ? "bg-accent/[.15] text-accent-soft" : "text-faint hover:text-fg-2"}`;

// New note when noteId is absent; otherwise an edit opened at `version`.
export function MeetingNoteEditor({
  noteId,
  version,
  initialTitle,
  initialMeetingDate,
  initialBody,
  initialImageIds,
}: {
  noteId?: string;
  version?: number;
  initialTitle: string;
  initialMeetingDate: string;
  initialBody: string;
  initialImageIds: string[];
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // crypto.randomUUID needs a secure context and the site is served over plain HTTP.
  const placeholderSeq = useRef(0);
  const [title, setTitle] = useState(initialTitle);
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate);
  const [body, setBody] = useState(initialBody);
  const [imageIds, setImageIds] = useState(initialImageIds);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Writing a new `value` to a controlled textarea sends the caret to the end, so a
  // programmatic body change records where the caret should land and the layout effect
  // below puts it back. Ordinary typing never sets it.
  const pendingCaret = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    const el = textareaRef.current;
    if (caret && el && document.activeElement === el) el.setSelectionRange(caret.start, caret.end);
  }, [body]);

  const dirty = title !== initialTitle || meetingDate !== initialMeetingDate || body !== initialBody;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // beforeunload does not see in-app navigation, so a plain click on a same-site link
  // (sidebar, 「← 보기로 돌아가기」) asks first. Saving navigates while isPending, so it is exempt.
  useEffect(() => {
    if (!dirty || isPending) return;
    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      if (anchor.origin !== window.location.origin) return;
      if (!window.confirm("저장하지 않은 내용이 있습니다. 나가시겠습니까?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty, isPending]);

  // Puts `text` on its own line(s) at the cursor (or over the selection); the caret ends
  // just after the inserted text.
  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    setBody((current) => {
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const lead = before === "" || before.endsWith("\n") ? "" : "\n";
      const trail = after.startsWith("\n") ? "" : "\n";
      const caret = before.length + lead.length + text.length + trail.length;
      pendingCaret.current = { start: caret, end: caret };
      return `${before}${lead}${text}${trail}${after}`;
    });
  }

  // replaceLine on the body, keeping the caret on the same text: a line that starts before
  // it moves the caret by however much the body grew or shrank.
  function replaceBodyLine(line: string, next: string | null) {
    const el = textareaRef.current;
    setBody((current) => {
      const updated = replaceLine(current, line, next);
      if (updated === current || !el) return updated;
      const index = current.split("\n").indexOf(line);
      const lineStart = current.split("\n").slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
      const delta = updated.length - current.length;
      const shift = (pos: number) =>
        lineStart < pos ? Math.min(Math.max(pos + delta, lineStart), updated.length) : pos;
      pendingCaret.current = { start: shift(el.selectionStart), end: shift(el.selectionEnd) };
      return updated;
    });
  }

  async function uploadOne(file: File, placeholder: string) {
    const formData = new FormData();
    formData.set("file", file);
    try {
      const result = await addMeetingNoteImageAction(formData);
      if (result.id) {
        const id = result.id;
        setImageIds((ids) => [...ids, id]);
        replaceBodyLine(placeholder, `![](${id})`);
      } else {
        setError(result.error ?? "이미지를 올리지 못했습니다.");
        replaceBodyLine(placeholder, null);
      }
    } catch {
      setError("이미지를 올리지 못했습니다.");
      replaceBodyLine(placeholder, null);
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function uploadFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setError(null);
    const accepted: File[] = [];
    for (const file of images) {
      if (!IMAGE_TYPES.includes(file.type)) setError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
      else if (file.size > IMAGE_MAX_BYTES) setError("이미지 용량은 5MB를 넘을 수 없습니다.");
      else accepted.push(file);
    }
    if (accepted.length === 0) return;
    const placeholders = accepted.map(() => `![업로드 중…](pending-${Date.now()}-${++placeholderSeq.current})`);
    insertAtCursor(placeholders.join("\n"));
    setTab("edit");
    setUploading((n) => n + accepted.length);
    accepted.forEach((file, i) => void uploadOne(file, placeholders[i]));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (uploading > 0) return;
    const formData = new FormData();
    formData.set("title", title);
    formData.set("meetingDate", meetingDate);
    formData.set("body", body);
    setError(null);
    startTransition(async () => {
      try {
        if (noteId) {
          formData.set("version", String(version ?? ""));
          const result = await updateMeetingNoteAction(noteId, formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          router.push(`/meeting-notes/${noteId}`);
          router.refresh();
          return;
        }
        const result = await createMeetingNoteAction(formData);
        if (result.error || !result.id) {
          setError(result.error ?? "회의록을 저장하지 못했습니다.");
          return;
        }
        router.push(`/meeting-notes/${result.id}`);
      } catch {
        setError("회의록을 저장하지 못했습니다. 로그인 상태를 확인해 주세요.");
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-bold text-fg-2">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            required
            className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
          />
        </label>
        <label className="flex w-[180px] flex-col gap-1.5">
          <span className="text-[13px] font-bold text-fg-2">회의일</span>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            required
            className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 text-[14px] text-fg"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button type="button" className={tabClass(tab === "edit")} onClick={() => setTab("edit")}>
            편집
          </button>
          <button type="button" className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
        <div className="flex items-center gap-2">
          {uploading > 0 && <span className="text-[12px] text-faint">이미지 {uploading}장 올리는 중…</span>}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-ink/[.1] px-3 py-1.5 text-[12.5px] font-bold text-fg-2 hover:bg-hover"
          >
            이미지 추가
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            hidden
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {tab === "edit" ? (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            // Excel/Word put text and a picture of it on the clipboard; text wins.
            if (e.clipboardData.getData("text/plain") === "" && files.some((file) => file.type.startsWith("image/"))) {
              e.preventDefault();
              uploadFiles(files);
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;
            // Always claim a file drop, or the browser navigates to the dropped file.
            e.preventDefault();
            if (files.some((file) => file.type.startsWith("image/"))) uploadFiles(files);
            else setError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
          }}
          maxLength={BODY_MAX}
          rows={22}
          placeholder={"# 안건\n- 논의 내용\n1. 결정 사항\n- [ ] 할 일\n**굵게**\n\n이미지는 붙여넣기(Ctrl+V)나 끌어다 놓기로 넣을 수 있습니다."}
          className="rounded-lg border border-ink/[.1] bg-inset px-3 py-2 font-mono text-[13.5px] leading-relaxed text-fg"
        />
      ) : (
        <div className="min-h-[300px] rounded-lg border border-ink/[.06] bg-inset px-4 py-3">
          <MeetingNoteBody body={body} imageIds={imageIds} />
        </div>
      )}

      <div className="text-[11.5px] text-faint">
        서식: <code># 제목</code> · <code>- 목록</code> · <code>1. 번호</code> · <code>- [ ] 할 일</code> ·{" "}
        <code>**굵게**</code> · 이미지 붙여넣기/끌어다 놓기
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || uploading > 0}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
        {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
      </div>
    </form>
  );
}
