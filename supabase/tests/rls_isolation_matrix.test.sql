-- RLS isolation matrix (risk #3): who may read and write the group data of
-- group G1, asserted per role and per operation.
--
-- Rules of this file:
-- * The oracle is the PRD (context/foundation/prd.md), not the policies: every
--   expectation is a literal fixture id plus "sees / sees nothing / 42501".
--   No assertion restates a policy predicate. Cells where the PRD is silent
--   ("?") follow the decision quoted in the description (decyzja: <file>,
--   paths relative to context/).
-- * Each operation separately: S, I, U and D are asserted on their own for
--   every role; a denied SELECT says nothing about UPDATE or DELETE.
-- * Denial + state: an UPDATE/DELETE filtered by RLS is is_empty(... returning),
--   then, as postgres, the fixture row is checked to be unchanged. A missing
--   privilege or a failed WITH CHECK is throws_ok(..., '42501').
-- * Database independent: every query is narrowed to fixture ids; no table is
--   counted as a whole. Ids use prefixes owned by this file (5a users, 5b
--   groups, 5c children, 5e events) and e-mails rlsm-<role>@example.test.
-- * Writes after an event's start: one assertion per declaration table (the
--   owner B); the start boundary itself is in declaration_lock_boundary.test.sql.
--
-- Roles (G1, G2 = groups):
--   anon  not logged in                                   (jwt role anon)
--   O     logged in, in no group                          5a...e1
--   C     admin of G2 ("other group")                     5a...c1
--   X     app admin (row in app_admins), in no group      5a...f1
--   M     member of G1, no rights to B's rows             5a...d1
--   A     admin of G1, acting on B's rows                 5a...a1
--   B     member of G1, owner: parent, driver, declarant  5a...b1
--   F     member of G1, former member in Phase 4          5a...f2
--
-- Fixtures (as postgres):
--   children  CB1 5c...01 (B, G1, attendance on started ES = history)
--             CB2 5c...02 (B, G1, no history: target of U/D)
--             CC  5c...03 (C, G2)
--   events    EF1 5e...01 (G1, +1 day, note 'Trening')
--             EF2 5e...02 (G1, +2 days, no declarations: target of inserts)
--             ES  5e...03 (G1, started -1 hour, note 'Mecz')
--             EG2 5e...04 (G2, +1 day)
--   child_attendance  (EF1, CB1) going, (ES, CB1) going, (EG2, CC) going
--   event_drivers     (EF1, B) 3 seats, (ES, B) 2 seats, (EG2, C) 4 seats
--
-- Coverage (Y = allowed and asserted positive, N = denied and asserted,
-- 42501 = privilege error; "(B)" = B's rows):
--
--   table / op                  anon   O  C  X  M  A  B
--   children S                  42501  N  N  N  Y  Y  Y
--   children I (into G1)        42501  N  N  N  N  N  Y   (A as own parent: Y)
--   children U (B)              42501  N  N  N  N  N  Y
--   children D (B)              42501  N  N  N  N  N  Y
--   events S                    42501  N  N  N  Y  Y  Y
--   events I (into G1)          42501  N  N  N  N  Y  N
--   events U (future)           42501  N  N  N  N  Y  N   (A on started: N)
--   events D (future)           42501  N  N  N  N  Y  N   (A on started: N)
--   child_attendance S (B)      42501  N  N  N  Y  Y  Y
--   child_attendance I (B)      42501  N  N  N  N  N  Y
--   child_attendance U (B)      42501  N  N  N  N  N  Y   (B after start: N)
--   child_attendance D (B)      42501  42501 for every role, B included
--   event_drivers S (B)         42501  N  N  N  Y  Y  Y
--   event_drivers I (B)         42501  N  N  N  N  N  Y
--   event_drivers U (B)         42501  N  N  N  N  N  Y
--   event_drivers D (B)         42501  N  N  N  N  N  Y   (B after start: N)
--
-- The test runs in one transaction, so now() is constant throughout.
begin;

create extension if not exists pgtap with schema extensions;

select plan(142);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('5a000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-a@example.test',
   '{"first_name": "Anna", "nick": "Admin G1"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-b@example.test',
   '{"first_name": "Bartek", "nick": "Wlasciciel"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-c@example.test',
   '{"first_name": "Celina", "nick": "Admin G2"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-m@example.test',
   '{"first_name": "Marek", "nick": "Czlonek G1"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-o@example.test',
   '{"first_name": "Olga", "nick": "Spoza grup"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-x@example.test',
   '{"first_name": "Xawery", "nick": "Admin aplikacji"}'::jsonb),
  ('5a000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rlsm-f@example.test',
   '{"first_name": "Filip", "nick": "Byly czlonek"}'::jsonb);

insert into public.app_admins (user_id) values ('5a000000-0000-0000-0000-0000000000f1');

insert into public.groups (id, name) values
  ('5b000000-0000-0000-0000-000000000001', 'RLSM G1'),
  ('5b000000-0000-0000-0000-000000000002', 'RLSM G2');

insert into public.group_members (group_id, user_id, role) values
  ('5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-0000000000a1', 'admin'),
  ('5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-0000000000b1', 'member'),
  ('5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-0000000000d1', 'member'),
  ('5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-0000000000f2', 'member'),
  ('5b000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000c1', 'admin');

insert into public.children (id, group_id, parent_id, name) values
  ('5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001',
   '5a000000-0000-0000-0000-0000000000b1', 'Kuba'),
  ('5c000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001',
   '5a000000-0000-0000-0000-0000000000b1', 'Ola'),
  ('5c000000-0000-0000-0000-000000000003', '5b000000-0000-0000-0000-000000000002',
   '5a000000-0000-0000-0000-0000000000c1', 'Zosia');

-- A started event cannot be created through RLS, so all events are inserted as owner.
insert into public.events (id, group_id, starts_at, note, created_by) values
  ('5e000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001',
   now() + interval '1 day', 'Trening', '5a000000-0000-0000-0000-0000000000a1'),
  ('5e000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001',
   now() + interval '2 days', null, '5a000000-0000-0000-0000-0000000000a1'),
  ('5e000000-0000-0000-0000-000000000003', '5b000000-0000-0000-0000-000000000001',
   now() - interval '1 hour', 'Mecz', '5a000000-0000-0000-0000-0000000000a1'),
  ('5e000000-0000-0000-0000-000000000004', '5b000000-0000-0000-0000-000000000002',
   now() + interval '1 day', null, '5a000000-0000-0000-0000-0000000000c1');

insert into public.child_attendance (event_id, child_id, group_id, going) values
  ('5e000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001',
   '5b000000-0000-0000-0000-000000000001', true),
  ('5e000000-0000-0000-0000-000000000003', '5c000000-0000-0000-0000-000000000001',
   '5b000000-0000-0000-0000-000000000001', true),
  ('5e000000-0000-0000-0000-000000000004', '5c000000-0000-0000-0000-000000000003',
   '5b000000-0000-0000-0000-000000000002', true);

insert into public.event_drivers (event_id, user_id, group_id, seats) values
  ('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-0000000000b1',
   '5b000000-0000-0000-0000-000000000001', 3),
  ('5e000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-0000000000b1',
   '5b000000-0000-0000-0000-000000000001', 2),
  ('5e000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-0000000000c1',
   '5b000000-0000-0000-0000-000000000002', 4);

-- ===========================================================================
-- children
-- S: id in (CB1, CB2, CC); I: a new child in G1; U/D: B's history-free CB2.
-- ===========================================================================

-- anon ----------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')$$,
  '42501', null, 'anon S children: 42501 (PRD :58)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000021', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000b1', 'Anon')$$,
  '42501', null, 'anon I children (G1): 42501 (PRD :146)'
);

