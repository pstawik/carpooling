-- Events (S-05): single dated events of a group. Every member of the group
-- reads its events; only a group admin may create, reschedule, edit the note
-- of, or delete an event. Like children, writes go through per-operation RLS
-- policies, not RPCs.
-- starts_at is an absolute instant; the UI collects the date and time in
-- Europe/Warsaw and converts it before writing.
-- Lock rules: an event can be created or moved only to a future start, and
-- once its start time passes it is read-only and cannot be deleted (started
-- events are kept for statistics).
-- group_id and created_by are immutable: UPDATE is granted on starts_at and
-- note only.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

-- created_by defaults to the caller; the insert policy rejects any other value.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  starts_at timestamptz not null,
  note text null
    constraint events_note_length check (note is null or char_length(trim(note)) between 1 and 200),
  created_by uuid null references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.events is 'Single event of a group; readable by group members, writable by group admins until it starts.';

-- One event per group per start time (PRD duplicate rule: same date and time).
-- group_id leads, so this index also serves lookups by group.
create unique index events_group_starts_at_unique
  on public.events (group_id, starts_at);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;

revoke all on public.events from anon;
-- The table-wide UPDATE grant must go first; a column grant alone is a no-op.
revoke truncate, update on public.events from authenticated;
grant update (starts_at, note) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (one per operation)
-- ---------------------------------------------------------------------------

create policy events_select_group_member
  on public.events
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy events_insert_group_admin
  on public.events
  for insert
  to authenticated
  with check (
    public.is_group_admin(group_id)
    and starts_at > now()
    and created_by = (select auth.uid())
  );

-- using: the row has not started yet; with check: the new start is in the future.
create policy events_update_group_admin
  on public.events
  for update
  to authenticated
  using (public.is_group_admin(group_id) and starts_at > now())
  with check (public.is_group_admin(group_id) and starts_at > now());

create policy events_delete_group_admin
  on public.events
  for delete
  to authenticated
  using (public.is_group_admin(group_id) and starts_at > now());
