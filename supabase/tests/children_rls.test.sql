-- RLS and privilege tests for public.children.
-- Fixtures: A (member of G1), B (member of G1), C (member of G2), D (in no group).
begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'children', 'public.children exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.children'::regclass),
  true,
  'RLS is enabled on public.children'
);

select policies_are(
  'public',
  'children',
  array[
    'children_select_group_member',
    'children_insert_own',
    'children_update_own',
    'children_delete_own'
  ],
  'children has exactly the four per-operation policies'
);

select is(
  (select bool_or(has_table_privilege('anon', 'public.children', p))
    from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p),
  false,
  'anon has no privileges on children'
);

select is(
  has_table_privilege('authenticated', 'public.children', 'truncate'),
  false,
  'authenticated has no TRUNCATE on children'
);

select is(
  has_table_privilege('authenticated', 'public.children', 'update'),
  false,
  'authenticated has no table-level UPDATE on children'
);

select is(
  has_column_privilege('authenticated', 'public.children', 'name', 'update'),
  true,
  'authenticated may UPDATE children.name'
);

select is(
  has_column_privilege('authenticated', 'public.children', 'group_id', 'update'),
  false,
  'authenticated may not UPDATE children.group_id'
);

select is(
  has_column_privilege('authenticated', 'public.children', 'parent_id', 'update'),
  false,
  'authenticated may not UPDATE children.parent_id'
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

-- ---------------------------------------------------------------------------
-- As user A (member of G1) — inserts
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-0000000000a1', 'Ola')$$,
  'A adds a child in G1'
);

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Ola')$$,
  '42501', null, 'A cannot add a child in G2 (not a member)'
);

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Kuba')$$,
  '42501', null, 'A cannot add a child in G1 owned by B'
);

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '   ')$$,
  '23514', null, 'a blank name violates children_name_length'
);

select results_eq(
  $$select id, name from public.children$$,
  $$values ('c0000000-0000-0000-0000-0000000000a1'::uuid, 'Ola'::text)$$,
  'A sees their own child'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user B (member of G1) — cannot touch A's child
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$select id, parent_id from public.children$$,
  $$values ('c0000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'B sees A''s child in their shared group'
);

select is_empty(
  $$update public.children set name = 'Hacked'
    where id = 'c0000000-0000-0000-0000-0000000000a1' returning id$$,
  'B''s update of A''s child affects 0 rows'
);

select is_empty(
  $$delete from public.children
    where id = 'c0000000-0000-0000-0000-0000000000a1' returning id$$,
  'B''s delete of A''s child affects 0 rows'
);

select results_eq(
  $$select name, parent_id from public.children where id = 'c0000000-0000-0000-0000-0000000000a1'$$,
  $$values ('Ola'::text, '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'A''s child is unchanged after B''s attempts'
);

select lives_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('c0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-0000000000b1', 'Ola')$$,
  'B may add a child with the same name as A''s in G1'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user C (member of G2) and D (in no group) — see nothing, write nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is_empty($$select * from public.children$$, 'member of another group C sees no G1 children');

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Zosia')$$,
  '42501', null, 'C cannot add a child in G1'
);

select is_empty(
  $$delete from public.children where id = 'c0000000-0000-0000-0000-0000000000a1' returning id$$,
  'C''s delete of A''s child affects 0 rows'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select is_empty($$select * from public.children$$, 'stranger D sees no children');

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Zosia')$$,
  '42501', null, 'D cannot add a child in G1'
);

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'Zosia')$$,
  '42501', null, 'D cannot add a child in G2'
);

reset role;

-- ---------------------------------------------------------------------------
-- As user A again — rename, immutability, uniqueness, delete
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  $$update public.children set name = 'Ola K.'
    where id = 'c0000000-0000-0000-0000-0000000000a1' returning name$$,
  array['Ola K.'::text],
  'A renames their own child'
);

select throws_ok(
  $$update public.children set group_id = '20000000-0000-0000-0000-000000000002'
    where id = 'c0000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'A cannot change the group of their child'
);

select throws_ok(
  $$update public.children set parent_id = '00000000-0000-0000-0000-0000000000b1'
    where id = 'c0000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'A cannot change the parent of their child'
);

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '  ola k.  ')$$,
  '23505', null, 'A cannot add a second child whose name differs only in case and whitespace'
);

select lives_ok(
  $$insert into public.children (id, group_id, parent_id, name)
    values ('c0000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-0000000000a1', 'Staś')$$,
  'A adds a second child with a different name'
);

select is(
  (select count(*) from public.children),
  3::bigint,
  'A sees all three G1 children (own two plus B''s)'
);

select results_eq(
  $$delete from public.children
    where id = 'c0000000-0000-0000-0000-0000000000a2' returning id$$,
  array['c0000000-0000-0000-0000-0000000000a2'::uuid],
  'A deletes their own child'
);

select is_empty(
  $$select * from public.children where id = 'c0000000-0000-0000-0000-0000000000a2'$$,
  'the deleted child is gone'
);

reset role;

-- ---------------------------------------------------------------------------
-- A removed member can no longer write their children
-- ---------------------------------------------------------------------------

delete from public.group_members
where group_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-0000000000b1';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select is_empty($$select * from public.children$$, 'a removed member no longer sees the group''s children');

select is_empty(
  $$delete from public.children
    where id = 'c0000000-0000-0000-0000-0000000000b1' returning id$$,
  'a removed member cannot delete their own child in that group'
);

reset role;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select throws_ok($$select * from public.children$$, '42501', null, 'anon cannot read children');

select throws_ok(
  $$insert into public.children (group_id, parent_id, name)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Zosia')$$,
  '42501', null, 'anon cannot insert children'
);

reset role;

-- ---------------------------------------------------------------------------
-- As postgres — cascade
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.children where group_id = '10000000-0000-0000-0000-000000000001'),
  2::bigint,
  'G1 has two children before it is deleted'
);

delete from public.groups where id = '10000000-0000-0000-0000-000000000001';

select is_empty(
  $$select * from public.children where group_id = '10000000-0000-0000-0000-000000000001'$$,
  'deleting a group deletes its children'
);

select * from finish();
rollback;
