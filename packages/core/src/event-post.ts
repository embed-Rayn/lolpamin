// Mirrors the Prisma enum EventImageKind as a string union so core stays free of
// another @lolpamin/db dependency; the Prisma values are assignable to it.
export type EventImageKindName = "MAIN" | "HIDDEN";

// A HIDDEN image stays invisible (not even a placeholder) until the post is revealed.
// Admins always see it so they can check it before pressing 공개.
export function canViewEventImage(
  image: { kind: EventImageKindName; revealedAt: Date | null },
  isAdmin: boolean,
): boolean {
  return image.kind === "MAIN" || image.revealedAt !== null || isAdmin;
}

// The list shows what a visitor would see, admins included: a revealed hidden image
// leads (it goes to the top of the post), otherwise the first main image.
export function pickEventThumbnailId(
  images: { id: string; kind: EventImageKindName; position: number }[],
  revealed: boolean,
): string | null {
  const first = (kind: EventImageKindName) =>
    images.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position)[0];
  if (revealed) {
    const hidden = first("HIDDEN");
    if (hidden) return hidden.id;
  }
  return first("MAIN")?.id ?? null;
}

const EVENT_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The server runs in UTC; the group lives in Seoul.
export function formatEventDate(date: Date): string {
  return EVENT_DATE_PARTS.format(date).replace(/-/g, ".");
}
