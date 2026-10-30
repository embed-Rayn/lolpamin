"use client";

import { createContext, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { extractMeetingNoteTasks, parseMeetingDateInput, type MeetingNoteTask } from "@lolpamin/core";

export function meetingNoteImageSrc(id: string): string {
  return `/api/meeting-notes/images/${id}`;
}

export interface MeetingNoteTaskToggle {
  line: number;
  text: string;
  checked: boolean;
}

// 0-based source line of a rendered node. The editor's preview follows the caret with it.
function lineOf(node: ExtraProps["node"]): number | undefined {
  const line = node?.position?.start.line;
  return line === undefined ? undefined : line - 1;
}

// The line of the list item a checkbox sits in; react-markdown gives the generated <input>
// no source position of its own.
const ItemLine = createContext<number | undefined>(undefined);

type Props<T extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[T] & ExtraProps;

function block<T extends keyof JSX.IntrinsicElements>(Tag: T, className: string) {
  return function Block({ node, children }: Props<T>) {
    const Element = Tag as unknown as (p: { className: string; "data-line"?: number; children?: ReactNode }) => JSX.Element;
    return (
      <Element className={className} data-line={lineOf(node)}>
        {children}
      </Element>
    );
  };
}

// Tailwind's preflight strips list markers, margins and heading sizes, so every element the
// body can produce gets its look here.
const STATIC_COMPONENTS: Components = {
  h1: block("h2", "m-0 mt-1 text-[19px] font-extrabold tracking-tight text-fg"),
  h2: block("h3", "m-0 mt-1 text-[16.5px] font-extrabold tracking-tight text-fg"),
  h3: block("h4", "m-0 mt-1 text-[14.5px] font-bold tracking-tight text-fg"),
  h4: block("h5", "m-0 mt-1 text-[14px] font-bold text-fg"),
  h5: block("h6", "m-0 mt-1 text-[13.5px] font-bold text-fg"),
  h6: block("h6", "m-0 mt-1 text-[13px] font-bold text-muted"),
  p: block("p", "m-0"),
  strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-faint">{children}</del>,
  // A task list (remark-gfm) marks its <ul>/<li> with "contains-task-list" / "task-list-item".
  ul: ({ node, className, children }) => (
    <ul
      data-line={lineOf(node)}
      className={`m-0 flex flex-col gap-0.5 ${
        className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc pl-5"
      } [&_ol]:mt-0.5 [&_ul]:mt-0.5`}
    >
      {children}
    </ul>
  ),
  ol: ({ node, start, children }) => (
    <ol
      data-line={lineOf(node)}
      start={start}
      className="m-0 flex list-decimal flex-col gap-0.5 pl-5 [&_ol]:mt-0.5 [&_ul]:mt-0.5"
    >
      {children}
    </ol>
  ),
  li: ({ node, className, children }) => (
    <ItemLine.Provider value={lineOf(node)}>
      <li
        data-line={lineOf(node)}
        className={className?.includes("task-list-item") ? "flex flex-wrap items-start gap-2 [&>ul]:basis-full" : undefined}
      >
        {children}
      </li>
    </ItemLine.Provider>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-soft underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: block("blockquote", "m-0 flex flex-col gap-1 border-l-[3px] border-ink/[.12] pl-3 text-muted"),
  code: ({ className, children }) => (
    <code className={`${className ?? ""} rounded bg-ink/[.06] px-1 py-0.5 font-mono text-[13px]`}>{children}</code>
  ),
  pre: block("pre", "m-0 overflow-x-auto rounded-lg bg-ink/[.05] p-3 [&>code]:bg-transparent [&>code]:p-0"),
  hr: ({ node }) => <hr data-line={lineOf(node)} className="my-1 border-0 border-t border-ink/[.08]" />,
  table: ({ node, children }) => (
    <div data-line={lineOf(node)} className="overflow-x-auto">
      <table className="border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} className="border border-ink/[.1] bg-surface-2 px-2.5 py-1 font-bold text-fg">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-ink/[.1] px-2.5 py-1">
      {children}
    </td>
  ),
};

function TaskCheckbox({
  checked,
  tasks,
  onToggleTask,
}: {
  checked: boolean;
  tasks: Map<number, MeetingNoteTask>;
  onToggleTask?: (toggle: MeetingNoteTaskToggle) => void;
}) {
  const line = useContext(ItemLine);
  const task = line === undefined ? undefined : tasks.get(line);
  // Only a line extractMeetingNoteTasks reads as a task can be ticked — a checkbox inside a
  // blockquote renders but has no line the toggle could rewrite.
  if (!onToggleTask || !task) {
    return <input type="checkbox" checked={checked} disabled readOnly className="mt-[5px] accent-accent" />;
  }
  return (
    <input
      type="checkbox"
      checked={task.checked}
      onChange={() => onToggleTask({ line: task.line, text: task.text, checked: !task.checked })}
      className="mt-[5px] cursor-pointer accent-accent"
    />
  );
}

// Used by the view page, the editor's preview (both client) and anywhere else read-only.
// Standard markdown (GFM, a single newline is a line break) through react-markdown with no
// raw-HTML plugin: HTML in the body is never rendered. An image's url is a MeetingNoteImage
// id; imageIds is the set this note may show, and an id outside it (a typo, another note's
// image, an upload still in flight) renders as an empty box rather than fetching anything.
// meetingDate (YYYY-MM-DD) dates the tasks; with onToggleTask their checkboxes can be ticked.
export function MeetingNoteBody({
  body,
  imageIds,
  meetingDate,
  onToggleTask,
}: {
  body: string;
  imageIds: string[];
  meetingDate?: string;
  onToggleTask?: (toggle: MeetingNoteTaskToggle) => void;
}) {
  if (body.trim() === "") return <p className="m-0 text-[13.5px] text-faint">내용이 없습니다.</p>;
  const allowed = new Set(imageIds);
  const date = (meetingDate && parseMeetingDateInput(meetingDate)) || new Date();
  const tasks = new Map(extractMeetingNoteTasks(body, date).map((t) => [t.line, t]));

  const components: Components = {
    ...STATIC_COMPONENTS,
    input: ({ checked }) => <TaskCheckbox checked={checked ?? false} tasks={tasks} onToggleTask={onToggleTask} />,
    img: ({ node, src }) =>
      typeof src === "string" && allowed.has(src) ? (
        <img
          data-line={lineOf(node)}
          src={meetingNoteImageSrc(src)}
          alt=""
          className="block max-w-full rounded-lg border border-ink/[.06]"
        />
      ) : (
        <span className="flex h-24 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12.5px] text-faint">
          이미지 없음
        </span>
      ),
  };

  return (
    <div className="flex flex-col gap-3 break-words text-[14.5px] leading-relaxed text-fg-2">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
