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
// Four-digit years from 1000 (same bound as warsawLocalToUtc).
const dateField = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/);
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Converts the Warsaw date + time to a UTC ISO string. A non-existent local time (DST gap) or a
 * start that is not in the future fails under `starts_at`. This is a friendly pre-check only: the
 * events RLS policies compare against the database's now() and are the guarantee.
 */
// RLS checks starts_at > now() on the database clock a moment after this runs. Demanding a minute
// of margin here keeps a start right at the boundary from passing zod and then failing RLS with
// 42501, which the endpoints answer with a 404 instead of a friendly error.
const START_MARGIN_MS = 60 * 1000;

function futureStart(date: string, time: string): Date | null {
  const startsAt = warsawLocalToUtc(date, time);
  return startsAt && startsAt.getTime() > Date.now() + START_MARGIN_MS ? startsAt : null;
}

function addStartIssue(ctx: z.RefinementCtx) {
  ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Start must be a future Warsaw date and time" });
}

function toStartsAt(date: string, time: string, ctx: z.RefinementCtx): string {
  const startsAt = futureStart(date, time);
  if (!startsAt) {
    addStartIssue(ctx);
    return z.NEVER;
  }
  return startsAt.toISOString();
}

/**
 * The start check also runs when another field (e.g. an over-long note) has failed, so that
 * `eventFieldError` sees the start issue and reports it first. It only needs well-formed date and time.
 */
const startCheckOptions = {
  when: (payload: z.core.ParsePayload) => {
    const value = payload.value as { date?: unknown; time?: unknown } | null;
    return dateField.safeParse(value?.date).success && timeField.safeParse(value?.time).success;
  },
};

function checkStart({ date, time }: { date: string; time: string }, ctx: z.RefinementCtx) {
  if (!futureStart(date, time)) addStartIssue(ctx);
}

export const addEventSchema = z
  .object({ group_id: z.uuid(), date: dateField, time: timeField, note: eventNoteSchema })
  .superRefine(checkStart, startCheckOptions)
  .transform(({ group_id, date, time, note }, ctx) => ({
    groupId: group_id,
    startsAt: toStartsAt(date, time, ctx),
    note,
  }));

export const updateEventSchema = z
  .object({ group_id: z.uuid(), event_id: z.uuid(), date: dateField, time: timeField, note: eventNoteSchema })
  .superRefine(checkStart, startCheckOptions)
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
