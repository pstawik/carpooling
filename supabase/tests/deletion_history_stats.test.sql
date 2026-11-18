-- Snapshot test: the statistics of finished events are unchanged by every
-- allowed deletion and by a rejected one (PRD Business Logic "Zaangażowanie",
-- "Zakończenie terminu"; Access Control "Usunięcie z grupy": declarations of
-- finished events stay in the statistics).
-- Oracle: group_child_stats and group_driver_stats are read as A once before
-- any deletion into snapshot tables (checked against hand-computed values, so
-- the snapshot is neither empty nor trivial) and compared after every step.
-- Fixtures (all inserted as postgres):
--   G1: A (admin, parent of Ola and Lena), B (member, parent of Zosia),
--   C (member, driver).
--   Events: P (now() - 1 day, past), N (now(), the boundary: already
--   finished), F (now() + 7 days, future).
--   Children: Ola and Zosia created now() - 10 days; Lena created
--   now() + 1 second, so no finished event has starts_at >= her created_at
--   and her range is empty.
--   P: Ola going, Zosia not going; A and C drive.
--   N: Ola going, Zosia no declaration; C drives.
--   F: Ola and Lena going; A and C drive.
-- Hand-computed statistics (identical before and after every step):
--   drives: A 1 (P), B 0, C 2 (P, N); F is in the future and never counts.
--   children: Ola present 2 (P, N), absent 0; Zosia present 0, absent 2
--   (P not going + N no declaration); Lena 0 / 0 (empty range).
-- Steps (Lena is deleted before F, so the cascade of her only declaration,
-- on F, is observable): 1. A deletes Lena; 2. A deletes F; 3. B tries to
-- delete Zosia, who has a declaration on P (0 rows); 4. C is removed from G1.
-- The test runs in one transaction, so now() is constant throughout: N starts
-- exactly at the now() the stats functions and the policies see.
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com',
   '{"first_name": "Anna", "nick": "Mama Oli"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com',
   '{"first_name": "Bartek", "nick": "Tata Zosi"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c@example.com',
   '{"first_name": "Cezary", "nick": "Kierowca"}'::jsonb);

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'member');

-- Lena is added one second after now(), so her statistics range is empty.
insert into public.children (id, group_id, parent_id, name, created_at) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Ola', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'Zosia', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Lena', now() + interval '1 second');

-- P, N, F. Started events cannot be created through RLS, so all are inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now(), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   now() + interval '7 days', '00000000-0000-0000-0000-0000000000a1');

-- P: Ola going, Zosia not going. N: Ola going. F: Ola and Lena going.
insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a2',
   '10000000-0000-0000-0000-000000000001', true);

-- P: A and C drive. N: C drives. F: A and C drive.
insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001', 2);

-- Snapshot tables, filled as A (the stats return nothing to a non-member).
-- nick is left out: C's nick is no longer visible to A once C leaves G1.
create temp table child_snapshot (name text primary key, present integer, absent integer)
  on commit drop;
create temp table driver_snapshot (user_id uuid primary key, drives integer)
  on commit drop;
grant select, insert on child_snapshot, driver_snapshot to authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot before any deletion, as A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

insert into child_snapshot
  select name, present, absent
  from public.group_child_stats('10000000-0000-0000-0000-000000000001');

insert into driver_snapshot
  select user_id, drives
  from public.group_driver_stats('10000000-0000-0000-0000-000000000001');

-- Lena: range empty (created after every finished event) -> 0 / 0, so
-- deleting her can remove no history.
-- Ola: range P, N -> present 2, absent 0.
-- Zosia: range P, N -> present 0, absent 2 (P not going + N no declaration).
select results_eq(
  $$select name, present, absent from child_snapshot order by name$$,
  $$values ('Lena'::text, 0, 0),
           ('Ola'::text, 2, 0),
           ('Zosia'::text, 0, 2)$$,
  'before deletions: Ola is present twice, Zosia absent twice, Lena has no finished events'
);

