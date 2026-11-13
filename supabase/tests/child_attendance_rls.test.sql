-- RLS and privilege tests for public.child_attendance and set_child_attendance().
-- Fixtures: A (admin of G1, parent of child Ola), B (member of G1, parent of
-- child Kuba), C (admin of G2, parent of child Zosia in G2); events E1 and E4
-- (future, G1), E2 (started, G1) and E3 (future, G2), all inserted as postgres.
-- The test runs in one transaction, so now() is constant throughout.
begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'child_attendance', 'public.child_attendance exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.child_attendance'::regclass),
  true,
  'RLS is enabled on public.child_attendance'
);

select policies_are(
  'public',
  'child_attendance',
  array[
    'child_attendance_select_group_member',
    'child_attendance_insert_own',
    'child_attendance_update_own'
  ],
  'child_attendance has exactly the select, insert and update policies'
);

select is(
  (select bool_or(has_table_privilege('anon', 'public.child_attendance', p))
    from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p),
  false,
  'anon has no privileges on child_attendance'
);

select is(
  (select bool_or(has_table_privilege('authenticated', 'public.child_attendance', p))
    from unnest(array['update', 'delete', 'truncate']) as p),
  false,
  'authenticated has no table-level UPDATE, DELETE or TRUNCATE on child_attendance'
);

select is(
  has_column_privilege('authenticated', 'public.child_attendance', 'going', 'update')
    and has_column_privilege('authenticated', 'public.child_attendance', 'updated_at', 'update'),
  true,
  'authenticated may UPDATE child_attendance.going and updated_at'
);

select is(
  (select bool_or(has_column_privilege('authenticated', 'public.child_attendance', col, 'update'))
    from unnest(array['event_id', 'child_id', 'group_id', 'created_at']) as col),
  false,
  'authenticated may not UPDATE the key columns or created_at'
);

select is(
  has_function_privilege('anon', 'public.set_child_attendance(uuid, uuid, boolean)', 'execute'),
  false,
  'anon cannot execute set_child_attendance'
);

select is(
  has_function_privilege('authenticated', 'public.set_child_attendance(uuid, uuid, boolean)', 'execute'),
  true,
  'authenticated can execute set_child_attendance'
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
   '{"first_name": "Celina", "nick": "Mama Celiny"}'::jsonb);

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1'),
  ('20000000-0000-0000-0000-000000000002', 'G2');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'admin');

insert into public.children (id, group_id, parent_id, name) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Ola'),
  ('c0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'Kuba'),
  ('c0000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000c1', 'Zosia');

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

-- A declaration made before E2 started.
insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- As user A (parent of Ola in G1) — declare, toggle, lock after start
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000a1', true)$$,
  'A declares Ola as going to E1'
);

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000a1', false)$$,
  'A toggles Ola to not going'
);

select results_eq(
  $$select child_id, group_id, going from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  $$values ('c0000000-0000-0000-0000-0000000000a1'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, false)$$,
  'E1 has one declaration for Ola, with going = false and the child''s group'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000002',
                                       'c0000000-0000-0000-0000-0000000000a1', false)$$,
  '42501', null, 'A cannot toggle Ola''s declaration on the started event E2'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = 'e0000000-0000-0000-0000-000000000002' returning child_id$$,
  'A''s direct update of a declaration on a started event affects 0 rows'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000003',
                                       'c0000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'A cannot declare Ola for an event of G2'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000ff', true)$$,
  '42501', null, 'a nonexistent child raises 42501 instead of writing nothing'
);

select throws_ok(
  $$update public.child_attendance set event_id = 'e0000000-0000-0000-0000-000000000004'
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A cannot move a declaration to another event (no UPDATE on event_id)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A cannot delete a declaration (no DELETE privilege)'
);

reset role;

-- E2 was started before any of A's attempts, so the earlier declaration stands.
select results_eq(
  $$select going from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000002'
      and child_id = 'c0000000-0000-0000-0000-0000000000a1'$$,
  $$values (true)$$,
  'the declaration on the started event is unchanged'
);

-- ---------------------------------------------------------------------------
-- As user B (member of G1, parent of Kuba) — reads A's, writes only own
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select event_id, child_id, going from public.child_attendance order by event_id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-0000000000a1'::uuid, false),
           ('e0000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-0000000000a1'::uuid, true)$$,
  'member B sees A''s declarations in G1'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'B cannot declare A''s child'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-000000000001', true)$$,
  '42501', null, 'B cannot insert a declaration for A''s child directly'
);

select is_empty(
  $$update public.child_attendance set going = true
    where event_id = 'e0000000-0000-0000-0000-000000000001' returning child_id$$,
  'B''s direct update of A''s declaration affects 0 rows'
);

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000004',
                                       'c0000000-0000-0000-0000-0000000000b1', true)$$,
  'B declares Kuba as going to E4'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000002',
                                       'c0000000-0000-0000-0000-0000000000b1', true)$$,
  '42501', null, 'B cannot declare Kuba for the started event E2'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (admin of G2) — sees nothing in G1, writes nothing there
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty($$select * from public.child_attendance$$, 'C (not in G1) sees no declarations');

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'C cannot declare a G1 child'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000001',
                                       'c0000000-0000-0000-0000-0000000000c1', true)$$,
  '42501', null, 'C cannot declare own G2 child for a G1 event'
);

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000003',
                                       'c0000000-0000-0000-0000-0000000000c1', false)$$,
  'C declares Zosia as not going to E3'
);

reset role;

-- ---------------------------------------------------------------------------
-- Same-group foreign keys (as postgres, bypassing RLS)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c1',
            '10000000-0000-0000-0000-000000000001', true)$$,
  '23503', null, 'a G2 child cannot be attached to a G1 event (child key)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c1',
            '20000000-0000-0000-0000-000000000002', true)$$,
  '23503', null, 'a G2 child cannot be attached to a G1 event (event key)'
);

-- ---------------------------------------------------------------------------
-- Cascades: deleting the event or the child removes its declarations
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
  (select count(*) from public.child_attendance where event_id = 'e0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the declarations of the deleted event are gone'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$delete from public.children
    where id = 'c0000000-0000-0000-0000-0000000000b1' returning id$$,
  array['c0000000-0000-0000-0000-0000000000b1'::uuid],
  'B deletes Kuba'
);

reset role;

select is(
  (select count(*) from public.child_attendance where child_id = 'c0000000-0000-0000-0000-0000000000b1'),
  0::bigint,
  'the declarations of the deleted child are gone'
);

select is(
  (select count(*) from public.child_attendance),
  2::bigint,
  'only Ola''s E2 and Zosia''s E3 declarations remain'
);

-- ---------------------------------------------------------------------------
-- anon — no access at all
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select * from public.child_attendance$$,
  '42501', null, 'anon cannot read child_attendance'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-000000000004',
                                       'c0000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'anon cannot call set_child_attendance'
);

reset role;

select * from finish();
rollback;
