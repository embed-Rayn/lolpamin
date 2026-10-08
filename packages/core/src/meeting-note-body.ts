// The meeting-notes body is a markdown subset rendered by our own code: headings (# ## ###),
// bullets (-), numbered items (1.), checkboxes (- [ ] / - [x]), whole-line images (![](id))
// and **bold**. Anything else is literal text — there is no HTML path at all.

export interface MeetingNoteSpan {
  text: string;
  bold: boolean;
}

export type MeetingNoteBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: MeetingNoteSpan[] }
  | { kind: "bullets"; items: MeetingNoteSpan[][] }
  | { kind: "numbers"; items: MeetingNoteSpan[][] }
  | { kind: "checklist"; items: Array<{ checked: boolean; spans: MeetingNoteSpan[] }> }
  | { kind: "image"; id: string }
  | { kind: "paragraph"; lines: MeetingNoteSpan[][] };

const HEADING = /^(#{1,3}) (.*)$/;
const CHECK = /^- \[([ xX])\] (.*)$/;
const BULLET = /^- (.*)$/;
const NUMBER = /^\d+\. (.*)$/;
const IMAGE = /^!\[[^\]]*\]\(([^)\s]+)\)$/;

export function parseInlineBold(text: string): MeetingNoteSpan[] {
  const parts = text.split("**");
  // An odd number of markers leaves the last one without a partner: it stays literal.
  if (parts.length % 2 === 0) {
    const last = parts.pop()!;
    parts[parts.length - 1] += `**${last}`;
  }
  const spans: MeetingNoteSpan[] = [];
  parts.forEach((part, i) => {
    if (part) spans.push({ text: part, bold: i % 2 === 1 });
  });
  return spans;
}

export function parseMeetingNoteBody(body: string): MeetingNoteBlock[] {
  const blocks: MeetingNoteBlock[] = [];
  // The block still accepting lines; a blank line, a heading or an image closes it.
  let open: MeetingNoteBlock | null = null;

  const push = (block: MeetingNoteBlock) => {
    blocks.push(block);
    open = block;
  };

  for (const raw of body.split(/\r?\n/)) {
    // Indentation is ignored: nested lists are out of scope.
    const line = raw.trim();
    if (!line) {
      open = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, spans: parseInlineBold(heading[2]) });
      open = null;
      continue;
    }

    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ kind: "image", id: image[1] });
      open = null;
      continue;
    }

    const current = open as MeetingNoteBlock | null;
    const check = CHECK.exec(line);
    if (check) {
      const item = { checked: check[1] !== " ", spans: parseInlineBold(check[2]) };
      if (current?.kind === "checklist") current.items.push(item);
      else push({ kind: "checklist", items: [item] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      const spans = parseInlineBold(bullet[1]);
      if (current?.kind === "bullets") current.items.push(spans);
      else push({ kind: "bullets", items: [spans] });
      continue;
    }

    const number = NUMBER.exec(line);
    if (number) {
      const spans = parseInlineBold(number[1]);
      if (current?.kind === "numbers") current.items.push(spans);
      else push({ kind: "numbers", items: [spans] });
      continue;
    }

    const spans = parseInlineBold(line);
    if (current?.kind === "paragraph") current.lines.push(spans);
    else push({ kind: "paragraph", lines: [spans] });
  }

  return blocks;
}

export function extractMeetingNoteImageIds(body: string): string[] {
  const ids: string[] = [];
  for (const block of parseMeetingNoteBody(body)) {
    if (block.kind === "image" && !ids.includes(block.id)) ids.push(block.id);
  }
  return ids;
}
