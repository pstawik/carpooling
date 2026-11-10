-- Groups: app admins (granted by the owner via SQL), groups and memberships.
-- Deny by default: RLS on every table, SELECT-only policies, and every write
-- goes through the security definer RPCs below, gated by public.is_app_admin().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is 'Users allowed to create groups and designate group admins; rows inserted by the owner via SQL only.';

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint groups_name_length check (char_length(trim(name)) between 1 and 80),
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.groups is 'Parent group; created only via public.create_group().';

-- user_id references profiles (not auth.users) so PostgREST can embed
-- profiles(first_name, nick); profiles cascades from auth.users.
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    constraint group_members_role_valid check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is 'Group membership with role; written only via security definer RPCs.';

create index group_members_user_id_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.app_admins enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- app_admins is never readable or writable by clients; helpers read it as owner.
revoke all on public.app_admins from anon, authenticated;

-- groups and group_members: reads via policies below, writes via RPCs only.
revoke insert, update, delete, truncate on public.groups from anon, authenticated;
revoke insert, update, delete, truncate on public.group_members from anon, authenticated;
revoke select on public.groups from anon;
revoke select on public.group_members from anon;

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies never recurse into group_members RLS)
-- ---------------------------------------------------------------------------

create function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

create function public.is_group_member(p_group_id uuid)
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
  );
$$;

create function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

revoke execute on function public.is_app_admin() from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

create policy groups_select_member_or_app_admin
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id) or public.is_app_admin());

create policy group_members_select_member_or_app_admin
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id) or public.is_app_admin());

-- Replaces the S-02 NOTE in 20261109120000_create_profiles.sql: members of a
-- shared group can read each other's profiles (alongside profiles_select_own).
create policy profiles_select_group_peers
  on public.profiles
  for select
  to authenticated
  using (public.shares_group_with(id));

-- ---------------------------------------------------------------------------
-- RPCs (the only write paths; app admin only)
-- Business errors: errcode P0001, message in (unknown_email, group_not_found,
-- no_admins); unknown_email carries the offending normalised e-mail in detail.
-- ---------------------------------------------------------------------------

create function public.create_group(p_name text, p_admin_emails text[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_emails text[];
  v_unknown text;
  v_group_id uuid;
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'insufficient_privilege';
  end if;

  -- Normalise (trim + lower), drop blanks, dedupe keeping first occurrence.
  select coalesce(array_agg(e.email order by e.first_pos), '{}')
    into v_emails
  from (
    select lower(trim(x.raw)) as email, min(x.pos) as first_pos
    from unnest(coalesce(p_admin_emails, '{}')) with ordinality as x (raw, pos)
    where nullif(trim(x.raw), '') is not null
    group by lower(trim(x.raw))
  ) e;

  if cardinality(v_emails) = 0 then
    raise exception using errcode = 'P0001', message = 'no_admins';
  end if;

  select e.email
    into v_unknown
  from unnest(v_emails) with ordinality as e (email, pos)
  where not exists (
    select 1 from auth.users u where lower(u.email) = e.email
  )
  order by e.pos
  limit 1;

  if v_unknown is not null then
    raise exception using errcode = 'P0001', message = 'unknown_email', detail = v_unknown;
  end if;

  insert into public.groups (name, created_by)
  values (trim(p_name), (select auth.uid()))
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  select distinct v_group_id, u.id, 'admin'
  from auth.users u
  where lower(u.email) = any (v_emails);

  return v_group_id;
end;
$$;

create function public.add_group_admin(p_group_id uuid, p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception using errcode = 'P0001', message = 'group_not_found';
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'unknown_email', detail = v_email;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, v_user_id, 'admin')
  on conflict (group_id, user_id) do update set role = 'admin';
end;
$$;

-- The only path that exposes e-mails; gated by is_app_admin().
create function public.admin_list_groups()
returns table (id uuid, name text, created_at timestamptz, admins jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'insufficient_privilege';
  end if;

  return query
  select
    g.id,
    g.name,
    g.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('first_name', p.first_name, 'nick', p.nick, 'email', u.email)
          order by p.first_name, p.nick
        )
        from public.group_members gm
        join public.profiles p on p.id = gm.user_id
        join auth.users u on u.id = gm.user_id
        where gm.group_id = g.id
          and gm.role = 'admin'
      ),
      '[]'::jsonb
    ) as admins
  from public.groups g
  order by g.created_at desc, g.id;
end;
$$;

revoke execute on function public.create_group(text, text[]) from public, anon;
revoke execute on function public.add_group_admin(uuid, text) from public, anon;
revoke execute on function public.admin_list_groups() from public, anon;
grant execute on function public.create_group(text, text[]) to authenticated;
grant execute on function public.add_group_admin(uuid, text) to authenticated;
grant execute on function public.admin_list_groups() to authenticated;
