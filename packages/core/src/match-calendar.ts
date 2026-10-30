// `type` is load-bearing — a value import would boot the Prisma client (see lane.ts).
import type { GameMode } from "@lolpamin/db";

// /match-calendar and /match-history's date filter. A day is a Seoul *game day*: the group
// plays in Seoul, and the server renders in UTC. Seoul has no DST, so +09:00 always holds.
//
// A game day runs from GAME_DAY_START_HOUR to the same hour the next morning, not midnight to
// midnight. A night's 내전 often runs past 12, and a replay carries no start time — playedAt
// defaults to the file's lastModified, which is when the game ended — so a midnight boundary
// filed the night's last games under the next day.
export const GAME_DAY_START_HOUR = 6;
const GAME_DAY_OFFSET_MS = GAME_DAY_START_HOUR * 3_600_000;
const START_TIME = `T${String(GAME_DAY_START_HOUR).padStart(2, "0")}:00:00+09:00`;

const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of the Seoul calendar day holding `date`. */
export function seoulDateKey(date: Date): string {
  return SEOUL_DATE.format(date);
}

/** "YYYY-MM-DD" of the game day holding `date`: before GAME_DAY_START_HOUR is still yesterday. */
export function gameDayKey(date: Date): string {
  return seoulDateKey(new Date(date.getTime() - GAME_DAY_OFFSET_MS));
}

/** A real "YYYY-MM-DD" day, or null. Values come from the URL. */
export function parseDateKey(value: string | undefined): string | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return !Number.isNaN(date.getTime()) && seoulDateKey(date) === value ? value : null;
}

/** The game day as a half-open instant range [start, end). */
export function gameDayRange(key: string): { start: Date; end: Date } {
  const start = new Date(`${key}${START_TIME}`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export interface YearMonth {
  year: number;
  month: number; // 1–12
}

// The month of the current game day, so at 01:00 on the 1st last night's games are still
// "this month".
function currentSeoulMonth(now: Date): YearMonth {
  const [year, month] = gameDayKey(now).split("-").map(Number);
  return { year, month };
}

const monthIndex = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);

/**
 * "YYYY-MM" from the URL. Anything unreadable — or a month that has not started yet, which
 * can only ever be empty — falls back to the current Seoul month.
 */
export function parseMonthKey(value: string | undefined, now: Date): YearMonth {
  const current = currentSeoulMonth(now);
  const match = value === undefined ? null : /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return current;
  const parsed = { year: Number(match[1]), month: Number(match[2]) };
  if (parsed.month < 1 || parsed.month > 12) return current;
  return monthIndex(parsed) > monthIndex(current) ? current : parsed;
}

export function monthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = monthIndex(ym) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return monthIndex(a) === monthIndex(b);
}

export function currentMonth(now: Date): YearMonth {
  return currentSeoulMonth(now);
}

/** The month's game days as a half-open instant range [start, end). */
export function gameMonthRange(ym: YearMonth): { start: Date; end: Date } {
  const next = shiftMonth(ym, 1);
  return {
    start: new Date(`${monthKey(ym)}-01${START_TIME}`),
    end: new Date(`${monthKey(next)}-01${START_TIME}`),
  };
}

// Past this many games a day's dots stop being countable at a glance; the cell shows the
// number instead.
export const CALENDAR_DOT_LIMIT = 8;

/**
 * 0–4 by the day's game count. Absolute steps, not relative to the month's busiest day: the
 * page is shown to outsiders, and a quiet month should look quiet rather than have its one
 * two-game evening painted as hot as a seven-game night.
 */
export function calendarHeatLevel(total: number): 0 | 1 | 2 | 3 | 4 {
  if (total === 0) return 0;
  if (total <= 2) return 1;
  if (total <= 4) return 2;
  if (total <= 6) return 3;
  return 4;
}

export interface CalendarDay {
  key: string;
  day: number;
  rift: number;
  aram: number;
  total: number;
  heat: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export interface MonthCalendar {
  // Sunday-first weeks of seven; null pads the days outside the month.
  weeks: Array<Array<CalendarDay | null>>;
  summary: { total: number; rift: number; aram: number; activeDays: number };
}

export function buildMonthCalendar(
  ym: YearMonth,
  games: ReadonlyArray<{ playedAt: Date; mode: GameMode }>,
  todayKey: string,
): MonthCalendar {
  const prefix = `${monthKey(ym)}-`;
  const counts = new Map<string, { rift: number; aram: number }>();
  for (const game of games) {
    const key = gameDayKey(game.playedAt);
    if (!key.startsWith(prefix)) continue;
    const tally = counts.get(key) ?? { rift: 0, aram: 0 };
    if (game.mode === "ARAM") tally.aram += 1;
    else tally.rift += 1;
    counts.set(key, tally);
  }

  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  const cells: Array<CalendarDay | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${prefix}${String(day).padStart(2, "0")}`;
    const { rift, aram } = counts.get(key) ?? { rift: 0, aram: 0 };
    const total = rift + aram;
    cells.push({ key, day, rift, aram, total, heat: calendarHeatLevel(total), isToday: key === todayKey });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<CalendarDay | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const days = cells.filter((c): c is CalendarDay => c !== null);
  const rift = days.reduce((sum, d) => sum + d.rift, 0);
  const aram = days.reduce((sum, d) => sum + d.aram, 0);
  return {
    weeks,
    summary: { total: rift + aram, rift, aram, activeDays: days.filter((d) => d.total > 0).length },
  };
}
