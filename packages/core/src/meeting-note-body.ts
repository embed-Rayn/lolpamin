// The meeting-notes body is standard markdown, rendered by react-markdown in the dashboard
// (MeetingNoteBody). An image is written ![alt](imageId) — the url is a MeetingNoteImage id.

// Inline images render anywhere in markdown, not only on a line of their own, so every
// occurrence counts. One inside a code block is counted too: keeping an image the note
// merely quotes is harmless, deleting one it shows is not.
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function extractMeetingNoteImageIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(IMAGE)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}
