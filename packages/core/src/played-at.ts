// GameResult.playedAt. Replays carry no wall-clock time, so the import form defaults to the
// file's lastModified and sends the full instant. Games imported before that were sent as a
// bare date and stored at UTC midnight, which Seoul reads as a made-up 09:00 — those show
// the date alone. Everything renders in Seoul time so the server's (UTC) render and the
// browser's agree.

const SEOUL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoulParts(date: Date): Record<string, string> {
  return Object.fromEntries(SEOUL_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
}

function isBareDate(date: Date): boolean {
  return (
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
  );
}

export function formatPlayedAt(date: Date): string {
  const p = seoulParts(date);
  return isBareDate(date) ? `${p.month}-${p.day}` : `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// The value <input type="datetime-local"> takes, in Seoul time whatever the browser's zone.
export function toSeoulDateTimeInput(date: Date): string {
  const p = seoulParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Back from the form: "YYYY-MM-DDTHH:mm" in Seoul time. null for anything else — a bare date
// would bring the fake 09:00 back.
export function parseSeoulDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime()) || toSeoulDateTimeInput(date) !== value) return null;
  return date;
}

// The Seoul calendar year holding `now`, as a half-open instant range [start, end) — the
// /player-stats "2026년" filter. Seoul has no DST, so the year starts at 15:00 UTC the day before.
export function seoulYearRange(now: Date): { year: number; start: Date; end: Date } {
  const year = Number(seoulParts(now).year);
  return {
    year,
    start: new Date(`${year}-01-01T00:00:00+09:00`),
    end: new Date(`${year + 1}-01-01T00:00:00+09:00`),
  };
}
