import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { warsawLocalToUtc } from "@/lib/time";
import { START_MARGIN_MS } from "@/lib/validation/events";
import type { GroupEvent } from "@/types";

/** An event of the group as shown on the group page. */
export interface GroupEventItem {
  id: string;
  /** ISO timestamp; format with `formatEventStart` from `@/lib/time`. */
  startsAt: string;
  note: string | null;
}

export type EventWriteFailure = "forbidden" | "duplicate_event" | "event_not_found" | "unknown";

export type EventWriteResult = { ok: true } | { ok: false; failure: EventWriteFailure; error?: PostgrestError };

// No generated DB types: query results are read through this shape via `unknown`.
type EventRow = Pick<GroupEvent, "id" | "starts_at" | "note">;

const idSchema = z.uuid();

/**
 * RLS turns a refused INSERT, or an UPDATE whose new start is not in the future, into 42501. An
 * UPDATE or DELETE on a row the caller may not write (non-admin, foreign group, already started)
 * simply matches 0 rows, so callers ask for `.select("id")` and pass the returned rows here: an
 * empty result is reported as `event_not_found`.
 */
function writeResult(error: PostgrestError | null, rows?: unknown[] | null): EventWriteResult {
  if (error) {
    if (error.code === "42501") return { ok: false, failure: "forbidden", error };
    if (error.code === "23505") return { ok: false, failure: "duplicate_event", error };
    return { ok: false, failure: "unknown", error };
  }
  if (rows !== undefined && (rows ?? []).length === 0) return { ok: false, failure: "event_not_found" };
  return { ok: true };
}

/** All events of the group, ascending by start. RLS limits rows to members. */
export async function listGroupEvents(supabase: SupabaseClient, groupId: string): Promise<GroupEventItem[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, starts_at, note")
    .eq("group_id", groupId)
    .order("starts_at", { ascending: true });
  if (error) {
    throw new Error(`listGroupEvents failed: ${error.message}`);
  }
  const rows = (data as unknown as EventRow[] | null) ?? [];
  return rows.map((row) => ({ id: row.id, startsAt: row.starts_at, note: row.note }));
}

/**
 * One event of the group, or `null` when either id is malformed, the event belongs to another
 * group, or it is not visible (RLS limits rows to members). Throws on a query error.
 */
export async function getGroupEvent(
  supabase: SupabaseClient,
  groupId: string,
  eventId: string,
): Promise<GroupEventItem | null> {
  if (!idSchema.safeParse(groupId).success || !idSchema.safeParse(eventId).success) {
    return null;
  }
  const { data, error } = await supabase
    .from("events")
    .select("id, starts_at, note")
    .eq("id", eventId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) {
    throw new Error(`getGroupEvent failed: ${error.message}`);
  }
  const row: EventRow | null = data;
  return row ? { id: row.id, startsAt: row.starts_at, note: row.note } : null;
}

/**
 * Whether the event has started at `now`, which locks its declarations. The complement of
 * `splitEvents`' "upcoming": pass the same one `now` per request.
 */
export function hasStarted(event: GroupEventItem, now: Date): boolean {
  return Date.parse(event.startsAt) <= now.getTime();
}

/**
 * Upcoming events (start after `now`, the same moment that locks declarations) ascending, and
 * past ones newest first. Pass one `now` per request so every row is judged against the same time.
 */
export function splitEvents(
  events: GroupEventItem[],
  now: Date,
): { upcoming: GroupEventItem[]; past: GroupEventItem[] } {
  const nowMs = now.getTime();
  const byStart = (a: GroupEventItem, b: GroupEventItem) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const upcoming = events.filter((event) => Date.parse(event.startsAt) > nowMs).sort(byStart);
  const past = events.filter((event) => Date.parse(event.startsAt) <= nowMs).sort((a, b) => byStart(b, a));
  return { upcoming, past };
}

/** `startsAt` must be an ISO string with an explicit offset: the PostgREST session runs in UTC. */
export async function addEvent(
  supabase: SupabaseClient,
  { groupId, startsAt, note }: { groupId: string; startsAt: string; note: string | null },
): Promise<EventWriteResult> {
  // created_by is filled by the column default (auth.uid()); RLS rejects any other value.
  const { error } = await supabase.from("events").insert({ group_id: groupId, starts_at: startsAt, note });
  return writeResult(error);
}

export type EventGenerateResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; failure: EventWriteFailure | "no_future_start"; error?: PostgrestError };

/**
 * Creates one event per Warsaw `date` at `time`, in a single statement. Dates whose start does not
 * exist (DST gap) or is not at least `START_MARGIN_MS` after `now` are dropped first: RLS rejects
 * the whole batch with 42501 if any row starts in the past. Starts that already have an event in
 * the group are skipped by ON CONFLICT DO NOTHING. `skipped` counts every date not created.
 * When no start survives the filter there is nothing to insert, so the database (and with it RLS)
 * is never asked; that is reported as `no_future_start`, a form mistake, rather than as success.
 */
export async function generateEvents(
  supabase: SupabaseClient,
  { groupId, dates, time, now }: { groupId: string; dates: string[]; time: string; now: Date },
): Promise<EventGenerateResult> {
  const earliestMs = now.getTime() + START_MARGIN_MS;
  // created_by and note take their column defaults (auth.uid() and null).
  const rows = dates
    .map((date) => warsawLocalToUtc(date, time))
    .filter((startsAt): startsAt is Date => startsAt !== null && startsAt.getTime() > earliestMs)
    .map((startsAt) => ({ group_id: groupId, starts_at: startsAt.toISOString() }));
  if (rows.length === 0) return { ok: false, failure: "no_future_start" };

  const { data, error } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "group_id,starts_at", ignoreDuplicates: true })
    .select("id");
  const result = writeResult(error);
  if (!result.ok) return result;
  const created = (data ?? []).length;
  return { ok: true, created, skipped: dates.length - created };
}

export async function updateEvent(
  supabase: SupabaseClient,
  { groupId, eventId, startsAt, note }: { groupId: string; eventId: string; startsAt: string; note: string | null },
): Promise<EventWriteResult> {
  const { data, error } = await supabase
    .from("events")
    .update({ starts_at: startsAt, note })
    .eq("id", eventId)
    .eq("group_id", groupId)
    .select("id");
  return writeResult(error, data);
}

export async function deleteEvent(
  supabase: SupabaseClient,
  { groupId, eventId }: { groupId: string; eventId: string },
): Promise<EventWriteResult> {
  const { data, error } = await supabase.from("events").delete().eq("id", eventId).eq("group_id", groupId).select("id");
  return writeResult(error, data);
}
