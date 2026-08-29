export interface ParsedMention {
  mentionedNickname: string;
  mentionedAt: Date;
  rawMessage: string;
}

const DATE_SEPARATOR_RE = /^-+\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*[일월화수목금토]요일\s*-+$/;
const MESSAGE_HEADER_RE = /^\[(.+?)\]\s\[(오전|오후)\s(\d{1,2}):(\d{2})\]\s(.*)$/;

interface CurrentDate {
  year: number;
  month: number;
  day: number;
}

interface PendingMessage {
  sentAt: Date;
  lines: string[];
}

function to24Hour(ampm: "오전" | "오후", hour: number): number {
  if (ampm === "오전") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

export function parseKakaoExport(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let currentDate: CurrentDate | null = null;
  let pending: PendingMessage | null = null;

  function flush(): void {
    if (!pending) return;
    const rawMessage = pending.lines.join("\n");
    for (const line of pending.lines) {
      const trimmed = line.trim();
      // Mentions appear as "@닉네임" anywhere on a line — often after a
      // list marker like "1. " in recruitment posts, not only at column 0.
      const atIndex = trimmed.indexOf("@");
      if (atIndex === -1) continue;
      const mentionedNickname = trimmed.slice(atIndex + 1).trim();
      if (mentionedNickname.length === 0) continue;
      mentions.push({ mentionedNickname, mentionedAt: pending.sentAt, rawMessage });
    }
    pending = null;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const dateMatch = rawLine.match(DATE_SEPARATOR_RE);
    if (dateMatch) {
      flush();
      currentDate = { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) };
      continue;
    }

    const headerMatch = currentDate ? rawLine.match(MESSAGE_HEADER_RE) : null;
    if (headerMatch && currentDate) {
      flush();
      const [, , ampm, hourStr, minuteStr, firstLine] = headerMatch;
      const hour = to24Hour(ampm as "오전" | "오후", Number(hourStr));
      pending = {
        sentAt: new Date(currentDate.year, currentDate.month - 1, currentDate.day, hour, Number(minuteStr)),
        lines: [firstLine],
      };
      continue;
    }

    if (pending) {
      pending.lines.push(rawLine);
    }
  }
  flush();

  return mentions;
}