select throws_ok(
  $$update public.children set name = 'Anon' where id = '5c000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'anon U children (B): 42501 (PRD :146)'
);

select throws_ok(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'anon D children (B): 42501 (PRD :146)'
);

reset role;

-- O: outsider ----------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is_empty(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')$$,
  'O S children: sees none (PRD :58)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000022', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000e1', 'Olgi')$$,
  '42501', null, 'O I children (G1, own parent_id): 42501 (PRD :146)'
);

select is_empty(
  $$update public.children set name = 'Olgi' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  'O U children (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  'O D children (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select name from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  $$values ('Ola'::text)$$,
  'O U/D children (B): B''s child unchanged (PRD :145)'
);

-- C: admin of the other group -----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')
    order by id$$,
  $$values ('5c000000-0000-0000-0000-000000000003'::uuid)$$,
  'C S children: sees only CC of G2, none of G1 (PRD :58)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000023', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000c1', 'Celiny')$$,
  '42501', null, 'C I children (G1, own parent_id): 42501 (PRD :146)'
);

select is_empty(
  $$update public.children set name = 'Celiny' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  'C U children (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  'C D children (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select name from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  $$values ('Ola'::text)$$,
  'C U/D children (B): B''s child unchanged (PRD :145)'
);

-- X: app admin, not a member ------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is_empty(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')$$,
  'X S children: sees none (PRD :58 | decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000024', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000f1', 'Xawerego')$$,
  '42501', null, 'X I children (G1, own parent_id): 42501 (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

select is_empty(
  $$update public.children set name = 'Xawerego' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  'X U children (B): 0 rows (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

select is_empty(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  'X D children (B): 0 rows (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

reset role;

select results_eq(
  $$select name from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  $$values ('Ola'::text)$$,
  'X U/D children (B): B''s child unchanged (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

-- M: member of G1, not the parent -------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select results_eq(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')
    order by id$$,
  $$values ('5c000000-0000-0000-0000-000000000001'::uuid), ('5c000000-0000-0000-0000-000000000002'::uuid)$$,
  'M S children: sees CB1 and CB2 of G1, not CC (PRD :58)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000025', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000b1', 'Podrzucone')$$,
  '42501', null, 'M I children (G1, parent_id B): 42501 (PRD FR-010 :92)'
);

select is_empty(
  $$update public.children set name = 'Marka' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  'M U children (B): 0 rows (PRD FR-010 :92)'
);

select is_empty(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  'M D children (B): 0 rows (PRD FR-010 :92)'
);

reset role;

select results_eq(
  $$select name from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  $$values ('Ola'::text)$$,
  'M U/D children (B): B''s child unchanged (PRD FR-010 :92)'
);

-- A: admin of G1, on B's child ----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')
    order by id$$,
  $$values ('5c000000-0000-0000-0000-000000000001'::uuid), ('5c000000-0000-0000-0000-000000000002'::uuid)$$,
  'A S children: sees CB1 and CB2 of G1, not CC (PRD :58)'
);

select throws_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000026', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000b1', 'Podrzucone')$$,
  '42501', null, 'A I children (G1, parent_id B): 42501 (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

select lives_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000012', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000a1', 'Antek')$$,
  'A I children (G1, own parent_id): allowed (PRD FR-010 :92)'
);

