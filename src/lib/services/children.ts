import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/** A child of the group as shown on the group page. */
export interface GroupChild {
  id: string;
  name: string;
  parentId: string;
  /** `null` only if the parent's profile is not visible, which RLS should not allow for a member. */
  parentNick: string | null;
}

export type ChildWriteFailure = "forbidden" | "duplicate_child" | "child_not_found" | "unknown";

export type ChildWriteResult = { ok: true } | { ok: false; failure: ChildWriteFailure; error?: PostgrestError };

// No generated DB types: query results are read through this shape via `unknown`.
interface ChildRow {
  id: string;
  name: string;
  parent_id: string;
  profiles: { nick: string } | null;
}

/**
 * RLS turns a write on someone else's child into an error only for INSERT (42501). UPDATE and
 * DELETE on a row the caller may not write simply match 0 rows, so callers ask for `.select("id")`
 * and pass the returned rows here: an empty result is reported as `child_not_found`.
 */
function writeResult(error: PostgrestError | null, rows?: unknown[] | null): ChildWriteResult {
  if (error) {
    if (error.code === "42501") return { ok: false, failure: "forbidden", error };
    if (error.code === "23505") return { ok: false, failure: "duplicate_child", error };
    return { ok: false, failure: "unknown", error };
  }
  if (rows !== undefined && (rows ?? []).length === 0) return { ok: false, failure: "child_not_found" };
  return { ok: true };
}

/** All children of the group with their parent's nick, ordered by name. RLS limits rows to members. */
export async function listGroupChildren(supabase: SupabaseClient, groupId: string): Promise<GroupChild[]> {
  const { data, error } = await supabase
    .from("children")
    .select("id, name, parent_id, profiles(nick)")
    .eq("group_id", groupId);
  if (error) {
    throw new Error(`listGroupChildren failed: ${error.message}`);
  }
  const rows = (data as unknown as ChildRow[] | null) ?? [];
  return rows
    .map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id, parentNick: row.profiles?.nick ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export async function addChild(
  supabase: SupabaseClient,
  { groupId, parentId, name }: { groupId: string; parentId: string; name: string },
): Promise<ChildWriteResult> {
  const { error } = await supabase.from("children").insert({ group_id: groupId, parent_id: parentId, name });
  return writeResult(error);
}

export async function renameChild(
  supabase: SupabaseClient,
  { groupId, childId, name }: { groupId: string; childId: string; name: string },
): Promise<ChildWriteResult> {
  const { data, error } = await supabase
    .from("children")
    .update({ name })
    .eq("id", childId)
    .eq("group_id", groupId)
    .select("id");
  return writeResult(error, data);
}

export async function deleteChild(
  supabase: SupabaseClient,
  { groupId, childId }: { groupId: string; childId: string },
): Promise<ChildWriteResult> {
  const { data, error } = await supabase
    .from("children")
    .delete()
    .eq("id", childId)
    .eq("group_id", groupId)
    .select("id");
  return writeResult(error, data);
}
