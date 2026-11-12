import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The group's current invite token, or `null` when none was generated yet. RLS returns the row only
 * to the group's admins, so for anyone else this is `null` too.
 */
export async function getGroupInviteToken(supabase: SupabaseClient, groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("group_invites")
    .select("token")
    .eq("group_id", groupId)
    .maybeSingle<{ token: string }>();
  if (error) {
    throw new Error(`getGroupInviteToken failed: ${error.message}`);
  }
  return data?.token ?? null;
}
