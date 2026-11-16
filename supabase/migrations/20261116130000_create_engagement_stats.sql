-- Engagement statistics (S-09, FR-017): ready-made counts for one group over
-- its finished events. "Finished" is the same instant as the declaration lock:
-- starts_at <= now() (PRD: Zakończenie terminu), on the database clock.
-- Counting rules:
--   * a drive is an event_drivers row of the member on a finished event of the
--     group on which at least one child had going = true; a driver declaration
--     on an event where no child went does not count, and each event counts
--     once however many children went;
--   * a child's range is the group's finished events with
--     starts_at >= children.created_at, so events before the child was added
--     never count against them;
--   * presence is going = true within the range, and absence is the rest of
--     the range (explicit "not going" and "no declaration" together).
-- Both functions are read-only and run as the caller, so the select policies
-- of group_members, profiles, children, events, event_drivers and
-- child_attendance decide what is counted: a caller outside the group gets 0
-- rows, not an error. They return one row per member / per child, so the
-- response does not grow with the number of events. Sorting and wording are
-- left to the application.

-- ---------------------------------------------------------------------------
-- Drives per member
-- ---------------------------------------------------------------------------

-- One row per current member (members with no drives get 0), returned only to
-- members of the group. nick comes from profiles through
-- profiles_select_group_peers; the left join keeps the member even if the
-- profile is not visible.
create function public.group_driver_stats(p_group_id uuid)
returns table (user_id uuid, nick text, drives integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    gm.user_id,
    p.nick,
    (
      select count(*)
      from public.events e
      where e.group_id = p_group_id
        and e.starts_at <= now()
        and exists (
          select 1 from public.event_drivers ed
          where ed.event_id = e.id
            and ed.user_id = gm.user_id
        )
        and exists (
          select 1 from public.child_attendance ca
          where ca.event_id = e.id
            and ca.going
        )
    )::integer as drives
  from public.group_members gm
  left join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    -- An app admin outside the group can read its group_members but not its
    -- events, so without this check they would get every member with 0 drives.
    and (select public.is_group_member(p_group_id));
$$;

revoke execute on function public.group_driver_stats(uuid) from public, anon;
grant execute on function public.group_driver_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Presence and absence per child
-- ---------------------------------------------------------------------------

-- One row per child of the group. The left joins keep a child with an empty
-- range (0 / 0); a missing child_attendance row in the range is an absence.
create function public.group_child_stats(p_group_id uuid)
returns table (child_id uuid, name text, parent_nick text, present integer, absent integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id as child_id,
    c.name,
    p.nick as parent_nick,
    (count(*) filter (where ca.going))::integer as present,
    (count(e.id) - count(*) filter (where ca.going))::integer as absent
  from public.children c
  left join public.profiles p on p.id = c.parent_id
  left join public.events e
    on e.group_id = c.group_id
    and e.starts_at <= now()
    and e.starts_at >= c.created_at
  left join public.child_attendance ca
    on ca.event_id = e.id
    and ca.child_id = c.id
  where c.group_id = p_group_id
  group by c.id, c.name, p.nick;
$$;

revoke execute on function public.group_child_stats(uuid) from public, anon;
grant execute on function public.group_child_stats(uuid) to authenticated;
