/**
 * Calendar dates of a weekly event series. This is pure calendar arithmetic on "YYYY-MM-DD"
 * strings (computed in UTC, so no time zone or DST can shift a day); the Warsaw conversion of each
 * date + time happens later, in the service.
 */

/** Longest allowed series: `to` may be at most this many days after `from`. */
export const MAX_SERIES_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a UTC midnight timestamp. */
function isoWeekday(dayMs: number): number {
  const day = new Date(dayMs).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Every date from `from` to `to` (both included, "YYYY-MM-DD", `from` ≤ `to`) that falls on the
 * ISO `weekday` (1 = Monday … 7 = Sunday), ascending.
 */
export function weeklyDates(from: string, to: string, weekday: number): string[] {
  const fromMs = parseDate(from);
  const toMs = parseDate(to);
  const firstMs = fromMs + ((weekday - isoWeekday(fromMs) + 7) % 7) * DAY_MS;
  const dates: string[] = [];
  for (let dayMs = firstMs; dayMs <= toMs; dayMs += 7 * DAY_MS) {
    dates.push(new Date(dayMs).toISOString().slice(0, 10));
  }
  return dates;
}
