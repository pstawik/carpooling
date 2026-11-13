import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
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
