-- Tests for the group_members_delete_future_declarations trigger: removing a
-- member deletes their driver declarations and their children's attendance on
-- the group's future events; declarations on started events stay.
-- Fixtures (all inserted as postgres):
--   G1: A (admin, parent of Ala), B (member, driver), C (member, parent of Ola).
--   G2: B (admin), with a driver declaration on its future event F2.
--   G1 events: F (now() + 7 days, future), S (now(), the boundary: already
--   started, since future means starts_at > now()), P (now() - 7 days, past).
--   F: A drives 1 seat, B drives 3; Ala and Ola going.
--   S and P: B drives 2 seats, Ola going.
-- The balance is read as A, a remaining member, under RLS, the way the event
-- plan reads it (listEventDrivers, listEventAttendance).
-- The test runs in one transaction, so now() is constant throughout: S starts
-- exactly at the now() the trigger sees.
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_function(
  'public', 'delete_future_declarations_of_member', array[]::name[],
  'delete_future_declarations_of_member() exists'
);

select is(
  (select prosecdef from pg_proc
    where oid = 'public.delete_future_declarations_of_member()'::regprocedure),
  true,
  'delete_future_declarations_of_member is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.delete_future_declarations_of_member()', 'execute')
    or has_function_privilege('anon', 'public.delete_future_declarations_of_member()', 'execute'),
  false,
  'neither authenticated nor anon can execute delete_future_declarations_of_member'
);

select has_trigger(
  'public', 'group_members', 'group_members_delete_future_declarations',
  'the delete trigger exists on group_members'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com',
   '{"first_name": "Anna", "nick": "Mama Ali"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com',
   '{"first_name": "Bartek", "nick": "Tata kierowca"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c@example.com',
   '{"first_name": "Celina", "nick": "Mama Oli"}'::jsonb);

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1'),
  ('20000000-0000-0000-0000-000000000002', 'G2');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'member'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'admin');

insert into public.children (id, group_id, parent_id, name) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Ala'),
  ('c0000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000c1', 'Ola');

-- F, S, P in G1; F2 in G2. Started events cannot be created through RLS.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   now() + interval '7 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now(), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   now() - interval '7 days', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002',
   now() + interval '8 days', '00000000-0000-0000-0000-0000000000b1');

insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 1),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b1',
   '20000000-0000-0000-0000-000000000002', 2);

insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Before any removal, as A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- F: A 1 + B 3 = 4 seats.
select is(
  (select sum(seats) from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000003'),
  4::bigint,
  'before removal: F has 4 seats (A 1 + B 3)'
);

-- F: Ala + Ola = 2 going; 4 >= 2, enough seats.
select is(
  (select count(*) from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000003' and going),
  2::bigint,
  'before removal: 2 children going on F (Ala, Ola)'
);

reset role;

-- ---------------------------------------------------------------------------
-- B (the driver) is removed from G1
-- ---------------------------------------------------------------------------

delete from public.group_members
  where group_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '00000000-0000-0000-0000-0000000000b1';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- F: only A's 1 seat is left (B's 3 removed).
select is(
  (select sum(seats) from public.event_drivers
    where event_id = 'e0000000-0000-0000-0000-000000000003'),
  1::bigint,
  'after removing B: F has 1 seat (A only)'
);

-- F: Ala + Ola still going = 2.
select is(
  (select count(*) from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000003' and going),
  2::bigint,
  'after removing B: still 2 children going on F'
);

-- F: 1 seat < 2 going -> 1 missing (2 - 1 = 1).
select is(
  (select count(*) from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000003' and going)
  - (select sum(seats) from public.event_drivers
      where event_id = 'e0000000-0000-0000-0000-000000000003'),
  1::bigint,
  'after removing B: F is short by 1 seat'
);

-- S starts exactly at now(), so it is not future: B's S and P rows stay.
select results_eq(
  $$select event_id from public.event_drivers
    where user_id = '00000000-0000-0000-0000-0000000000b1'
    order by event_id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid),
           ('e0000000-0000-0000-0000-000000000002'::uuid)$$,
  'B''s driver declarations on the started S and the past P stay in G1'
);

reset role;

-- ---------------------------------------------------------------------------
-- C (Ola's parent) is removed from G1
-- ---------------------------------------------------------------------------

delete from public.group_members
  where group_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '00000000-0000-0000-0000-0000000000c1';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- F: Ola removed, only Ala going = 1.
select is(
  (select count(*) from public.child_attendance
    where event_id = 'e0000000-0000-0000-0000-000000000003' and going),
  1::bigint,
  'after removing C: 1 child going on F (Ala only)'
);

-- S (boundary) and P are not future: Ola's rows stay.
select results_eq(
  $$select event_id from public.child_attendance
    where child_id = 'c0000000-0000-0000-0000-0000000000c1'
    order by event_id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid),
           ('e0000000-0000-0000-0000-000000000002'::uuid)$$,
  'Ola''s declarations on the started S and the past P stay'
);

reset role;

select is(
  (select count(*) from public.children where id = 'c0000000-0000-0000-0000-0000000000c1'),
  1::bigint,
  'the child Ola still exists after C is removed'
);

-- ---------------------------------------------------------------------------
-- Other groups of the removed member are untouched, as B in G2
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select event_id, seats from public.event_drivers
    where group_id = '20000000-0000-0000-0000-000000000002'$$,
  $$values ('e0000000-0000-0000-0000-000000000004'::uuid, 2::smallint)$$,
  'B''s future declaration in G2 stays after B is removed from G1'
);

reset role;

select * from finish();
rollback;
