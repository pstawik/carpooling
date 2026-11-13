-- Event drivers (S-08, FR-015): a group member's declaration that they drive
-- to one event, with the number of seats for children in their car. Every
-- member of the group reads all driver declarations of its events (with the
-- driver's nick and phone through profiles_select_group_peers); only the
-- member themself may declare, change or withdraw, and only while still a
-- member.
-- A missing row means "not driving". Withdrawing deletes the row; there is no
-- "not driving" flag.
-- Seats are 1-8: the driver's own child counts against the pool like any other
-- child (PRD Business Logic), so 0 seats would mean nothing.
-- Lock rule: once the event's start time passes, its driver declarations are
-- read-only (insert, update and delete all require starts_at > now()).
-- Deleting the event removes its driver declarations by cascade (referential
-- actions bypass RLS and grants); started events themselves cannot be deleted.
-- group_id is denormalised so the composite foreign key guarantees that the
-- declaration belongs to the event's group. event_id, user_id and group_id are
-- immutable: UPDATE is granted on seats and updated_at only, so declaring and
-- changing go through public.set_event_driver() rather than a PostgREST upsert
-- (which would need UPDATE on the key columns too). user_id is always the
-- caller: the function takes it from auth.uid(), never from the client.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.event_drivers (
  event_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null,
  seats smallint not null
    constraint event_drivers_seats_range check (seats between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- events_id_group_unique comes from 20261113120000_create_child_attendance.sql.
  constraint event_drivers_event_fkey
    foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade
);

comment on table public.event_drivers is 'Driver declaration of a member for an event, with seats for children (1-8); readable by group members, writable by the member themself until the event starts. No row = not driving.';

-- The primary key serves lookups by event; this index serves the cascade from
-- profiles and per-member counts (S-09 statistics).
create index event_drivers_user_id_idx on public.event_drivers (user_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.event_drivers enable row level security;

revoke all on public.event_drivers from anon;
-- The table-wide UPDATE grant must go first; a column grant alone is a no-op.
revoke truncate, insert, update, delete on public.event_drivers from authenticated;
-- The timestamps come from defaults and the RPC, never from the client. updated_at
-- stays in the UPDATE grant only because the security invoker RPC sets it.
grant insert (event_id, user_id, group_id, seats) on public.event_drivers to authenticated;
grant update (seats, updated_at) on public.event_drivers to authenticated;
grant delete on public.event_drivers to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (one per operation)
-- ---------------------------------------------------------------------------

-- In the exists subqueries, columns of the declaration row are qualified with
-- event_drivers: an unqualified group_id would bind to e.group_id and make the
-- condition always true.

create policy event_drivers_select_group_member
  on public.event_drivers
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy event_drivers_insert_own
  on public.event_drivers
  for insert
  to authenticated
  with check (
    event_drivers.user_id = (select auth.uid())
    and public.is_group_member(event_drivers.group_id)
    and exists (
      select 1 from public.events e
      where e.id = event_drivers.event_id
        and e.group_id = event_drivers.group_id
        and e.starts_at > now()
    )
  );

-- using: the existing row is the caller's on an event that has not started;
-- with check: the same holds for the new row.
create policy event_drivers_update_own
  on public.event_drivers
  for update
  to authenticated
  using (
    event_drivers.user_id = (select auth.uid())
    and public.is_group_member(event_drivers.group_id)
    and exists (
      select 1 from public.events e
      where e.id = event_drivers.event_id
        and e.group_id = event_drivers.group_id
        and e.starts_at > now()
    )
  )
  with check (
    event_drivers.user_id = (select auth.uid())
    and public.is_group_member(event_drivers.group_id)
    and exists (
      select 1 from public.events e
      where e.id = event_drivers.event_id
        and e.group_id = event_drivers.group_id
        and e.starts_at > now()
    )
  );

-- Withdrawing: a DELETE the policy rejects matches 0 rows instead of raising,
-- so the caller asks for the deleted rows back and treats none as refused.
create policy event_drivers_delete_own
  on public.event_drivers
  for delete
  to authenticated
  using (
    event_drivers.user_id = (select auth.uid())
    and public.is_group_member(event_drivers.group_id)
    and exists (
      select 1 from public.events e
      where e.id = event_drivers.event_id
        and e.group_id = event_drivers.group_id
        and e.starts_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------

-- Runs as the caller, so the policies above decide everything. The event's
-- group is read under the caller's RLS; when the event is invisible (not a
-- member, or no such event) the function raises 42501 instead of silently
-- inserting nothing. The upsert sets only seats and updated_at, so the key
-- columns stay immutable. p_seats is integer so that a plain literal resolves
-- the function; the column's check rejects anything outside 1-8 (23514).
create function public.set_event_driver(p_event_id uuid, p_seats integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select e.group_id into v_group_id
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event not found or not accessible'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.event_drivers (event_id, user_id, group_id, seats)
  values (p_event_id, (select auth.uid()), v_group_id, p_seats)
  on conflict (event_id, user_id)
    do update set seats = excluded.seats, updated_at = now();
end;
$$;

revoke execute on function public.set_event_driver(uuid, integer) from public, anon;
grant execute on function public.set_event_driver(uuid, integer) to authenticated;
