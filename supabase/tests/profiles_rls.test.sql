-- RLS and signup-trigger tests for public.profiles.
-- Group isolation tests live in groups_rls.test.sql.
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select has_table('public', 'profiles', 'public.profiles exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'RLS is enabled on public.profiles'
);

select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_select_group_peers'],
  'profiles has the own and group-peers policies'
);

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------

-- User A: padded values, padded phone.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'a@example.com',
  '{"first_name": "  Anna  ", "nick": " Mama Ani ", "phone": " +48123456789 "}'::jsonb
);

-- User B: empty phone string must become NULL.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'b@example.com',
  '{"first_name": "Bartek", "nick": "Tata Bartka", "phone": ""}'::jsonb
);

select results_eq(
  $$select first_name, nick, phone from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('Anna'::text, 'Mama Ani'::text, '+48123456789'::text)$$,
  'trigger creates profile A with trimmed values'
);

select results_eq(
  $$select first_name, nick, phone from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'$$,
  $$values ('Bartek'::text, 'Tata Bartka'::text, null::text)$$,
  'trigger creates profile B with NULL phone for empty string'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'c@example.com',
            '{"first_name": "Celina"}'::jsonb)$$,
  '23502',
  null,
  'signup without nick metadata is rejected'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'd@example.com',
            '{"nick": "Dziadek"}'::jsonb)$$,
  '23502',
  null,
  'signup without first_name metadata is rejected'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'e@example.com',
            '{"first_name": "Ewa", "nick": "   "}'::jsonb)$$,
  '23514',
  null,
  'signup with blank nick is rejected by the length check'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'f@example.com',
            '{"first_name": "Filip", "nick": "Tata Filipa", "phone": "12-34"}'::jsonb)$$,
  '23514',
  null,
  'malformed phone is rejected by the check constraint'
);

select is(
  (select count(*) from auth.users where id in (
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666'
  )),
  0::bigint,
  'rejected signups leave no auth.users rows behind'
);

-- ---------------------------------------------------------------------------
-- As authenticated user A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  $$select id from public.profiles$$,
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'user A sees only their own profile'
);

select throws_ok(
  $$update public.profiles set nick = 'Hacked' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'user A cannot update profiles'
);

select throws_ok(
  $$delete from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'user A cannot delete profiles'
);

select throws_ok(
  $$insert into public.profiles (id, first_name, nick)
    values ('11111111-1111-1111-1111-111111111111', 'X', 'Y')$$,
  '42501',
  null,
  'user A cannot insert profiles'
);

reset role;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select is_empty(
  $$select * from public.profiles$$,
  'anon sees zero profiles'
);

reset role;

select * from finish();
rollback;
