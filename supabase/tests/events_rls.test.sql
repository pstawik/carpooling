-- RLS and privilege tests for public.events.
-- Fixtures: A (admin of G1), B (member of G1), C (admin of G2), D (in no group);
-- a future event in G1 (added by A) and a past event in G1 (inserted as postgres);
-- the weekly-generator section adds a future G1 and a future G2 event (as postgres).
-- The test runs in one transaction, so now() is constant throughout.
begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'events', 'public.events exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  true,
  'RLS is enabled on public.events'
);

select policies_are(
  'public',
  'events',
  array[
    'events_select_group_member',
    'events_insert_group_admin',
    'events_update_group_admin',
    'events_delete_group_admin'
  ],
  'events has exactly the four per-operation policies'
);

select is(
  (select bool_or(has_table_privilege('anon', 'public.events', p))
    from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p),
  false,
  'anon has no privileges on events'
);

select is(
  has_table_privilege('authenticated', 'public.events', 'truncate'),
  false,
  'authenticated has no TRUNCATE on events'
);

select is(
  has_table_privilege('authenticated', 'public.events', 'update'),
  false,
  'authenticated has no table-level UPDATE on events'
);

select is(
  has_column_privilege('authenticated', 'public.events', 'starts_at', 'update'),
  true,
  'authenticated may UPDATE events.starts_at'
);

select is(
  has_column_privilege('authenticated', 'public.events', 'note', 'update'),
  true,
  'authenticated may UPDATE events.note'
);

select is(
  has_column_privilege('authenticated', 'public.events', 'group_id', 'update'),
  false,
  'authenticated may not UPDATE events.group_id'
);

select is(
  has_column_privilege('authenticated', 'public.events', 'created_by', 'update'),
  false,
  'authenticated may not UPDATE events.created_by'
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

-- A started event cannot be created through RLS, so it is inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------------------
-- As user A (admin of G1) — inserts
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$insert into public.events (id, group_id, starts_at, note)
    values ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
            now() + interval '7 days', 'Trening')$$,
  'A adds a future event in G1'
);

select results_eq(
  $$select id, created_by from public.events order by id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid),
           ('e0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'A sees both G1 events, and created_by defaults to A'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() - interval '1 hour')$$,
  '42501', null, 'A cannot add an event that starts in the past'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at, created_by)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '9 days',
            '00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'A cannot add an event with created_by spoofed as B'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '7 days')$$,
  '23505', null, 'A cannot add a second G1 event with the same start'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at, note)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '8 days', repeat('x', 201))$$,
  '23514', null, 'a 201-character note violates events_note_length'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at, note)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '8 days', '   ')$$,
  '23514', null, 'a blank note violates events_note_length'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user B (member of G1) — reads, cannot write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select id from public.events order by id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid), ('e0000000-0000-0000-0000-000000000002'::uuid)$$,
  'member B sees both G1 events'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '9 days')$$,
  '42501', null, 'member B cannot add an event in G1'
);

select is_empty(
  $$update public.events set note = 'Hacked'
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  'B''s update of a G1 event affects 0 rows'
);

select is_empty(
  $$delete from public.events
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  'B''s delete of a G1 event affects 0 rows'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (admin of G2) and D (in no group) — see nothing, write nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty($$select * from public.events$$, 'admin of another group C sees no G1 events');

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '9 days')$$,
  '42501', null, 'C cannot add an event in G1'
);

select is_empty(
  $$update public.events set note = 'Hacked'
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  'C''s update of a G1 event affects 0 rows'
);

select is_empty(
  $$delete from public.events
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  'C''s delete of a G1 event affects 0 rows'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select is_empty($$select * from public.events$$, 'stranger D sees no events');

reset role;

-- ---------------------------------------------------------------------------
-- As user A again — reschedule, lock after start, immutability, delete
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$update public.events set starts_at = now() + interval '10 days'
    where id = 'e0000000-0000-0000-0000-000000000001' returning starts_at$$,
  $$values (now() + interval '10 days')$$,
  'A moves the future event to another future time'
);

select throws_ok(
  $$update public.events set starts_at = now() - interval '2 days'
    where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A cannot move an event into the past'
);

select is_empty(
  $$update public.events set note = 'Late edit'
    where id = 'e0000000-0000-0000-0000-000000000002' returning id$$,
  'A''s update of a started event affects 0 rows'
);

select throws_ok(
  $$update public.events set group_id = '20000000-0000-0000-0000-000000000002'
    where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A cannot change the group of an event'
);

select is_empty(
  $$delete from public.events
    where id = 'e0000000-0000-0000-0000-000000000002' returning id$$,
  'A''s delete of a started event affects 0 rows'
);

select is(
  (select count(*) from public.events where id = 'e0000000-0000-0000-0000-000000000002'),
  1::bigint,
  'the started event is kept'
);

select results_eq(
  $$delete from public.events
    where id = 'e0000000-0000-0000-0000-000000000001' returning id$$,
  array['e0000000-0000-0000-0000-000000000001'::uuid],
  'A deletes the future event'
);

select is_empty(
  $$select * from public.events where id = 'e0000000-0000-0000-0000-000000000001'$$,
  'the deleted event is gone'
);

reset role;

-- ---------------------------------------------------------------------------
-- Weekly generator: batch insert ... on conflict do nothing (the statement
-- generateEvents issues). Fresh fixtures as postgres: a future G1 event (the
-- one above was deleted) and a future G2 event.
-- ---------------------------------------------------------------------------

insert into public.events (id, group_id, starts_at, note, created_by) values
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   now() + interval '14 days', 'Trening', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002',
   now() + interval '21 days', null, '00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- Returning the start instead of the (random) id shows which single row was created.
select results_eq(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '14 days'),
           ('10000000-0000-0000-0000-000000000001', now() + interval '15 days')
    on conflict (group_id, starts_at) do nothing
    returning starts_at$$,
  $$values (now() + interval '15 days')$$,
  'A''s batch insert skips the colliding start and returns only the new row'
);

select results_eq(
  $$select id, note, created_by from public.events
    where group_id = '10000000-0000-0000-0000-000000000001' and starts_at = now() + interval '14 days'$$,
  $$values ('e0000000-0000-0000-0000-000000000003'::uuid, 'Trening'::text,
            '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'the colliding G1 event is left unchanged'
);

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '16 days'),
           ('10000000-0000-0000-0000-000000000001', now() - interval '2 hours')
    on conflict (group_id, starts_at) do nothing
    returning id$$,
  '42501', null, 'one past row makes RLS reject A''s whole batch'
);

select results_eq(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '21 days')
    on conflict (group_id, starts_at) do nothing
    returning starts_at$$,
  $$values (now() + interval '21 days')$$,
  'A adds a G1 event at the same start as a G2 event (duplicates are per group)'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '22 days'),
           ('10000000-0000-0000-0000-000000000001', now() + interval '23 days')
    on conflict (group_id, starts_at) do nothing
    returning id$$,
  '42501', null, 'member B cannot batch-insert events in G1'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$insert into public.events (group_id, starts_at)
    values ('10000000-0000-0000-0000-000000000001', now() + interval '22 days'),
           ('10000000-0000-0000-0000-000000000001', now() + interval '23 days')
    on conflict (group_id, starts_at) do nothing
    returning id$$,
  '42501', null, 'C (admin of G2) cannot batch-insert events in G1'
);

reset role;

select * from finish();
rollback;