-- A: P (Ola going) = 1. B: no drives = 0. C: P and N (Ola going on both) = 2.
-- F is in the future and does not count.
select results_eq(
  $$select user_id, drives from driver_snapshot order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 1),
           ('00000000-0000-0000-0000-0000000000b1'::uuid, 0),
           ('00000000-0000-0000-0000-0000000000c1'::uuid, 2)$$,
  'before deletions: A drove once, B never, C twice on finished events'
);

-- ---------------------------------------------------------------------------
-- Step 1: A deletes Lena (no history, empty range)
-- ---------------------------------------------------------------------------

delete from public.children where id = 'c0000000-0000-0000-0000-0000000000a2';

select is_empty(
  $$select id from public.children where id = 'c0000000-0000-0000-0000-0000000000a2'$$,
  'a parent can delete a child without history'
);

-- Other children unchanged: Ola 2 / 0, Zosia 0 / 2; only Lena's 0 / 0 row is gone.
select results_eq(
  $$select name, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$select name, present, absent from child_snapshot where name <> 'Lena' order by name$$,
  'after deleting a child without history: the other children''s statistics are unchanged'
);

-- Drives unchanged: A 1, B 0, C 2.
select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$select user_id, drives from driver_snapshot order by user_id$$,
  'after deleting a child without history: drive statistics are unchanged'
);

reset role;

-- Checked as postgres, so RLS cannot hide a surviving row.
select is_empty(
  $$select event_id from public.child_attendance
    where child_id = 'c0000000-0000-0000-0000-0000000000a2'$$,
  'the deleted child''s declaration on the future event is gone with the child'
);

-- ---------------------------------------------------------------------------
-- Step 2: A (group admin) deletes the future event F
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

delete from public.events where id = 'e0000000-0000-0000-0000-000000000003';

select is_empty(
  $$select id from public.events where id = 'e0000000-0000-0000-0000-000000000003'$$,
  'a group admin can delete a future event'
);

-- Ola 2 / 0, Zosia 0 / 2: F was never in anyone's range.
select results_eq(
  $$select name, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$select name, present, absent from child_snapshot where name <> 'Lena' order by name$$,
  'after deleting a future event: child statistics are unchanged'
);

-- A 1, B 0, C 2: the drives on F never counted.
select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$select user_id, drives from driver_snapshot order by user_id$$,
  'after deleting a future event: drive statistics are unchanged'
);

-- ---------------------------------------------------------------------------
-- Step 3: B tries to delete Zosia, who has a declaration on the finished P
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

-- The policy rejects the row, so the delete matches 0 rows.
delete from public.children where id = 'c0000000-0000-0000-0000-0000000000b1';

select results_eq(
  $$select name from public.children where id = 'c0000000-0000-0000-0000-0000000000b1'$$,
  $$values ('Zosia'::text)$$,
  'a parent cannot delete a child with a declaration on a finished event'
);

-- Read as B: Ola 2 / 0, Zosia 0 / 2.
select results_eq(
  $$select name, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$select name, present, absent from child_snapshot where name <> 'Lena' order by name$$,
  'after a rejected child deletion: child statistics are unchanged'
);

-- Read as B: A 1, B 0, C 2.
select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$select user_id, drives from driver_snapshot order by user_id$$,
  'after a rejected child deletion: drive statistics are unchanged'
);

reset role;

-- ---------------------------------------------------------------------------
-- Step 4: C (the driver) is removed from G1
-- ---------------------------------------------------------------------------

delete from public.group_members
  where group_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '00000000-0000-0000-0000-0000000000c1';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- A 1, B 0, C 2: C's driver rows on P and N stay (both have started), so the
-- former member C stays listed with 2 drives.
select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    order by user_id$$,
  $$select user_id, drives from driver_snapshot order by user_id$$,
  'after removing a member: their drives on finished events stay in the statistics'
);

-- Ola 2 / 0, Zosia 0 / 2.
select results_eq(
  $$select name, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$select name, present, absent from child_snapshot where name <> 'Lena' order by name$$,
  'after removing a member: child statistics are unchanged'
);

reset role;

select * from finish();
rollback;
