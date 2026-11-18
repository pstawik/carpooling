-- Boundary tests for public.group_driver_stats() and public.group_child_stats()
-- (PRD Business Logic "Zaangażowanie" and "Zakończenie terminu", FR-017).
-- Oracle: an event is finished from starts_at <= now(); a drive needs at
-- least one child going; a child's range starts at children.created_at
-- (inclusive); absence = explicit "not going" + no declaration.
-- Fixtures (all inserted as postgres):
--   G1: A (admin, parent of Ola and Kuba), B (member, parent of Zosia),
--   X (member, removed at the end of the fixture).
--   Events: P (now() - 1 day, past), N (now(), the boundary: already
--   finished), F (now() + 1 second, future).
--   Children: Ola created now() - 10 days; Zosia created exactly at P's
--   start; Kuba created one second after P's start.
--   P: Ola and Zosia not going, Kuba no row (outside his range); B drives.
--   N: Ola going, Zosia and Kuba no declaration; A and X drive.
--   F: Ola and Zosia going; A and B drive.
-- The test runs in one transaction, so now() is constant throughout: N starts
-- exactly at the now() the stats functions and the removal trigger see.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

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
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'x@example.com',
   '{"first_name": "Xawery", "nick": "Były kierowca"}'::jsonb);

insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'G1');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'member');

-- Zosia is added exactly when P starts, Kuba one second later.
insert into public.children (id, group_id, parent_id, name, created_at) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Ola', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'Zosia', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'Kuba', now() - interval '1 day' + interval '1 second');

-- P, N, F. Started events cannot be created through RLS, so all are inserted as owner.
insert into public.events (id, group_id, starts_at, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   now(), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   now() + interval '1 second', '00000000-0000-0000-0000-0000000000a1');

-- P: Ola and Zosia not going. N: Ola going. F: Ola and Zosia going.
insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', true);

-- P: B drives. N: A and X drive. F: A and B drive.
insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1',
   '10000000-0000-0000-0000-000000000001', 2),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-000000000001', 2);

-- X leaves G1. N has already started (starts_at = now() is not > now()), so
-- the removal trigger keeps X's driver row on N.
delete from public.group_members
  where group_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '00000000-0000-0000-0000-0000000000f1';

select results_eq(
  $$select event_id from public.event_drivers
    where user_id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values ('e0000000-0000-0000-0000-000000000002'::uuid)$$,
  'precondition: X''s driver declaration on the started N survives the removal'
);

-- ---------------------------------------------------------------------------
-- As user A (member of G1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- A: N counts (finished at starts_at = now(), Ola going) = 1; F is one second
-- in the future = 0 -> 1.
-- B: P does not count (Ola and Zosia not going, no child went) = 0; F is in
-- the future = 0 -> 0.
select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    where user_id in ('00000000-0000-0000-0000-0000000000a1',
                      '00000000-0000-0000-0000-0000000000b1')
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 1),
           ('00000000-0000-0000-0000-0000000000b1'::uuid, 0)$$,
  'driver stats: an event starting at now() is finished, one second later is not, a drive needs a going child'
);

-- Ola (created 10 days ago): range P, N (F in the future) -> present 1 (N
-- going), absent 1 (P not going).
-- Zosia (created exactly at P's start): range P, N (P counts, since
-- starts_at = created_at) -> present 0, absent 2 (P not going + N no
-- declaration).
-- Kuba (created one second after P's start): range N only -> present 0,
-- absent 1 (N no declaration).
select results_eq(
  $$select name, present, absent
    from public.group_child_stats('10000000-0000-0000-0000-000000000001')
    order by name$$,
  $$values ('Kuba'::text, 0, 1),
           ('Ola'::text, 1, 1),
           ('Zosia'::text, 0, 2)$$,
  'child stats: range includes an event starting at created_at, excludes one before it, includes the event at now()'
);

-- X drove on N (Ola going) before leaving -> 1 drive. Former members are
-- not listed yet; the PRD (Access Control) keeps them in the statistics.
select todo('faza 2 planu testów: byli członkowie zostają w statystykach (PRD Access Control)', 1);

select results_eq(
  $$select user_id, drives
    from public.group_driver_stats('10000000-0000-0000-0000-000000000001')
    where user_id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values ('00000000-0000-0000-0000-0000000000f1'::uuid, 1)$$,
  'driver stats: the former member X stays listed with 1 drive'
);

reset role;

select * from finish();
rollback;
