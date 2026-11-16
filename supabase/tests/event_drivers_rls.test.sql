-- RLS and privilege tests for public.event_drivers and set_event_driver().
-- Fixtures: A (admin of G1, with a phone), B (member of G1), C (admin of G2);
-- events E1 and E4 (future, G1), E2 (started, G1) and E3 (future, G2), all
-- inserted as postgres. A already drives to E2 (declared before it started).
-- The test runs in one transaction, so now() is constant throughout.
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'event_drivers', 'public.event_drivers exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.event_drivers'::regclass),
  true,
  'RLS is enabled on public.event_drivers'
);

select policies_are(
  'public',
  'event_drivers',
  array[
    'event_drivers_select_group_member',
    'event_drivers_insert_own',
    'event_drivers_update_own',
    'event_drivers_delete_own'
  ],
  'event_drivers has exactly the select, insert, update and delete policies'
);

select is(
  (select bool_or(has_table_privilege('anon', 'public.event_drivers', p))
    from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p),
  false,
  'anon has no privileges on event_drivers'
);

select is(
  (select bool_or(has_table_privilege('authenticated', 'public.event_drivers', p))
    from unnest(array['insert', 'update', 'truncate']) as p),
  false,
  'authenticated has no table-level INSERT, UPDATE or TRUNCATE on event_drivers'
);

select is(
  has_table_privilege('authenticated', 'public.event_drivers', 'delete'),
  true,
  'authenticated may DELETE (withdraw), limited by event_drivers_delete_own'
);

select is(
  (select bool_and(has_column_privilege('authenticated', 'public.event_drivers', col, 'insert'))
    from unnest(array['event_id', 'user_id', 'group_id', 'seats']) as col),
  true,
  'authenticated may INSERT the key columns and seats'
);

select is(
  has_column_privilege('authenticated', 'public.event_drivers', 'created_at', 'insert')
    or has_column_privilege('authenticated', 'public.event_drivers', 'updated_at', 'insert'),
  false,
  'authenticated may not INSERT created_at or updated_at'
);

select is(
  has_column_privilege('authenticated', 'public.event_drivers', 'seats', 'update')
    and has_column_privilege('authenticated', 'public.event_drivers', 'updated_at', 'update'),
  true,
  'authenticated may UPDATE event_drivers.seats and updated_at'
);

select is(
  (select bool_or(has_column_privilege('authenticated', 'public.event_drivers', col, 'update'))
    from unnest(array['event_id', 'user_id', 'group_id', 'created_at']) as col),
  false,
  'authenticated may not UPDATE the key columns or created_at'
);

select is(
  has_function_privilege('anon', 'public.set_event_driver(uuid, integer)', 'execute'),
  false,
  'anon cannot execute set_event_driver'
);

select is(
  has_function_privilege('authenticated', 'public.set_event_driver(uuid, integer)', 'execute'),
  true,
  'authenticated can execute set_event_driver'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com',
   '{"first_name": "Anna", "nick": "Mama Ani", "phone": "+48600100200"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com',
   '{"first_name": "Bartek", "nick": "Tata Bartka"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c@example.com',
   '{"first_name": "Celina", "nick": "Mama Celiny"}'::jsonb);

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1'),
  ('20000000-0000-0000-0000-000000000002', 'G2');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'admin');

-- A started event cannot be created through RLS, so all events are inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   now() + interval '7 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
   now() + interval '7 days', '00000000-0000-0000-0000-0000000000c1'),
  ('e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   now() + interval '14 days', '00000000-0000-0000-0000-0000000000a1');

-- A driver declaration made before E2 started.
insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 4);

-- ---------------------------------------------------------------------------
-- As user A (member of G1) — declare, change, range, lock after start
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 3)$$,
  'A declares driving to E1 with 3 seats'
);

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 5)$$,
  'A changes the declaration to 5 seats'
);

select results_eq(
  $$select user_id, group_id, seats from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 5::smallint)$$,
  'E1 has one declaration by A, with 5 seats and the event''s group'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 0)$$,
  '23514', null, '0 seats is rejected by the range check'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 9)$$,
  '23514', null, '9 seats is rejected by the range check'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000002', 2)$$,
  '42501', null, 'A cannot change the declaration on the started event E2'
);

