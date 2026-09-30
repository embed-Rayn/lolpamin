// Mirrors the Prisma enum EventImageKind as a string union so core stays free of
// another @lolpamin/db dependency; the Prisma values are assignable to it.
export type EventImageKindName = "MAIN" | "HIDDEN";

// EventPost.revealedAt means "visible from this moment": null keeps hidden images hidden,
// a past time shows them, a future time is a scheduled reveal that needs no job to fire —
// every read compares it with now.
export function isEventRevealed(revealedAt: Date | null, now: Date): boolean {
  return revealedAt !== null && revealedAt.getTime() <= now.getTime();
}

// A HIDDEN image stays invisible (not even a placeholder) until the post is revealed.
// Admins always see it so they can check it before it goes public.
export function canViewEventImage(
  image: { kind: EventImageKindName; revealedAt: Date | null },
  isAdmin: boolean,
  now: Date = new Date(),
): boolean {
  return image.kind === "MAIN" || isAdmin || isEventRevealed(image.revealedAt, now);
}

// The list shows what a visitor would see, admins included. An admin-chosen image wins,
// unless it is a hidden one not yet revealed — the thumbnail must not spoil the surprise.
// Otherwise a revealed hidden image leads (it goes to the top of the post), then the first
// main image.
export function pickEventThumbnailId(
  images: { id: string; kind: EventImageKindName; position: number }[],
  revealed: boolean,
  chosenId: string | null = null,
): string | null {
  const chosen = images.find((i) => i.id === chosenId);
  if (chosen && (chosen.kind === "MAIN" || revealed)) return chosen.id;

  const first = (kind: EventImageKindName) =>
    images.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position)[0];
  if (revealed) {
    const hidden = first("HIDDEN");
    if (hidden) return hidden.id;
  }
  return first("MAIN")?.id ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "2일 03:12:05", or "00:59:09" under a day. Clamped at zero: the page refreshes on its own
// when the timer runs out, and a negative reading in between would look broken.
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}일 ${clock}` : clock;
}

const EVENT_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const EVENT_DATE_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// The server runs in UTC; the group lives in Seoul.
export function formatEventDate(date: Date): string {
  return EVENT_DATE_PARTS.format(date).replace(/-/g, ".");
}

// "10.03 21:00" in Seoul time, for a scheduled reveal.
export function formatEventDateTime(date: Date): string {
  const parts = Object.fromEntries(EVENT_DATE_TIME_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
