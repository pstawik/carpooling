-- Delete future declarations on member removal (PRD "Usunięcie z grupy"):
-- when a member leaves a group (their public.group_members row is deleted),
-- their driver declarations and their children's attendance declarations on
-- the group's future events are deleted, so a removed driver no longer adds
-- seats and a removed parent's children no longer count as going. Declarations
-- on events that already started stay, and with them the engagement
-- statistics history.
-- "Future" is exactly starts_at > now(), the same condition the write
-- policies of child_attendance and event_drivers use; its complement
-- starts_at <= now() is "started". An event starting at the moment of removal
-- is therefore left untouched.
-- Only declarations in the group the member left are touched: the same person's
-- declarations in their other groups stay. Children rows themselves stay (the
-- child belongs to the parent, not to the membership).
-- security definer: the trigger must delete rows the caller cannot. Members
-- are removed through security definer paths or as owner, and child_attendance
-- has no DELETE policy at all, so a security invoker function would silently
-- delete nothing. search_path is empty and every name is schema-qualified.
-- The function is a trigger only: execute is revoked from every client role.
-- Idempotent under cascades: deleting a profile or a group removes its
-- group_members rows by cascade, while the declarations may already be gone or
-- be going by the same cascade. Both deletes are plain "delete ... where", which
-- match zero rows without raising.
-- No new tables, so no new policies; existing policies are unchanged.

create function public.delete_future_declarations_of_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_drivers d
  using public.events e
  where e.id = d.event_id
    and d.group_id = old.group_id
    and d.user_id = old.user_id
    and e.starts_at > now();

  delete from public.child_attendance ca
  using public.children c, public.events e
  where c.id = ca.child_id
    and e.id = ca.event_id
    and ca.group_id = old.group_id
    and c.parent_id = old.user_id
    and e.starts_at > now();

  return old;
end;
$$;

revoke execute on function public.delete_future_declarations_of_member() from public, anon, authenticated;

create trigger group_members_delete_future_declarations
  after delete on public.group_members
  for each row
  execute function public.delete_future_declarations_of_member();