select is_empty(
  $$update public.children set name = 'Admina' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  'A U children (B): 0 rows (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

select is_empty(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  'A D children (B): 0 rows (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

reset role;

select results_eq(
  $$select name from public.children where id = '5c000000-0000-0000-0000-000000000002'$$,
  $$values ('Ola'::text)$$,
  'A U/D children (B): B''s child unchanged (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'
);

-- B: the parent (positive paths, run last because they change CB2) ----------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select id from public.children
    where id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002',
                 '5c000000-0000-0000-0000-000000000003')
    order by id$$,
  $$values ('5c000000-0000-0000-0000-000000000001'::uuid), ('5c000000-0000-0000-0000-000000000002'::uuid)$$,
  'B S children: sees own CB1 and CB2, not CC (PRD :58)'
);

select lives_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('5c000000-0000-0000-0000-000000000011', '5b000000-0000-0000-0000-000000000001',
            '5a000000-0000-0000-0000-0000000000b1', 'Tymek')$$,
  'B I children (G1, own): allowed (PRD FR-010 :92)'
);

select results_eq(
  $$update public.children set name = 'Ola Nowa' where id = '5c000000-0000-0000-0000-000000000002'
    returning id$$,
  $$values ('5c000000-0000-0000-0000-000000000002'::uuid)$$,
  'B U children (B): renames own CB2 (PRD FR-010 :92)'
);

