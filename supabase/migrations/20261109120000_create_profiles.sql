-- Profiles: one row per auth user, created by the signup trigger below.
-- Field rules are enforced here so no client path can bypass them.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null
    constraint profiles_first_name_length check (char_length(trim(first_name)) between 1 and 50),
  nick text not null
    constraint profiles_nick_length check (char_length(trim(nick)) between 1 and 30),
  phone text null
    constraint profiles_phone_format check (phone ~ '^\+?[0-9]{9,15}$'),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Parent profile; one row per auth.users row, written only by the on_auth_user_created trigger.';

-- Deny by default: RLS on, only the owner may read their own row.
alter table public.profiles enable row level security;

-- Writes happen only through public.handle_new_user() (security definer).
-- No INSERT/UPDATE/DELETE policies exist for anon or authenticated; the
-- privileges are revoked as well so the intent is explicit.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- NOTE: S-02 adds a group-sharing SELECT policy so members of the same group
-- can read each other's profiles. Until then, users see only their own row.

-- Signup trigger: copy profile fields from auth metadata. Missing first_name
-- or nick yields NULL (not-null violation) and blank values fail the length
-- checks, so the auth.users insert aborts and profile-less accounts cannot exist.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, nick, phone)
  values (
    new.id,
    trim(new.raw_user_meta_data ->> 'first_name'),
    trim(new.raw_user_meta_data ->> 'nick'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
