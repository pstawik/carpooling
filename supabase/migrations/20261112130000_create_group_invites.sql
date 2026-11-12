-- Group invite links (S-03, FR-005/FR-006): one token per group.
-- The token grants membership, so it lives in its own table readable only by
-- that group's admins (groups is readable by every member). Writes go through
-- the security definer RPCs below; regeneration replaces the token in place,
-- so the previous link stops working immediately.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.group_invites (
  group_id uuid primary key references public.groups (id) on delete cascade,
  token text not null unique,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.group_invites is 'Current invite token per group; readable by group admins, written only via public.regenerate_group_invite().';

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.group_invites enable row level security;

revoke all on public.group_invites from anon;
revoke insert, update, delete, truncate on public.group_invites from authenticated;

-- ---------------------------------------------------------------------------
-- Helper (security definer so the policy never recurses into group_members RLS)
-- ---------------------------------------------------------------------------

create function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_group_admin(uuid) from public, anon;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policy (SELECT only)
-- ---------------------------------------------------------------------------

create policy group_invites_select_group_admin
  on public.group_invites
  for select
  to authenticated
  using (public.is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- Business errors: errcode P0001, message invalid_invite.
-- ---------------------------------------------------------------------------

-- Creates or replaces the group's token; 24 random bytes as url-safe base64
-- (32 chars, no padding).
create function public.regenerate_group_invite(p_group_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception using errcode = '42501', message = 'insufficient_privilege';
  end if;

  insert into public.group_invites (group_id, token, created_by)
  values (
    p_group_id,
    translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
    (select auth.uid())
  )
  on conflict (group_id) do update
    set token = excluded.token,
        created_by = excluded.created_by,
        created_at = now()
  returning token into v_token;

  return v_token;
end;
$$;

-- The only function open to anon: returns just the group name (or null) so the
-- invite page can say what the visitor is invited to.
create function public.invite_group_name(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.name
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  where gi.token = p_token;
$$;

-- Adds the caller as a member; an existing membership (any role) is left untouched.
create function public.join_group_by_invite(p_token text)
returns table (group_id uuid, already_member boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_group_id uuid;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'insufficient_privilege';
  end if;

  select gi.group_id
    into v_group_id
  from public.group_invites gi
  where gi.token = p_token;

  if v_group_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;

  return query select v_group_id, v_inserted = 0;
end;
$$;

revoke execute on function public.regenerate_group_invite(uuid) from public, anon;
revoke execute on function public.invite_group_name(text) from public;
revoke execute on function public.join_group_by_invite(text) from public, anon;
grant execute on function public.regenerate_group_invite(uuid) to authenticated;
grant execute on function public.invite_group_name(text) to anon, authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;
