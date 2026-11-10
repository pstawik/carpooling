-- RLS, privilege and RPC tests for app_admins, groups and group_members.
-- Fixtures: app admin X; A (admin of G1), B (member of G1), C (admin of G2),
-- D (in no group).
begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select has_table('public', 'app_admins', 'public.app_admins exists');
select has_table('public', 'groups', 'public.groups exists');
select has_table('public', 'group_members', 'public.group_members exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.app_admins'::regclass),
  true,
  'RLS is enabled on public.app_admins'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.groups'::regclass),
  true,
  'RLS is enabled on public.groups'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.group_members'::regclass),
  true,
  'RLS is enabled on public.group_members'
);

select policies_are(
  'public',
  'app_admins',
  array[]::name[],
  'app_admins has no policies'
);

select policies_are(
  'public',
  'groups',
  array['groups_select_member_or_app_admin'],
  'groups has only the groups_select_member_or_app_admin policy'
);

select policies_are(
  'public',
  'group_members',
  array['group_members_select_member_or_app_admin'],
  'group_members has only the group_members_select_member_or_app_admin policy'
);

select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_select_group_peers'],
  'profiles has exactly the own and group-peers policies'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'x@example.com',
   '{"first_name": "Xawery", "nick": "Admin"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com',
   '{"first_name": "Anna", "nick": "Mama Ani"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com',
   '{"first_name": "Bartek", "nick": "Tata Bartka"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c@example.com',
   '{"first_name": "Celina", "nick": "Mama Celiny"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'd@example.com',
   '{"first_name": "Dawid", "nick": "Tata Dawida"}'::jsonb);

insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000a0');

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1'),
  ('20000000-0000-0000-0000-000000000002', 'G2');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'admin');

-- Captures the detail of an error raised by create_group (null if none).
create function pg_temp.create_group_error_detail(p_name text, p_emails text[])
returns text
language plpgsql
as $$
declare
  v_detail text;
begin
  perform public.create_group(p_name, p_emails);
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end;
$$;

-- ---------------------------------------------------------------------------
-- As user A (admin of G1, not an app admin)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select id from public.groups$$,
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'user A sees only G1'
);

select set_eq(
  $$select group_id, user_id from public.group_members$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid),
           ('10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'user A sees only G1 memberships'
);

select set_eq(
  $$select id from public.profiles$$,
  array['00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid],
  'user A sees profiles of A and B only (not C or D)'
);

select throws_ok(
  $$insert into public.groups (name) values ('Hack')$$,
  '42501', null, 'user A cannot insert groups'
);

select throws_ok(
  $$update public.groups set name = 'Hack' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'user A cannot update groups'
);

select throws_ok(
  $$delete from public.groups where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'user A cannot delete groups'
);

select throws_ok(
  $$insert into public.group_members (group_id, user_id, role)
    values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'admin')$$,
  '42501', null, 'user A cannot insert group_members'
);

select throws_ok(
  $$update public.group_members set role = 'admin'
    where user_id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'user A cannot update group_members'
);

select throws_ok(
  $$delete from public.group_members where user_id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'user A cannot delete group_members'
);

select throws_ok(
  $$insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'user A cannot insert app_admins'
);

select throws_ok(
  $$update public.app_admins set created_at = now()$$,
  '42501', null, 'user A cannot update app_admins'
);

select throws_ok(
  $$delete from public.app_admins$$,
  '42501', null, 'user A cannot delete app_admins'
);

select throws_ok(
  $$select * from public.app_admins$$,
  '42501', null, 'user A cannot read app_admins'
);

select throws_ok(
  $$select public.create_group('Hack', array['a@example.com'])$$,
  '42501', null, 'user A cannot call create_group'
);

select throws_ok(
  $$select public.add_group_admin('10000000-0000-0000-0000-000000000001', 'b@example.com')$$,
  '42501', null, 'user A cannot call add_group_admin'
);

select throws_ok(
  $$select * from public.admin_list_groups()$$,
  '42501', null, 'user A cannot call admin_list_groups'
);

