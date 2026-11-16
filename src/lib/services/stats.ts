import type { SupabaseClient } from "@supabase/supabase-js";

/** Drives of one member over the group's finished events (FR-017). */
export interface DriverStat {
  userId: string;
  /** `null` only if the member's profile is not visible, which RLS should not allow for a member. */
  nick: string | null;
  drives: number;
}

/** Presence and absence of one child over the group's finished events since the child was added. */
export interface ChildStat {
  childId: string;
  name: string;
  /** `null` only if the parent's profile is not visible, which RLS should not allow for a member. */
  parentNick: string | null;
  present: number;
  /** Explicit "not going" and "no declaration" together. */
  absent: number;
}

export interface GroupStats {
  drivers: DriverStat[];
  children: ChildStat[];
}

// No generated DB types: RPC results are read through these shapes via `unknown`.
interface DriverStatRow {
  user_id: string;
  nick: string | null;
  drives: number;
}

interface ChildStatRow {
  child_id: string;
  name: string;
  parent_nick: string | null;
  present: number;
  absent: number;
}

/**
 * Number of the group's events that started at or before `now` (count only, no rows fetched).
 * RLS limits it to members, like the stats functions.
 */
export async function countFinishedEvents(supabase: SupabaseClient, groupId: string, now: Date): Promise<number> {
  const { count, error } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .lte("starts_at", now.toISOString());
  if (error) {
    throw new Error(`countFinishedEvents failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * The group's engagement statistics, counted in the database by `group_driver_stats` and
 * `group_child_stats` (security invoker, so RLS limits them to members: a non-member gets empty
 * lists). Drivers are ordered by nick, children by name.
 */
export async function getGroupStats(supabase: SupabaseClient, groupId: string): Promise<GroupStats> {
  const [driversResult, childrenResult] = await Promise.all([
    supabase.rpc("group_driver_stats", { p_group_id: groupId }),
    supabase.rpc("group_child_stats", { p_group_id: groupId }),
  ]);
  if (driversResult.error) {
    throw new Error(`group_driver_stats failed: ${driversResult.error.message}`);
  }
  if (childrenResult.error) {
    throw new Error(`group_child_stats failed: ${childrenResult.error.message}`);
  }

  const driverRows = (driversResult.data as unknown as DriverStatRow[] | null) ?? [];
  const childRows = (childrenResult.data as unknown as ChildStatRow[] | null) ?? [];

  const drivers = driverRows
    .map((row) => ({ userId: row.user_id, nick: row.nick, drives: row.drives }))
    .sort((a, b) => (a.nick ?? "").localeCompare(b.nick ?? "", "pl"));
  const children = childRows
    .map((row) => ({
      childId: row.child_id,
      name: row.name,
      parentNick: row.parent_nick,
      present: row.present,
      absent: row.absent,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));

  return { drivers, children };
}