select results_eq(
  $$delete from public.children where id = '5c000000-0000-0000-0000-000000000002' returning id$$,
  $$values ('5c000000-0000-0000-0000-000000000002'::uuid)$$,
  'B D children (B): deletes own history-free CB2 (PRD FR-010 :92)'
);

reset role;

select ok(
  not exists (select 1 from public.children where id = '5c000000-0000-0000-0000-000000000002'),
  'B D children (B): CB2 is gone (PRD FR-010 :92)'
);

select ok(
  not exists (
    select 1 from public.children
    where id in ('5c000000-0000-0000-0000-000000000021', '5c000000-0000-0000-0000-000000000022',
                 '5c000000-0000-0000-0000-000000000023', '5c000000-0000-0000-0000-000000000024',
                 '5c000000-0000-0000-0000-000000000025', '5c000000-0000-0000-0000-000000000026')
  ),
  'anon/O/C/X/M/A I children: no denied insert left a row (PRD :146)'
);

-- ===========================================================================
-- events
-- S: id in (EF1, ES, EG2); I: a new G1 event; U/D: future EF1 (A: own new
-- event for the positive path, started ES for the denial).
-- ===========================================================================

-- anon ----------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')$$,
  '42501', null, 'anon S events: 42501 (PRD :144)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000021', '5b000000-0000-0000-0000-000000000001',
            now() + interval '10 days')$$,
  '42501', null, 'anon I events (G1): 42501 (PRD :146)'
);

select throws_ok(
  $$update public.events set note = 'Anon' where id = '5e000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon U events (G1): 42501 (PRD :146)'
);

select throws_ok(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon D events (G1): 42501 (PRD :146)'
);

reset role;

-- O: outsider ----------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is_empty(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')$$,
  'O S events: sees none (PRD :144)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000022', '5b000000-0000-0000-0000-000000000001',
            now() + interval '11 days')$$,
  '42501', null, 'O I events (G1): 42501 (PRD FR-012 :98)'
);

select is_empty(
  $$update public.events set note = 'Olgi' where id = '5e000000-0000-0000-0000-000000000001'
    returning id$$,
  'O U events (G1): 0 rows (PRD FR-012 :98)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001' returning id$$,
  'O D events (G1): 0 rows (PRD FR-012 :98)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  $$values ('Trening'::text)$$,
  'O U/D events (G1): EF1 unchanged (PRD FR-012 :98)'
);

-- C: admin of the other group -----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')
    order by id$$,
  $$values ('5e000000-0000-0000-0000-000000000004'::uuid)$$,
  'C S events: sees only EG2 of G2, none of G1 (PRD :144)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000023', '5b000000-0000-0000-0000-000000000001',
            now() + interval '12 days')$$,
  '42501', null, 'C I events (G1): 42501, admin of G2 only (PRD :140)'
);

select is_empty(
  $$update public.events set note = 'Celiny' where id = '5e000000-0000-0000-0000-000000000001'
    returning id$$,
  'C U events (G1): 0 rows, admin of G2 only (PRD :140)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001' returning id$$,
  'C D events (G1): 0 rows, admin of G2 only (PRD :140)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  $$values ('Trening'::text)$$,
  'C U/D events (G1): EF1 unchanged (PRD :140)'
);

-- X: app admin, not a member ------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is_empty(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')$$,
  'X S events: sees none (decyzja: archive/2026-11-12-group-admin-manages-events/plan.md:38)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000024', '5b000000-0000-0000-0000-000000000001',
            now() + interval '13 days')$$,
  '42501', null, 'X I events (G1): 42501 (decyzja: archive/2026-11-12-group-admin-manages-events/plan.md:38)'
);

select is_empty(
  $$update public.events set note = 'Xawerego' where id = '5e000000-0000-0000-0000-000000000001'
    returning id$$,
  'X U events (G1): 0 rows (decyzja: archive/2026-11-12-group-admin-manages-events/plan.md:38)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001' returning id$$,
  'X D events (G1): 0 rows (decyzja: archive/2026-11-12-group-admin-manages-events/plan.md:38)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  $$values ('Trening'::text)$$,
  'X U/D events (G1): EF1 unchanged (decyzja: archive/2026-11-12-group-admin-manages-events/plan.md:38)'
);

