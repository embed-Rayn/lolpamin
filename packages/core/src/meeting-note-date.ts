import { toSeoulDateTimeInput } from "./played-at";

// A meeting date is a calendar day, stored as UTC midnight so it reads the same in any zone.
// Unlike playedAt it never carries a time.

export function parseMeetingDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  // 2026-02-30 parses to March 2nd; the round trip catches it.
  if (Number.isNaN(date.getTime()) || toMeetingDateInput(date) !== value) return null;
  return date;
}

export function toMeetingDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatMeetingDate(date: Date): string {
  return toMeetingDateInput(date).replace(/-/g, ".");
}

// The new-note form's default.
export function seoulTodayInput(now: Date): string {
  return toSeoulDateTimeInput(now).slice(0, 10);
}