select is_empty(
  $$update public.event_drivers set seats = 2
    where event_id = 'e0000000-0000-0000-0000-000000000002' returning user_id$$,
  'A''s direct update of the declaration on a started event affects 0 rows'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000002' returning user_id$$,
  'A cannot withdraw the declaration on a started event (0 rows deleted)'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000003', 2)$$,
  '42501', null, 'A cannot declare driving to an event of G2'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-0000000000ff', 2)$$,
  '42501', null, 'a nonexistent event raises 42501 instead of writing nothing'
);

select throws_ok(
  $$update public.event_drivers set user_id = '00000000-0000-0000-0000-0000000000b1'
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A cannot hand the declaration to someone else (no UPDATE on user_id)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b1',
            '10000000-0000-0000-0000-000000000001', 2)$$,
  '42501', null, 'A cannot insert a declaration on behalf of B'
);

reset role;

-- E2 was started before any of A's attempts, so the earlier declaration stands.
select results_eq(
  $$select seats from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000002'
      and user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (4::smallint)$$,
  'the declaration on the started event is unchanged'
);

-- ---------------------------------------------------------------------------
-- As user B (member of G1) — reads A's with the phone, writes only own
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select d.event_id, d.seats, p.nick, p.phone
    from public.event_drivers d join public.profiles p on p.id = d.user_id
    order by d.event_id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid, 5::smallint, 'Mama Ani', '+48600100200'),
           ('e0000000-0000-0000-0000-000000000002'::uuid, 4::smallint, 'Mama Ani', '+48600100200')$$,
  'member B sees A''s declarations in G1 with A''s nick and phone'
);

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 2)$$,
  'B declares driving to E1 with 2 seats'
);

select is(
  (select count(*) from public.event_drivers where event_id = 'e0000000-0000-0000-0000-000000000001'),
  2::bigint,
  'E1 has two drivers'
);

select is_empty(
  $$update public.event_drivers set seats = 8
    where event_id = 'e0000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000a1' returning user_id$$,
  'B''s direct update of A''s declaration affects 0 rows'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000a1' returning user_id$$,
  'B cannot withdraw A''s declaration (0 rows deleted)'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (admin of G2) — sees nothing in G1, writes nothing there
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty($$select * from public.event_drivers$$, 'C (not in G1) sees no driver declarations');

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000001', 2)$$,
  '42501', null, 'C cannot declare driving to a G1 event'
);

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000003', 4)$$,
  'C declares driving to E3 in own group'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user A again — withdraw own declaration before the start
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$delete from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-0000000000a1' returning user_id$$,
  array['00000000-0000-0000-0000-0000000000a1'::uuid],
  'A withdraws the E1 declaration'
);

reset role;

select results_eq(
  $$select user_id from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  array['00000000-0000-0000-0000-0000000000b1'::uuid],
  'only B''s declaration remains on E1'
);

-- ---------------------------------------------------------------------------
-- Same-group foreign key (as postgres, bypassing RLS)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
            '20000000-0000-0000-0000-000000000002', 2)$$,
  '23503', null, 'a declaration cannot claim another group than its event''s'
);

-- ---------------------------------------------------------------------------
-- Cascade: deleting the event removes its driver declarations
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$delete from public.events
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  array['e0000000-0000-0000-0000-000000000001'::uuid],
  'admin A deletes the future event E1'
);

reset role;

select is(
  (select count(*) from public.event_drivers where event_id = 'e0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the driver declarations of the deleted event are gone'
);

-- ---------------------------------------------------------------------------
-- Membership edge case: a member who left
-- ---------------------------------------------------------------------------

-- A leaves G1; A's E2 row stays, as it does today when a member is removed.
delete from public.group_members
  where group_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '00000000-0000-0000-0000-0000000000a1';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000004', 2)$$,
  '42501', null, 'A, after leaving G1, cannot declare driving any more'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon — no access at all
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select * from public.event_drivers$$,
  '42501', null, 'anon cannot read event_drivers'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-000000000004', 2)$$,
  '42501', null, 'anon cannot call set_event_driver'
);

reset role;

select * from finish();
rollback;
