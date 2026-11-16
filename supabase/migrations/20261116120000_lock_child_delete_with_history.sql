-- Lock child delete with history (S-09, FR-017): a parent may no longer delete
-- a child who has a declaration (going or not going) on an event that has
-- already started. Deleting such a child would remove those declarations by
-- cascade (child_attendance_child_fkey is on delete cascade) and with them the
-- child's history in the engagement statistics.
-- This closes the "Accepted exception to the lock" described in
-- 20261113120000_create_child_attendance.sql: children_delete_own had no time
-- condition. A child whose declarations are all on future events (or who has
-- none) can still be deleted, and those future declarations go by cascade.
-- Deleting the group or the parent's profile still removes children with
-- history: referential actions bypass RLS, so this policy does not apply to
-- them (a trigger would block them too, hence a policy).
-- A DELETE the policy rejects matches 0 rows instead of raising; the service
-- tells "has history" apart from "not yours / no such child" with a follow-up
-- read.

-- In the exists subquery the child row's id is qualified with children: an
-- unqualified id would bind to a column of the subquery and break the check.
alter policy children_delete_own
  on public.children
  using (
    parent_id = (select auth.uid())
    and public.is_group_member(group_id)
    and not exists (
      select 1
      from public.child_attendance ca
      join public.events e on e.id = ca.event_id
      where ca.child_id = children.id
        and e.starts_at <= now()
    )
  );