-- M: member of G1, not an admin ---------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select results_eq(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')
    order by id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid), ('5e000000-0000-0000-0000-000000000003'::uuid)$$,
  'M S events: sees EF1 and ES of G1, not EG2 (PRD :144)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000025', '5b000000-0000-0000-0000-000000000001',
            now() + interval '14 days')$$,
  '42501', null, 'M I events (G1): 42501 (PRD FR-012 :98)'
);

select is_empty(
  $$update public.events set note = 'Marka' where id = '5e000000-0000-0000-0000-000000000001'
    returning id$$,
  'M U events (G1): 0 rows (PRD FR-012 :98)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001' returning id$$,
  'M D events (G1): 0 rows (PRD FR-012 :98)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  $$values ('Trening'::text)$$,
  'M U/D events (G1): EF1 unchanged (PRD FR-012 :98)'
);

-- B: member of G1, not an admin ---------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')
    order by id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid), ('5e000000-0000-0000-0000-000000000003'::uuid)$$,
  'B S events: sees EF1 and ES of G1, not EG2 (PRD :144)'
);

select throws_ok(
  $$insert into public.events (id, group_id, starts_at)
    values ('5e000000-0000-0000-0000-000000000026', '5b000000-0000-0000-0000-000000000001',
            now() + interval '15 days')$$,
  '42501', null, 'B I events (G1): 42501 (PRD FR-012 :98)'
);

select is_empty(
  $$update public.events set note = 'Bartka' where id = '5e000000-0000-0000-0000-000000000001'
    returning id$$,
  'B U events (G1): 0 rows (PRD FR-012 :98)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000001' returning id$$,
  'B D events (G1): 0 rows (PRD FR-012 :98)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000001'$$,
  $$values ('Trening'::text)$$,
  'B U/D events (G1): EF1 unchanged (PRD FR-012 :98)'
);

-- A: admin of G1 (positive before start, denied after start) ----------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select id from public.events
    where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000003',
                 '5e000000-0000-0000-0000-000000000004')
    order by id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid), ('5e000000-0000-0000-0000-000000000003'::uuid)$$,
  'A S events: sees EF1 and ES of G1, not EG2 (PRD :144)'
);

select lives_ok(
  $$insert into public.events (id, group_id, starts_at, note)
    values ('5e000000-0000-0000-0000-000000000011', '5b000000-0000-0000-0000-000000000001',
            now() + interval '20 days', 'Nowy')$$,
  'A I events (G1, future): allowed (PRD FR-012 :98)'
);

select results_eq(
  $$update public.events set note = 'Zmieniony' where id = '5e000000-0000-0000-0000-000000000011'
    returning note$$,
  $$values ('Zmieniony'::text)$$,
  'A U events (G1, future): allowed (PRD FR-012 :98)'
);

select results_eq(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000011' returning id$$,
  $$values ('5e000000-0000-0000-0000-000000000011'::uuid)$$,
  'A D events (G1, future): allowed (PRD FR-012 :98)'
);

select is_empty(
  $$update public.events set note = 'Po starcie' where id = '5e000000-0000-0000-0000-000000000003'
    returning id$$,
  'A U events (G1, started): 0 rows (PRD :130)'
);

select is_empty(
  $$delete from public.events where id = '5e000000-0000-0000-0000-000000000003' returning id$$,
  'A D events (G1, started): 0 rows (PRD :130)'
);

reset role;

select results_eq(
  $$select note from public.events where id = '5e000000-0000-0000-0000-000000000003'$$,
  $$values ('Mecz'::text)$$,
  'A U/D events (G1, started): ES unchanged (PRD :130)'
);

-- ===========================================================================
-- child_attendance
-- S: child_id in (CB1, CC); I: CB1 on EF2; U/D: (EF1, CB1), B's declaration.
-- ===========================================================================

-- anon ----------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select event_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')$$,
  '42501', null, 'anon S child_attendance: 42501 (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'anon I child_attendance (B): 42501 (PRD :146)'
);

