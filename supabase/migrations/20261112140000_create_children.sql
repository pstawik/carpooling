-- Children (S-04, FR-010): each parent's children, one row per child per group.
-- Every member of the group reads all its children; only the owning parent,
-- while still a member, may insert, rename or delete. Unlike groups and
-- group_invites, writes go through per-operation RLS policies, not RPCs.
-- group_id and parent_id are immutable: UPDATE is granted on name only.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

-- parent_id references profiles (not auth.users) so PostgREST can embed
-- profiles(nick); profiles cascades from auth.users.
create table public.children (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  name text not null
    constraint children_name_length check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

comment on table public.children is 'Child (first name or nick) of a parent in one group; readable by group members, writable by the owning parent while a member.';

-- One name per parent per group, ignoring case and surrounding whitespace.
-- group_id leads, so this index also serves lookups by group.
create unique index children_parent_name_unique
  on public.children (group_id, parent_id, lower(trim(name)));

create index children_parent_id_idx on public.children (parent_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.children enable row level security;

revoke all on public.children from anon;
-- The table-wide UPDATE grant must go first; a column grant alone is a no-op.
revoke truncate, update on public.children from authenticated;
grant update (name) on public.children to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (one per operation)
-- ---------------------------------------------------------------------------

create policy children_select_group_member
  on public.children
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy children_insert_own
  on public.children
  for insert
  to authenticated
  with check (parent_id = (select auth.uid()) and public.is_group_member(group_id));

create policy children_update_own
  on public.children
  for update
  to authenticated
  using (parent_id = (select auth.uid()) and public.is_group_member(group_id))
  with check (parent_id = (select auth.uid()) and public.is_group_member(group_id));

create policy children_delete_own
  on public.children
  for delete
  to authenticated
  using (parent_id = (select auth.uid()) and public.is_group_member(group_id));
