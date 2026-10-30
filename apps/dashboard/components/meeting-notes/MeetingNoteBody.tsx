import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export function meetingNoteImageSrc(id: string): string {
  return `/api/meeting-notes/images/${id}`;
}

// Tailwind's preflight strips list markers, margins and heading sizes, so every element the
// body can produce gets its look here.
const STATIC_COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="m-0 mt-1 text-[19px] font-extrabold tracking-tight text-fg">{children}</h2>,
  h2: ({ children }) => <h3 className="m-0 mt-1 text-[16.5px] font-extrabold tracking-tight text-fg">{children}</h3>,
  h3: ({ children }) => <h4 className="m-0 mt-1 text-[14.5px] font-bold tracking-tight text-fg">{children}</h4>,
  h4: ({ children }) => <h5 className="m-0 mt-1 text-[14px] font-bold text-fg">{children}</h5>,
  h5: ({ children }) => <h6 className="m-0 mt-1 text-[13.5px] font-bold text-fg">{children}</h6>,
  h6: ({ children }) => <h6 className="m-0 mt-1 text-[13px] font-bold text-muted">{children}</h6>,
  p: ({ children }) => <p className="m-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-faint">{children}</del>,
  // A task list (remark-gfm) marks its <ul>/<li> with "contains-task-list" / "task-list-item".
  ul: ({ className, children }) => (
    <ul
      className={`m-0 flex flex-col gap-0.5 ${
        className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc pl-5"
      } [&_ol]:mt-0.5 [&_ul]:mt-0.5`}
    >
      {children}
    </ul>
  ),
  ol: ({ start, children }) => (
    <ol start={start} className="m-0 flex list-decimal flex-col gap-0.5 pl-5 [&_ol]:mt-0.5 [&_ul]:mt-0.5">
      {children}
    </ol>
  ),
  li: ({ className, children }) => (
    <li className={className?.includes("task-list-item") ? "flex flex-wrap items-start gap-2 [&>ul]:basis-full" : undefined}>
      {children}
    </li>
  ),
  input: ({ checked }) => (
    <input type="checkbox" checked={checked ?? false} disabled readOnly className="mt-[5px] accent-accent" />
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-soft underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="m-0 flex flex-col gap-1 border-l-[3px] border-ink/[.12] pl-3 text-muted">{children}</blockquote>
  ),
  code: ({ className, children }) => (
    <code className={`${className ?? ""} rounded bg-ink/[.06] px-1 py-0.5 font-mono text-[13px]`}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto rounded-lg bg-ink/[.05] p-3 [&>code]:bg-transparent [&>code]:p-0">{children}</pre>
  ),
  hr: () => <hr className="my-1 border-0 border-t border-ink/[.08]" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
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

// Used by the view page (server) and the editor's preview (client). Standard markdown (GFM,
// a single newline is a line break) through react-markdown with no raw-HTML plugin: HTML in
// the body is never rendered. An image's url is a MeetingNoteImage id; imageIds is the set
// this note may show, and an id outside it (a typo, another note's image, an upload still in
// flight) renders as an empty box rather than fetching anything.
export function MeetingNoteBody({ body, imageIds }: { body: string; imageIds: string[] }) {
  if (body.trim() === "") return <p className="m-0 text-[13.5px] text-faint">내용이 없습니다.</p>;
  const allowed = new Set(imageIds);

  const components: Components = {
    ...STATIC_COMPONENTS,
    img: ({ src }) =>
      typeof src === "string" && allowed.has(src) ? (
        <img src={meetingNoteImageSrc(src)} alt="" className="block max-w-full rounded-lg border border-ink/[.06]" />
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
