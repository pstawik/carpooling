-- Boundary tests for the declaration lock on public.child_attendance and
-- public.event_drivers (PRD FR-014, FR-015 and Business Logic "Zakończenie
-- terminu").
-- Oracle: a child's status and a driver declaration can be set, changed and
-- (for drivers) withdrawn until the event starts; from starts_at <= now()
-- they are read-only.
-- Fixtures (all inserted as postgres):
--   G: A (member, parent of Ola and Kuba), B (member).
--   Events: L (now(), the boundary: already started, locked), O (now() +
--   1 second, still open).
--   L: Ola not going (declared before the start); A drives with 3 seats.
-- The test runs in one transaction, so now() is constant throughout: L starts
-- exactly at the now() the policies see.
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lock-a@example.com',
   '{"first_name": "Anna", "nick": "Mama Oli"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lock-b@example.com',
   '{"first_name": "Bartek", "nick": "Tata Bartka"}'::jsonb);

insert into public.groups (id, name) values
  ('30000000-0000-0000-0000-0000000000d1', 'Granica');

insert into public.group_members (group_id, user_id, role) values
  ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'member'),
  ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'member');

insert into public.children (id, group_id, parent_id, name) values
  ('c0000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1', 'Ola'),
  ('c0000000-0000-0000-0000-0000000000d2', '30000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1', 'Kuba');

-- L and O. A started event cannot be created through RLS, so both are inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1',
   now(), '00000000-0000-0000-0000-0000000000d1'),
  ('e0000000-0000-0000-0000-0000000000d2', '30000000-0000-0000-0000-0000000000d1',
   now() + interval '1 second', '00000000-0000-0000-0000-0000000000d1');

-- L: declarations made before it started.
insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000d1',
   '30000000-0000-0000-0000-0000000000d1', false);

insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
   '30000000-0000-0000-0000-0000000000d1', 3);

-- ---------------------------------------------------------------------------
-- Child status (FR-014), as parent A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-0000000000d2',
                                       'c0000000-0000-0000-0000-0000000000d1', true)$$,
  'A can still declare Ola as going one second before the start'
);

select results_eq(
  $$select child_id, going from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-0000000000d2'$$,
  $$values ('c0000000-0000-0000-0000-0000000000d1'::uuid, true)$$,
  'one second before the start, Ola''s new declaration is saved as going'
);

select lives_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-0000000000d2',
                                       'c0000000-0000-0000-0000-0000000000d1', false)$$,
  'A can still change Ola''s declaration one second before the start'
);

select results_eq(
  $$select child_id, going from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-0000000000d2'$$,
  $$values ('c0000000-0000-0000-0000-0000000000d1'::uuid, false)$$,
  'one second before the start, the change replaces Ola''s declaration with not going'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-0000000000d1',
                                       'c0000000-0000-0000-0000-0000000000d2', true)$$,
  '42501', null, 'from the moment the event starts, A cannot declare Kuba any more'
);

select throws_ok(
  $$select public.set_child_attendance('e0000000-0000-0000-0000-0000000000d1',
                                       'c0000000-0000-0000-0000-0000000000d1', true)$$,
  '42501', null, 'from the moment the event starts, A cannot change Ola''s declaration'
);

select is_empty(
  $$update public.child_attendance set going = true
    where event_id = 'e0000000-0000-0000-0000-0000000000d1' returning child_id$$,
  'from the moment the event starts, A''s direct update of Ola''s declaration affects 0 rows'
);

reset role;

select results_eq(
  $$select child_id, going from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-0000000000d1'$$,
  $$values ('c0000000-0000-0000-0000-0000000000d1'::uuid, false)$$,
  'the started event keeps only Ola''s declaration from before the start, still not going'
);

-- ---------------------------------------------------------------------------
-- Driver declaration (FR-015), as members A and B
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-0000000000d2', 3)$$,
  'A can still declare driving one second before the start'
);

select lives_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-0000000000d2', 5)$$,
  'A can still change the number of seats one second before the start'
);

select results_eq(
  $$select user_id, seats from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-0000000000d2'$$,
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid, 5::smallint)$$,
  'one second before the start, A''s declaration holds the changed 5 seats'
);

-- The withdrawal as the app does it (withdrawEventDriver): a DELETE that
-- returns the deleted rows.
select results_eq(
  $$delete from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-0000000000d2'
      and user_id = '00000000-0000-0000-0000-0000000000d1' returning event_id$$,
  array['e0000000-0000-0000-0000-0000000000d2'::uuid],
  'A can still withdraw the driver declaration one second before the start'
);

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-0000000000d1', 2)$$,
  '42501', null, 'from the moment the event starts, A cannot change the number of seats'
);

select is_empty(
  $$update public.event_drivers set seats = 2
    where event_id = 'e0000000-0000-0000-0000-0000000000d1' returning user_id$$,
  'from the moment the event starts, A''s direct update of the driver declaration affects 0 rows'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-0000000000d1'
      and user_id = '00000000-0000-0000-0000-0000000000d1' returning event_id$$,
  'from the moment the event starts, A cannot withdraw the driver declaration (0 rows deleted)'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';

select throws_ok(
  $$select public.set_event_driver('e0000000-0000-0000-0000-0000000000d1', 4)$$,
  '42501', null, 'from the moment the event starts, B cannot declare driving any more'
);

reset role;

select results_eq(
  $$select user_id, seats from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-0000000000d1'$$,
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid, 3::smallint)$$,
  'the started event keeps only A''s driver declaration from before the start, still 3 seats'
);

select * from finish();
rollback;
