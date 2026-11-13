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

/** Child row from `public.children`; readable by group members, writable only by the owning parent. */
export interface Child {
  id: string;
  group_id: string;
  parent_id: string;
  name: string;
  created_at: string;
}

/**
 * Event (termin) row from `public.events`; readable by group members, inserted, edited and deleted
 * only by the group's admins, and only while `starts_at` is in the future (RLS). Named `GroupEvent`
 * so it does not shadow the DOM `Event`.
 */
export interface GroupEvent {
  id: string;
  group_id: string;
  /** Start moment as an ISO timestamp (timestamptz); entered and shown in Europe/Warsaw. */
  starts_at: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