select is(
  public.is_app_admin(),
  false,
  'is_app_admin() is false for user A'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user D (in no group)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select is_empty($$select * from public.groups$$, 'user D sees no groups');
select is_empty($$select * from public.group_members$$, 'user D sees no memberships');

select results_eq(
  $$select id from public.profiles$$,
  array['00000000-0000-0000-0000-0000000000d1'::uuid],
  'user D sees only their own profile'
);

reset role;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok($$select * from public.groups$$, '42501', null, 'anon cannot read groups');
select throws_ok($$select * from public.group_members$$, '42501', null, 'anon cannot read group_members');
select throws_ok(
  $$select public.create_group('Hack', array['a@example.com'])$$,
  '42501', null, 'anon cannot call create_group'
);

reset role;

-- ---------------------------------------------------------------------------
-- As app admin X
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a0", "role": "authenticated"}';

select is(public.is_app_admin(), true, 'is_app_admin() is true for X');

select set_eq(
  $$select id from public.groups$$,
  array['10000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid],
  'X sees all groups via select'
);

select isnt(
  public.create_group('  Judo – wtorki ', array['A@example.com', 'a@example.com']),
  null,
  'create_group returns the new group id'
);

select is(
  (select name from public.groups where id = (select id from public.groups where name = 'Judo – wtorki')),
  'Judo – wtorki',
  'create_group trims the name'
);

select is(
  (select created_by from public.groups where id = (select id from public.groups where name = 'Judo – wtorki')),
  '00000000-0000-0000-0000-0000000000a0'::uuid,
  'create_group records the app admin as created_by'
);

select results_eq(
  $$select user_id, role from public.group_members
    where group_id = (select id from public.groups where name = 'Judo – wtorki')$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'admin'::text)$$,
  'create_group dedupes e-mails case-insensitively into one admin membership'
);

select is(
  (select count(*) from public.groups),
  3::bigint,
  'three groups exist after create_group'
);

select throws_ok(
  $$select public.create_group('Nope', array['b@example.com', ' Nobody@Example.com '])$$,
  'P0001', 'unknown_email', 'create_group rejects an unknown e-mail'
);

select is(
  pg_temp.create_group_error_detail('Nope', array['b@example.com', ' Nobody@Example.com ']),
  'nobody@example.com',
  'unknown_email detail carries the normalised offending e-mail'
);

select is(
  (select count(*) from public.groups),
  3::bigint,
  'unknown e-mail leaves no new group row'
);

select throws_ok(
  $$select public.create_group('Nope', array[]::text[])$$,
  'P0001', 'no_admins', 'create_group rejects an empty admin list'
);

select throws_ok(
  $$select public.create_group('Nope', array['', '   '])$$,
  'P0001', 'no_admins', 'create_group treats blank e-mails as absent'
);

select lives_ok(
  $$select public.add_group_admin('10000000-0000-0000-0000-000000000001', ' B@example.com ')$$,
  'add_group_admin promotes existing member B'
);

select is(
  (select role from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000b1'),
  'admin',
  'B is now admin of G1'
);

select lives_ok(
  $$select public.add_group_admin('10000000-0000-0000-0000-000000000001', 'd@example.com')$$,
  'add_group_admin adds non-member D as admin'
);

select is(
  (select role from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000d1'),
  'admin',
  'D is now admin of G1'
);

select lives_ok(
  $$select public.add_group_admin('10000000-0000-0000-0000-000000000001', 'a@example.com')$$,
  'add_group_admin is a no-op for an existing admin'
);

select throws_ok(
  $$select public.add_group_admin('99999999-9999-9999-9999-999999999999', 'a@example.com')$$,
  'P0001', 'group_not_found', 'add_group_admin rejects an unknown group'
);

select throws_ok(
  $$select public.add_group_admin('10000000-0000-0000-0000-000000000001', 'nobody@example.com')$$,
  'P0001', 'unknown_email', 'add_group_admin rejects an unknown e-mail'
);

select set_eq(
  $$select id from public.admin_list_groups()$$,
  $$select id from public.groups$$,
  'admin_list_groups returns every group'
);

select is(
  (select admins from public.admin_list_groups()
    where id = '10000000-0000-0000-0000-000000000001'),
  '[
    {"first_name": "Anna", "nick": "Mama Ani", "email": "a@example.com"},
    {"first_name": "Bartek", "nick": "Tata Bartka", "email": "b@example.com"},
    {"first_name": "Dawid", "nick": "Tata Dawida", "email": "d@example.com"}
  ]'::jsonb,
  'admin_list_groups returns G1 admins with e-mails'
);

select is(
  (select admins from public.admin_list_groups()
    where id = '20000000-0000-0000-0000-000000000002'),
  '[{"first_name": "Celina", "nick": "Mama Celiny", "email": "c@example.com"}]'::jsonb,
  'admin_list_groups returns G2 admins with e-mails'
);

reset role;

select * from finish();
rollback;
