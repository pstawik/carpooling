-- Child attendance (S-07, FR-014): a parent's "going" / "not going" declaration
-- for one of their children at one event. Every member of the group reads all
-- declarations of its events; only the child's parent, while still a member,
-- may declare.
-- A missing row means "no declaration": the child counts as not going and the
-- UI shows the "bez deklaracji" label. It is never an error.
-- Lock rule: once the event's start time passes, its declarations are
-- read-only (insert and update both require starts_at > now()).
-- There is no DELETE for anyone: a parent only toggles going <-> not going and
-- cannot return to "no declaration". Deleting the event or the child removes
-- its declarations by cascade (referential actions bypass RLS and grants).
-- Accepted exception to the lock: children_delete_own has no time condition,
-- so deleting a child also removes its declarations on events that already
-- started (S-04 trade-off). Started events themselves cannot be deleted.
-- Revisit before S-09 statistics (roadmap S-09 Unknowns).
-- group_id is denormalised so the composite foreign keys guarantee that the
-- child and the event belong to the same group. event_id, child_id and
-- group_id are immutable: UPDATE is granted on going and updated_at only, so
-- writes go through public.set_child_attendance() rather than a PostgREST
-- upsert (which would need UPDATE on the key columns too).

-- ---------------------------------------------------------------------------
-- Composite keys for the same-group foreign keys
-- ---------------------------------------------------------------------------

-- id is already the primary key, so these always succeed on existing rows.
alter table public.events
  add constraint events_id_group_unique unique (id, group_id);

alter table public.children
  add constraint children_id_group_unique unique (id, group_id);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.child_attendance (
  event_id uuid not null,
  child_id uuid not null,
  group_id uuid not null,
  going boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, child_id),
  constraint child_attendance_event_fkey
    foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade,
  constraint child_attendance_child_fkey
    foreign key (child_id, group_id) references public.children (id, group_id) on delete cascade
);

comment on table public.child_attendance is 'Going / not going declaration of a child for an event; readable by group members, writable by the child''s parent until the event starts. No row = no declaration (not going).';

-- The primary key serves lookups by event; this index serves the cascade
-- from children.
create index child_attendance_child_id_idx on public.child_attendance (child_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.child_attendance enable row level security;

revoke all on public.child_attendance from anon;
-- The table-wide UPDATE grant must go first; a column grant alone is a no-op.
revoke truncate, insert, update, delete on public.child_attendance from authenticated;
-- The timestamps come from defaults and the RPC, never from the client. updated_at
-- stays in the UPDATE grant only because the security invoker RPC sets it.
grant insert (event_id, child_id, group_id, going) on public.child_attendance to authenticated;
grant update (going, updated_at) on public.child_attendance to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (one per operation; no DELETE policy)
-- ---------------------------------------------------------------------------

-- In the exists subqueries, columns of the declaration row are qualified with
-- child_attendance: an unqualified group_id would bind to c.group_id and make
-- the condition always true.

create policy child_attendance_select_group_member
  on public.child_attendance
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy child_attendance_insert_own
  on public.child_attendance
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.children c
      where c.id = child_attendance.child_id
        and c.parent_id = (select auth.uid())
        and c.group_id = child_attendance.group_id
    )
    and public.is_group_member(child_attendance.group_id)
    and exists (
      select 1 from public.events e
      where e.id = child_attendance.event_id
        and e.group_id = child_attendance.group_id
        and e.starts_at > now()
    )
  );

-- using: the existing row is the caller's child on an event that has not
-- started; with check: the same holds for the new row.
create policy child_attendance_update_own
  on public.child_attendance
  for update
  to authenticated
  using (
    exists (
      select 1 from public.children c
      where c.id = child_attendance.child_id
        and c.parent_id = (select auth.uid())
        and c.group_id = child_attendance.group_id
    )
    and public.is_group_member(child_attendance.group_id)
    and exists (
      select 1 from public.events e
      where e.id = child_attendance.event_id
        and e.group_id = child_attendance.group_id
        and e.starts_at > now()
    )
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = child_attendance.child_id
        and c.parent_id = (select auth.uid())
        and c.group_id = child_attendance.group_id
    )
    and public.is_group_member(child_attendance.group_id)
    and exists (
      select 1 from public.events e
      where e.id = child_attendance.event_id
        and e.group_id = child_attendance.group_id
        and e.starts_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------

-- Runs as the caller, so the policies above decide everything. The child's
-- group is read under the caller's RLS; when the child is invisible (not a
-- member, or no such child) the function raises 42501 instead of silently
-- inserting nothing. The upsert sets only going and updated_at, so the key
-- columns stay immutable.
create function public.set_child_attendance(p_event_id uuid, p_child_id uuid, p_going boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select c.group_id into v_group_id
  from public.children c
  where c.id = p_child_id;

  if not found then
    raise exception 'child not found or not accessible'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.child_attendance (event_id, child_id, group_id, going)
  values (p_event_id, p_child_id, v_group_id, p_going)
  on conflict (event_id, child_id)
    do update set going = excluded.going, updated_at = now();
end;
$$;

revoke execute on function public.set_child_attendance(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_child_attendance(uuid, uuid, boolean) to authenticated;
