/** Parent profile row from `public.profiles`, created by the signup trigger. */
export interface Profile {
  id: string;
  first_name: string;
  nick: string;
  phone: string | null;
  created_at: string;
}

/** Group row from `public.groups`; created only via the `create_group` RPC. */
export interface Group {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export type GroupRole = "admin" | "member";

/** Membership row from `public.group_members`. */
export interface GroupMembership {
  group_id: string;
  user_id: string;
  role: GroupRole;
  created_at: string;
}

/** Row returned by the app-admin-only `admin_list_groups` RPC (the only path exposing e-mails). */
export interface AdminGroupRow {
  id: string;
  name: string;
  created_at: string;
  admins: { first_name: string; nick: string; email: string }[];
}
