import { z } from "zod";
import { warsawLocalToUtc } from "@/lib/time";

// Same limit as the events note check in the database.
const EVENT_NOTE_MAX = 200;

/** Optional note; blank (or missing) becomes `null`, which the database check requires. */
export const eventNoteSchema = z
  .string()
  .trim()
  .max(EVENT_NOTE_MAX)
  .optional()
  .transform((note) => (note === undefined || note === "" ? null : note));

// Warsaw wall-clock fields as sent by <input type="date"> / <input type="time">.
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Converts the Warsaw date + time to a UTC ISO string. A non-existent local time (DST gap) or a
 * start that is not in the future fails under `starts_at`. This is a friendly pre-check only: the
 * events RLS policies compare against the database's now() and are the guarantee.
 */
function toStartsAt(date: string, time: string, ctx: z.RefinementCtx): string {
  const startsAt = warsawLocalToUtc(date, time);
  if (!startsAt || startsAt.getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Start must be a future Warsaw date and time" });
    return z.NEVER;
  }
  return startsAt.toISOString();
}

export const addEventSchema = z
  .object({ group_id: z.uuid(), date: dateField, time: timeField, note: eventNoteSchema })
  .transform(({ group_id, date, time, note }, ctx) => ({
    groupId: group_id,
    startsAt: toStartsAt(date, time, ctx),
    note,
  }));

export const updateEventSchema = z
  .object({ group_id: z.uuid(), event_id: z.uuid(), date: dateField, time: timeField, note: eventNoteSchema })
  .transform(({ group_id, event_id, date, time, note }, ctx) => ({
    groupId: group_id,
    eventId: event_id,
    startsAt: toStartsAt(date, time, ctx),
    note,
  }));

export const deleteEventSchema = z.object({
  group_id: z.uuid(),
  event_id: z.uuid(),
});

export type EventFieldErrorCode = "invalid_event_note" | "invalid_event_start";

const START_FIELDS = new Set<PropertyKey>(["date", "time", "starts_at"]);

/**
 * The form's group id and error code when only user-editable fields failed, otherwise `null`. A
 * malformed `group_id` / `event_id` means a tampered form and gets a 404; a bad date, time or note
 * is a normal user mistake that goes back to the group page. A start error wins over a note error.
 */
export function eventFieldError(
  raw: Record<string, unknown>,
  issues: z.core.$ZodIssue[],
): { groupId: string; code: EventFieldErrorCode } | null {
  if (!issues.every((issue) => START_FIELDS.has(issue.path[0]) || issue.path[0] === "note")) return null;
  const groupId = z.uuid().safeParse(raw.group_id);
  if (!groupId.success) return null;
  const code = issues.some((issue) => START_FIELDS.has(issue.path[0])) ? "invalid_event_start" : "invalid_event_note";
  return { groupId: groupId.data, code };
}
