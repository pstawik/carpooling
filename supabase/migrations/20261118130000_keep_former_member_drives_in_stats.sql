-- Former members' drives stay in the driver statistics (FR-017). PRD Access
-- Control: "deklaracje na przyszłe terminy są usuwane; deklaracje z
-- zakończonych terminów zostają w statystykach". The removal trigger already
-- keeps a removed member's event_drivers rows on started events, but
-- group_driver_stats listed only current members, so those drives vanished.
-- Drivers listed now: every current member (also with 0 drives) plus every
-- former member with at least one counted drive. A former member with 0
-- drives is not listed. The drive definition is unchanged: an event_drivers
-- row on a finished event of the group (starts_at <= now()) on which at least
-- one child had going = true, each event counted once.
-- A former member's event_drivers rows stay readable to members (the select
-- policy is group-based), but their profile usually is not
-- (profiles_select_group_peers needs a shared group), so their nick is
-- usually null and the view shows the "Członek grupy" fallback.

create or replace function public.group_driver_stats(p_group_id uuid)
returns table (user_id uuid, nick text, drives integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.user_id,
    p.nick,
    c.drives
  from (
    select
      candidates.user_id,
      (
        select count(*)
        from public.events e
        where e.group_id = p_group_id
          and e.starts_at <= now()
          and exists (
            select 1 from public.event_drivers ed
            where ed.event_id = e.id
              and ed.user_id = candidates.user_id
          )
          and exists (
            select 1 from public.child_attendance ca
            where ca.event_id = e.id
              and ca.going
          )
      )::integer as drives
    from (
      -- union (not union all) makes the set distinct: a member with driver
      -- rows appears once.
      select gm.user_id
      from public.group_members gm
      where gm.group_id = p_group_id
      union
      select ed.user_id
      from public.event_drivers ed
      where ed.group_id = p_group_id
    ) candidates
  ) c
  left join public.profiles p on p.id = c.user_id
  where (
      c.drives > 0
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = p_group_id
          and gm.user_id = c.user_id
      )
    )
    -- An app admin outside the group can read its group_members but not its
    -- events, so without this check they would get every member with 0 drives.
    and (select public.is_group_member(p_group_id));
$$;

revoke execute on function public.group_driver_stats(uuid) from public, anon;
grant execute on function public.group_driver_stats(uuid) to authenticated;
