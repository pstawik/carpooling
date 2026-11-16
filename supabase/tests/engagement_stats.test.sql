-- Tests for public.group_driver_stats() and public.group_child_stats().
-- Fixtures: A (admin of G1, parent of Ola), B (member of G1, parent of Zosia),
-- D (member of G1, no children and no declarations), C (admin of G2, parent
-- of Kuba in G2, not in G1; made an app admin before its own block).
-- G1 events: T1 (finished, before Zosia was added), T2, T3, T5 (finished,
-- after both children were added), T4 (future). G2 event TG (finished).
-- Everything is inserted as postgres; the test runs in one transaction, so
-- now() is constant throughout.
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_function('public', 'group_driver_stats', array['uuid'], 'group_driver_stats(uuid) exists');

select has_function('public', 'group_child_stats', array['uuid'], 'group_child_stats(uuid) exists');

select is(
  (select bool_or(prosecdef) from pg_proc
    where oid in ('public.group_driver_stats(uuid)'::regprocedure,
                  'public.group_child_stats(uuid)'::regprocedure)),
  false,
  'both stats functions are security invoker'
);

select is(
  has_function_privilege('anon', 'public.group_driver_stats(uuid)', 'execute'),
  false,
  'anon cannot execute group_driver_stats'
);

select is(
  has_function_privilege('anon', 'public.group_child_stats(uuid)', 'execute'),
  false,
  'anon cannot execute group_child_stats'
);

select is(
  has_function_privilege('authenticated', 'public.group_driver_stats(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.group_child_stats(uuid)', 'execute'),
  true,
  'authenticated can execute both stats functions'
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
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'admin');

-- Ola is added before T1, Zosia between T1 and T2.
insert into public.children (id, group_id, parent_id, name, created_at) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Ola', now() - interval '30 days'),
  ('c0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'Zosia', now() - interval '15 days'),
  ('c0000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000c1', 'Kuba', now() - interval '30 days');

-- Started events cannot be created through RLS, so all events are inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   now() - interval '20 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now() - interval '10 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   now() - interval '5 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   now() + interval '7 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000002',
   now() - interval '2 days', '00000000-0000-0000-0000-0000000000c1');

-- Ola: T1 going, T2 not going, T3 going, T5 not going, T4 (future) going.
-- Zosia: T2 going, T3 going, T5 no declaration.
-- Kuba (G2): TG going.
insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000c1',
   '20000000-0000-0000-0000-000000000002', true);

-- A drives T1, T3 and T5 (no child went on T5); B drives T2 and T4 (future);
-- C drives TG in G2.
insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1',
   '20000000-0000-0000-0000-000000000002', 4);

-- ---------------------------------------------------------------------------
-- As user A (member of G1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- A: T1 and T3 count (T3 once despite two children going), T5 does not (no
-- child went). B: T2 counts, T4 is in the future. D: listed with 0. No G2 rows.
select results_eq(
  $$select user_id, nick, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'Mama Ani'::text, 2),
           ('00000000-0000-0000-0000-0000000000b1'::uuid, 'Tata Bartka'::text, 1),
           ('00000000-0000-0000-0000-0000000000d1'::uuid, 'Tata Dawida'::text, 0)$$,
  'driver stats: drives need a going child, count each event once, skip future events, list members with 0'
);

-- Ola: range T1, T2, T3, T5 -> present 2 (T1, T3), absent 2 (T2, T5); T4 is
-- in the future. Zosia: range T2, T3, T5 (T1 is before she was added) ->
-- present 2, absent 1 (T5 has no declaration). No G2 rows.
select results_eq(
  $$select child_id, name, parent_nick, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$values ('c0000000-0000-0000-0000-0000000000a1'::uuid, 'Ola'::text, 'Mama Ani'::text, 2, 2),
           ('c0000000-0000-0000-0000-0000000000b1'::uuid, 'Zosia'::text, 'Tata Bartka'::text, 2, 1)$$,
  'child stats: range starts at created_at, absence = not going + no declaration, future events skipped'
);

select is_empty(
  $$select * from public.group_driver_stats('20000000-0000-0000-0000-000000000002')$$,
  'A (not in G2) gets no driver stats for G2'
);

select is_empty(
  $$select * from public.group_child_stats('20000000-0000-0000-0000-000000000002')$$,
  'A (not in G2) gets no child stats for G2'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user D (member of G1 without any declarations) — same numbers
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 2),
           ('00000000-0000-0000-0000-0000000000b1'::uuid, 1),
           ('00000000-0000-0000-0000-0000000000d1'::uuid, 0)$$,
  'any member of G1 sees the same driver stats'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (admin of G2 and app admin, not in G1) — nothing from G1, own
-- group intact. As app admin C can read G1's group_members, which must not
-- turn into a list of G1 members with 0 drives.
-- ---------------------------------------------------------------------------

insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty(
  $$select * from public.group_driver_stats('10000000-0000-0000-0000-000000000001')$$,
  'C (app admin, not in G1) gets no driver stats for G1'
);

select is_empty(
  $$select * from public.group_child_stats('10000000-0000-0000-0000-000000000001')$$,
  'C (app admin, not in G1) gets no child stats for G1'
);

select results_eq(
  $$select user_id, nick, drives
    from public.group_driver_stats('20000000-0000-0000-0000-000000000002')$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 'Mama Celiny'::text, 1)$$,
  'C''s driver stats for G2 count only G2'
);

reset role;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select * from public.group_child_stats('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot call group_child_stats'
);

reset role;

select * from finish();
rollback;
