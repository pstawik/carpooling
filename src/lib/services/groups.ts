import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { GroupRole } from "@/types";

/** A group the current user belongs to, with their own role in it. */
export interface MyGroup {
  id: string;
  name: string;
  role: GroupRole;
}

export interface GroupAdmin {
  first_name: string;
  nick: string;
}

export interface GroupWithAdmins {
  id: string;
  name: string;
  admins: GroupAdmin[];
}

// No generated DB types: query results are read through these shapes via `unknown`.
interface MembershipRow {
  role: GroupRole;
  groups: { id: string; name: string } | null;
}

interface GroupRow {
  id: string;
  name: string;
  group_members: { user_id: string; role: GroupRole; profiles: GroupAdmin | null }[];
}

const groupIdSchema = z.uuid();

/** Groups the user is a member of (any role), ordered by name. RLS limits rows to the user's groups. */
export async function listMyGroups(supabase: SupabaseClient, userId: string): Promise<MyGroup[]> {
  const { data, error } = await supabase.from("group_members").select("role, groups(id, name)").eq("user_id", userId);
  if (error) {
    throw new Error(`listMyGroups failed: ${error.message}`);
  }
  const rows = (data as unknown as MembershipRow[] | null) ?? [];
  return rows
    .filter((row): row is MembershipRow & { groups: { id: string; name: string } } => row.groups !== null)
    .map((row) => ({ id: row.groups.id, name: row.groups.name, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/**
 * The group and its admins, or `null` when the id is malformed, the group is not visible, or the
 * user has no own membership in it. Members-only on purpose: a non-member app admin also gets
 * `null` (RLS lets them read the group but not the admins' profiles) and uses /admin/groups instead.
 */
export async function getGroupWithAdmins(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<GroupWithAdmins | null> {
  if (!groupIdSchema.safeParse(groupId).success) {
    return null;
  }
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, group_members(user_id, role, profiles(first_name, nick))")
    .eq("id", groupId)
    .maybeSingle();
  if (error) {
    throw new Error(`getGroupWithAdmins failed: ${error.message}`);
  }
  const group = data as unknown as GroupRow | null;
  if (!group?.group_members.some((member) => member.user_id === userId)) {
    return null;
  }
  const admins = group.group_members
    .flatMap((member) => (member.role === "admin" && member.profiles ? [member.profiles] : []))
    .sort((a, b) => a.first_name.localeCompare(b.first_name, "pl"));
  return { id: group.id, name: group.name, admins };
}