select throws_ok(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon U child_attendance (B): 42501 (PRD :146)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon D child_attendance (B): 42501 (PRD :146)'
);

reset role;

-- O: outsider ----------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is_empty(
  $$select event_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')$$,
  'O S child_attendance: sees none (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'O I child_attendance (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'O U child_attendance (B): 0 rows (PRD :145)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'O D child_attendance (B): 42501 (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'O U/D child_attendance (B): B''s declaration unchanged (PRD :145)'
);

-- C: admin of the other group -----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$select event_id, child_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')
    order by event_id, child_id$$,
  $$values ('5e000000-0000-0000-0000-000000000004'::uuid, '5c000000-0000-0000-0000-000000000003'::uuid)$$,
  'C S child_attendance: sees only CC on EG2, none of G1 (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'C I child_attendance (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'C U child_attendance (B): 0 rows (PRD :145)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'C D child_attendance (B): 42501 (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'C U/D child_attendance (B): B''s declaration unchanged (PRD :145)'
);

-- X: app admin, not a member ------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is_empty(
  $$select event_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')$$,
  'X S child_attendance: sees none (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'X I child_attendance (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'X U child_attendance (B): 0 rows (PRD :145)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'X D child_attendance (B): 42501 (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'X U/D child_attendance (B): B''s declaration unchanged (PRD :145)'
);

-- M: member of G1, not the parent -------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select results_eq(
  $$select event_id, child_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')
    order by event_id, child_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid)$$,
  'M S child_attendance: sees B''s declarations of G1, not CC (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'M I child_attendance (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'M U child_attendance (B): 0 rows (PRD :145)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'M D child_attendance (B): 42501 (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'M U/D child_attendance (B): B''s declaration unchanged (PRD :145)'
);

-- A: admin of G1, on B's child ----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select event_id, child_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')
    order by event_id, child_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid)$$,
  'A S child_attendance: sees B''s declarations of G1, not CC (PRD :58)'
);

select throws_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  '42501', null, 'A I child_attendance (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'A U child_attendance (B): 0 rows (PRD :145)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A D child_attendance (B): 42501 (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'A U/D child_attendance (B): B''s declaration unchanged (PRD :145)'
);

-- B: the parent (positive before start, denied after start) -----------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select event_id, child_id from public.child_attendance
    where child_id in ('5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003')
    order by event_id, child_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid)$$,
  'B S child_attendance: sees own declarations, not CC (PRD :58)'
);

select lives_ok(
  $$insert into public.child_attendance (event_id, child_id, group_id, going)
    values ('5e000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001',
            '5b000000-0000-0000-0000-000000000001', false)$$,
  'B I child_attendance (B, future): allowed (PRD FR-014 :104)'
);

select results_eq(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning going$$,
  $$values (false)$$,
  'B U child_attendance (B, future): allowed (PRD FR-014 :104)'
);

select throws_ok(
  $$delete from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'B D child_attendance (B): 42501, no return to "bez deklaracji" (decyzja: archive/2026-11-13-child-attendance-declaration/plan.md:37)'
);

select is_empty(
  $$update public.child_attendance set going = false
    where event_id = '5e000000-0000-0000-0000-000000000003'
      and child_id = '5c000000-0000-0000-0000-000000000001'
    returning event_id$$,
  'B U child_attendance (B, started): 0 rows (PRD FR-014 :104, :130)'
);

reset role;

select results_eq(
  $$select going from public.child_attendance
    where event_id = '5e000000-0000-0000-0000-000000000003'
      and child_id = '5c000000-0000-0000-0000-000000000001'$$,
  $$values (true)$$,
  'B U child_attendance (B, started): declaration unchanged (PRD FR-014 :104, :130)'
);

-- ===========================================================================
-- event_drivers
-- S: user_id in (B, C); I: a declaration on EF2; U/D: (EF1, B), B's declaration.
-- ===========================================================================

-- anon ----------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok(
  $$select event_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')$$,
  '42501', null, 'anon S event_drivers: 42501 (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000b1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'anon I event_drivers (B): 42501 (PRD :146)'
);

select throws_ok(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'anon U event_drivers (B): 42501 (PRD :146)'
);

select throws_ok(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'anon D event_drivers (B): 42501 (PRD :146)'
);

reset role;

-- O: outsider ----------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is_empty(
  $$select event_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')$$,
  'O S event_drivers: sees none (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000e1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'O I event_drivers (G1, own user_id): 42501 (PRD :146)'
);

select is_empty(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'O U event_drivers (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'O D event_drivers (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (3::smallint)$$,
  'O U/D event_drivers (B): B''s declaration unchanged (PRD :145)'
);

-- C: admin of the other group -----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$select event_id, user_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')
    order by event_id, user_id$$,
  $$values ('5e000000-0000-0000-0000-000000000004'::uuid, '5a000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'C S event_drivers: sees only own EG2 declaration, none of G1 (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000c1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'C I event_drivers (G1, own user_id): 42501 (PRD :146)'
);

select is_empty(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'C U event_drivers (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'C D event_drivers (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (3::smallint)$$,
  'C U/D event_drivers (B): B''s declaration unchanged (PRD :145)'
);

-- X: app admin, not a member ------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is_empty(
  $$select event_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')$$,
  'X S event_drivers: sees none (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000f1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'X I event_drivers (G1, own user_id): 42501 (PRD :146)'
);

select is_empty(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'X U event_drivers (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'X D event_drivers (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (3::smallint)$$,
  'X U/D event_drivers (B): B''s declaration unchanged (PRD :145)'
);

-- M: member of G1, not the driver -------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select results_eq(
  $$select event_id, user_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')
    order by event_id, user_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'M S event_drivers: sees B''s declarations of G1, not C''s (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000b1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'M I event_drivers (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'M U event_drivers (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'M D event_drivers (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (3::smallint)$$,
  'M U/D event_drivers (B): B''s declaration unchanged (PRD :145)'
);

-- A: admin of G1, on B's declaration ----------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$select event_id, user_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')
    order by event_id, user_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'A S event_drivers: sees B''s declarations of G1, not C''s (PRD :58)'
);

select throws_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000b1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'A I event_drivers (B): 42501 (PRD :145)'
);

select is_empty(
  $$update public.event_drivers set seats = 7
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'A U event_drivers (B): 0 rows (PRD :145)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'A D event_drivers (B): 0 rows (PRD :145)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (3::smallint)$$,
  'A U/D event_drivers (B): B''s declaration unchanged (PRD :145)'
);

-- B: the driver (positive before start, denied after start) -----------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "5a000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select event_id, user_id from public.event_drivers
    where user_id in ('5a000000-0000-0000-0000-0000000000b1', '5a000000-0000-0000-0000-0000000000c1')
    order by event_id, user_id$$,
  $$values ('5e000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid),
           ('5e000000-0000-0000-0000-000000000003'::uuid, '5a000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'B S event_drivers: sees own declarations, not C''s (PRD :58)'
);

select lives_ok(
  $$insert into public.event_drivers (event_id, user_id, group_id, seats)
    values ('5e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-0000000000b1',
            '5b000000-0000-0000-0000-000000000001', 1)$$,
  'B I event_drivers (B, future): allowed (PRD FR-015 :106)'
);

select results_eq(
  $$update public.event_drivers set seats = 5
    where event_id = '5e000000-0000-0000-0000-000000000001'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning seats$$,
  $$values (5::smallint)$$,
  'B U event_drivers (B, future): allowed (PRD FR-015 :106)'
);

select results_eq(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000002'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  $$values ('5e000000-0000-0000-0000-000000000002'::uuid)$$,
  'B D event_drivers (B, future): withdraws (PRD FR-015 :106)'
);

select is_empty(
  $$delete from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000003'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'
    returning event_id$$,
  'B D event_drivers (B, started): 0 rows (PRD FR-015 :106, :130)'
);

reset role;

select results_eq(
  $$select seats from public.event_drivers
    where event_id = '5e000000-0000-0000-0000-000000000003'
      and user_id = '5a000000-0000-0000-0000-0000000000b1'$$,
  $$values (2::smallint)$$,
  'B D event_drivers (B, started): declaration kept (PRD FR-015 :106, :130)'
);

-- Phase 4 sections go here

select * from finish();

rollback;
