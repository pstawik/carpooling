/**
 * Event dates and times are Europe/Warsaw (issue #14), while the Worker and Postgres run in UTC.
 * Every conversion between the admin's local date + time and a stored `timestamptz` goes through
 * here. The offset is looked up per instant (CET +1 / CEST +2), never assumed.
 */
export const APP_TIME_ZONE = "Europe/Warsaw";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// en-CA with h23 gives stable numeric parts ("00".."23", never "24").
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateLabelFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

interface WarsawParts {
  date: string;
  time: string;
}

function warsawParts(instant: Date): WarsawParts {
  const part: Record<string, string> = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) part[type] = value;
  return { date: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` };
}

/** Warsaw's offset from UTC (ms) at the given instant. */
function warsawOffsetMs(instantMs: number): number {
  const { date, time } = warsawParts(new Date(instantMs));
  return Date.parse(`${date}T${time}:00Z`) - Math.floor(instantMs / 60000) * 60000;
}

/**
 * The UTC instant of a Warsaw wall-clock `date` ("YYYY-MM-DD") and `time` ("HH:MM"). Returns
 * `null` for an impossible date (e.g. 2026-02-30) or a time inside the spring-forward gap; an
 * ambiguous autumn time (it occurs twice) resolves to the earlier instant (CEST).
 */
export function warsawLocalToUtc(date: string, time: string): Date | null {
  // Years 1000-9999 only: Intl prints earlier years with fewer digits, which Date.parse rejects.
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const wallAsUtc = Date.parse(`${date}T${time}:00Z`);
  // Date.parse rolls 2026-02-30 over to March; a round trip catches it.
  if (Number.isNaN(wallAsUtc) || new Date(wallAsUtc).toISOString().slice(0, 10) !== date) return null;

  // The offsets in force a day either side cover both sides of any DST change.
  // Near the edges of the supported range (e.g. 9999-12-31) Intl yields a year that Date.parse
  // rejects, so an offset can be NaN; drop it rather than let new Date(NaN) throw below.
  const offsets = new Set(
    [warsawOffsetMs(wallAsUtc - DAY_MS), warsawOffsetMs(wallAsUtc + DAY_MS)].filter(Number.isFinite),
  );
  const matches = [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((candidate) => {
      const parts = warsawParts(new Date(candidate));
      return parts.date === date && parts.time === time;
    })
    .sort((a, b) => a - b);
  return matches.length > 0 ? new Date(matches[0]) : null;
}

/** Warsaw wall-clock date ("YYYY-MM-DD") and time ("HH:MM") of an ISO timestamp, e.g. to prefill a form. */
export function utcToWarsawParts(iso: string): WarsawParts {
  return warsawParts(new Date(iso));
}

/** An event start for display, in Warsaw: "wtorek, 17 listopada 2026, 17:00". */
export function formatEventStart(iso: string): string {
  const instant = new Date(iso);
  return `${dateLabelFormatter.format(instant)}, ${warsawParts(instant).time}`;
}
