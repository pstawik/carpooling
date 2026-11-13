import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { GroupChild } from "@/lib/services/children";
import type { ChildAttendance } from "@/types";

export type AttendanceWriteFailure = "forbidden" | "not_found" | "unknown";

export type AttendanceWriteResult =
  { ok: true } | { ok: false; failure: AttendanceWriteFailure; error?: PostgrestError };

/** A child's declaration for one event; a missing row is `undeclared` and counts as not going. */
export type AttendanceStatus = "going" | "not_going" | "undeclared";

export interface ChildPlanEntry extends GroupChild {
  status: AttendanceStatus;
}

export interface NotGoingEntry extends GroupChild {
  /** No declaration row: shown with the "bez deklaracji" label. */
  undeclared: boolean;
}

export interface ChildPlan {
  /** The signed-in parent's own children in the group. */
  mine: ChildPlanEntry[];
  /** Every child of the group declared as going, own children included. */
  going: GroupChild[];
  /** Every other child of the group: declared not going or without a declaration. */
  notGoing: NotGoingEntry[];
}

// No generated DB types: query results are read through this shape via `unknown`.
type AttendanceRow = Pick<ChildAttendance, "child_id" | "going">;

/** Declarations of the event as child id → going. RLS limits rows to members of its group. */
export async function listEventAttendance(supabase: SupabaseClient, eventId: string): Promise<Map<string, boolean>> {
  const { data, error } = await supabase.from("child_attendance").select("child_id, going").eq("event_id", eventId);
  if (error) {
    throw new Error(`listEventAttendance failed: ${error.message}`);
  }
  const rows = (data as unknown as AttendanceRow[] | null) ?? [];
  return new Map(rows.map((row) => [row.child_id, row.going]));
}

/**
 * Declares one child going or not going. Writes only through the `set_child_attendance` RPC: a
 * PostgREST upsert would need UPDATE on the key columns, which is not granted. The RPC raises 42501
 * for someone else's or an invisible child, a foreign group and an event that already started; a
 * child and an event from different groups break the composite foreign key (23503).
 */
export async function setChildAttendance(
  supabase: SupabaseClient,
  { eventId, childId, going }: { eventId: string; childId: string; going: boolean },
): Promise<AttendanceWriteResult> {
  const { error } = await supabase.rpc("set_child_attendance", {
    p_event_id: eventId,
    p_child_id: childId,
    p_going: going,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, failure: "forbidden", error };
    if (error.code === "23503") return { ok: false, failure: "not_found", error };
    return { ok: false, failure: "unknown", error };
  }
  return { ok: true };
}

/**
 * The event's child plan. A child without a declaration counts as not going and is flagged
 * `undeclared`. Lists keep the order of `children` (by name, as `listGroupChildren` returns them).
 */
export function buildChildPlan(children: GroupChild[], attendance: Map<string, boolean>, userId: string): ChildPlan {
  const plan: ChildPlan = { mine: [], going: [], notGoing: [] };
  for (const child of children) {
    const declared = attendance.get(child.id);
    const status: AttendanceStatus = declared === undefined ? "undeclared" : declared ? "going" : "not_going";
    if (child.parentId === userId) plan.mine.push({ ...child, status });
    if (status === "going") {
      plan.going.push(child);
    } else {
      plan.notGoing.push({ ...child, undeclared: status === "undeclared" });
    }
  }
  return plan;
}
