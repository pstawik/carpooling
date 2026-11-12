-- RLS, privilege and RPC tests for group_invites and the invite RPCs.
-- Fixtures: A (admin of G1), B (member of G1), C (admin of G2), D (in no group).
begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'group_invites', 'public.group_invites exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.group_invites'::regclass),
  true,
  'RLS is enabled on public.group_invites'
);

select policies_are(
  'public',
  'group_invites',
  array['group_invites_select_group_admin'],
  'group_invites has only the group_invites_select_group_admin policy'
);

select is(
  (select bool_or(has_table_privilege('anon', 'public.group_invites', p))
    from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) as p),
  false,
  'anon has no privileges on group_invites'
);

select is(
  (select bool_or(has_table_privilege('authenticated', 'public.group_invites', p))
    from unnest(array['insert', 'update', 'delete', 'truncate']) as p),
  false,
  'authenticated has no write privileges on group_invites'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
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

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1'),
  ('20000000-0000-0000-0000-000000000002', 'G2');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'admin');

-- Tokens captured during the run, readable by every test role.
create temp table tokens (label text primary key, token text not null) on commit drop;
grant select, insert on tokens to authenticated, anon;

-- ---------------------------------------------------------------------------
-- As user A (admin of G1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is(public.is_group_admin('10000000-0000-0000-0000-000000000001'), true, 'is_group_admin(G1) is true for A');
select is(public.is_group_admin('20000000-0000-0000-0000-000000000002'), false, 'is_group_admin(G2) is false for A');

select is_empty($$select * from public.group_invites$$, 'G1 has no invite before the admin asks for one');

insert into tokens values ('first', public.regenerate_group_invite('10000000-0000-0000-0000-000000000001'));

select matches(
  (select token from tokens where label = 'first'),
  '^[A-Za-z0-9_-]{32}$',
  'regenerate_group_invite returns a 32-char url-safe token'
);

select results_eq(
  $$select group_id, token from public.group_invites$$,
  $$select '10000000-0000-0000-0000-000000000001'::uuid, token from tokens where label = 'first'$$,
  'admin A reads the G1 token'
);

insert into tokens values ('second', public.regenerate_group_invite('10000000-0000-0000-0000-000000000001'));

select isnt(
  (select token from tokens where label = 'second'),
  (select token from tokens where label = 'first'),
  'a second regenerate_group_invite returns a different token'
);

select results_eq(
  $$select token from public.group_invites$$,
  $$select token from tokens where label = 'second'$$,
  'after regeneration A sees exactly one row with the new token'
);

select is(
  (select created_by from public.group_invites),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'regenerate_group_invite records the admin as created_by'
);

select throws_ok(
  $$select public.regenerate_group_invite('20000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'A cannot regenerate the invite of G2'
);

select throws_ok(
  $$insert into public.group_invites (group_id, token)
    values ('20000000-0000-0000-0000-000000000002', 'hack')$$,
  '42501', null, 'A cannot insert group_invites directly'
);

select throws_ok(
  $$update public.group_invites set token = 'hack'$$,
  '42501', null, 'A cannot update group_invites directly'
);

select throws_ok(
  $$delete from public.group_invites$$,
  '42501', null, 'A cannot delete group_invites directly'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user B (member of G1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select is(public.is_group_admin('10000000-0000-0000-0000-000000000001'), false, 'is_group_admin(G1) is false for member B');
select is_empty($$select * from public.group_invites$$, 'member B cannot read the G1 token');

select throws_ok(
  $$select public.regenerate_group_invite('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'member B cannot regenerate the G1 invite'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (admin of G2, stranger to G1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty($$select * from public.group_invites$$, 'admin of another group cannot read the G1 token');

reset role;

-- ---------------------------------------------------------------------------
-- As user D (in no group) — joins G1
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select is_empty($$select * from public.group_invites$$, 'stranger D cannot read the G1 token');

select throws_ok(
  $$select public.regenerate_group_invite('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'stranger D cannot regenerate the G1 invite'
);

select throws_ok(
  $$select * from public.join_group_by_invite((select token from tokens where label = 'first'))$$,
  'P0001', 'invalid_invite', 'join_group_by_invite rejects the regenerated (old) token'
);

select throws_ok(
  $$select * from public.join_group_by_invite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$,
  'P0001', 'invalid_invite', 'join_group_by_invite rejects an unknown token'
);

select is_empty($$select * from public.groups$$, 'a failed join leaves D in no group');

select results_eq(
  $$select group_id, already_member
    from public.join_group_by_invite((select token from tokens where label = 'second'))$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid, false)$$,
  'join_group_by_invite with the current token joins D'
);

select results_eq(
  $$select role from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000d1'$$,
  array['member'::text],
  'D joined G1 as member'
);

select results_eq(
  $$select id from public.groups$$,
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'D now sees G1'
);

select results_eq(
  $$select group_id, already_member
    from public.join_group_by_invite((select token from tokens where label = 'second'))$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid, true)$$,
  'a second join reports already_member'
);

select is(
  (select count(*) from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000d1'),
  1::bigint,
  'a second join adds no duplicate membership'
);

select is_empty($$select * from public.group_invites$$, 'new member D still cannot read the G1 token');

reset role;

-- ---------------------------------------------------------------------------
-- As user A again — joining their own group
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select group_id, already_member
    from public.join_group_by_invite((select token from tokens where label = 'second'))$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid, true)$$,
  'admin A joining G1 reports already_member'
);

select is(
  (select role from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000a1'),
  'admin',
  'admin A stays admin after joining via the link'
);

reset role;

-- ---------------------------------------------------------------------------
-- As authenticated without a user id
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';

select throws_ok(
  $$select * from public.join_group_by_invite((select token from tokens where label = 'second'))$$,
  '42501', null, 'join_group_by_invite requires a user id'
);

reset role;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select is(
  public.invite_group_name((select token from tokens where label = 'second')),
  'G1',
  'anon gets the group name for the current token'
);

select is(
  public.invite_group_name((select token from tokens where label = 'first')),
  null,
  'anon gets null for the regenerated (old) token'
);

select is(
  public.invite_group_name('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  null,
  'anon gets null for an unknown token'
);

select throws_ok($$select * from public.group_invites$$, '42501', null, 'anon cannot read group_invites');

select throws_ok(
  $$select * from public.join_group_by_invite((select token from tokens where label = 'second'))$$,
  '42501', null, 'anon cannot call join_group_by_invite'
);

select throws_ok(
  $$select public.regenerate_group_invite('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot call regenerate_group_invite'
);

select throws_ok(
  $$select public.is_group_admin('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot call is_group_admin'
);

reset role;

-- ---------------------------------------------------------------------------
-- As postgres — cascade
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.group_invites where group_id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'G1 has exactly one invite row'
);

delete from public.groups where id = '10000000-0000-0000-0000-000000000001';

select is_empty(
  $$select * from public.group_invites where group_id = '10000000-0000-0000-0000-000000000001'$$,
  'deleting a group deletes its invite'
);

select * from finish();
rollback;
