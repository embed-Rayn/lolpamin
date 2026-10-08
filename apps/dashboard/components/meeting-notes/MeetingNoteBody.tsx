import { Fragment } from "react";
import { parseMeetingNoteBody, type MeetingNoteSpan } from "@lolpamin/core";

export function meetingNoteImageSrc(id: string): string {
  return `/api/meeting-notes/images/${id}`;
}

function Spans({ spans }: { spans: MeetingNoteSpan[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.bold ? (
          <strong key={i} className="font-bold text-fg">
            {span.text}
          </strong>
        ) : (
          <Fragment key={i}>{span.text}</Fragment>
        ),
      )}
    </>
  );
}

const HEADING_CLASS = {
  1: "text-[19px] font-extrabold",
  2: "text-[16.5px] font-extrabold",
  3: "text-[14.5px] font-bold",
} as const;

// Used by the view page (server) and the editor's preview (client). Text only ever reaches
// the DOM as React text nodes. imageIds is the set this note may show; an id outside it
// (a typo, another note's image) renders as an empty box rather than fetching it.
export function MeetingNoteBody({ body, imageIds }: { body: string; imageIds: string[] }) {
  const blocks = parseMeetingNoteBody(body);
  if (blocks.length === 0) return <p className="m-0 text-[13.5px] text-faint">내용이 없습니다.</p>;
  const allowed = new Set(imageIds);

  return (
    <div className="flex flex-col gap-3 break-words text-[14.5px] leading-relaxed text-fg-2">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const Tag = (`h${block.level + 1}`) as "h2" | "h3" | "h4";
            return (
              <Tag key={i} className={`m-0 mt-1 tracking-tight text-fg ${HEADING_CLASS[block.level]}`}>
                <Spans spans={block.spans} />
              </Tag>
            );
          }
          case "bullets":
            return (
              <ul key={i} className="m-0 flex list-disc flex-col gap-0.5 pl-5">
                {block.items.map((spans, j) => (
                  <li key={j}>
                    <Spans spans={spans} />
                  </li>
                ))}
              </ul>
            );
          case "numbers":
            return (
              <ol key={i} className="m-0 flex list-decimal flex-col gap-0.5 pl-5">
                {block.items.map((spans, j) => (
                  <li key={j}>
                    <Spans spans={spans} />
                  </li>
                ))}
              </ol>
            );
          case "checklist":
            return (
              <ul key={i} className="m-0 flex list-none flex-col gap-1 p-0">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <input type="checkbox" checked={item.checked} disabled readOnly className="mt-[5px] accent-accent" />
                    <span className={item.checked ? "text-faint line-through" : undefined}>
                      <Spans spans={item.spans} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "image":
            return allowed.has(block.id) ? (
              <img
                key={i}
                src={meetingNoteImageSrc(block.id)}
                alt=""
                className="max-w-full self-start rounded-lg border border-ink/[.06]"
              />
            ) : (
              <div
                key={i}
                className="flex h-24 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12.5px] text-faint"
              >
                이미지 없음
              </div>
            );
          case "paragraph":
            return (
              <p key={i} className="m-0">
                {block.lines.map((spans, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Spans spans={spans} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
