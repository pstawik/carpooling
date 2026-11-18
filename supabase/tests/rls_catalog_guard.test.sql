-- Catalog guard: structural security facts for every object in schema public,
-- read from the system catalogs instead of a hard-coded table list, so a
-- future table or function that skips RLS, policies or search_path turns this
-- file red with the offending object named in the diagnostics.
-- Each violation query is defined once as a pg_temp function and used both by
-- the real assertions and by the probe at the end, which creates deliberately
-- broken objects (rolled back with the transaction) to prove every query
-- detects what it is meant to detect. The guard never looks at policy
-- conditions, only at catalog facts.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- ---------------------------------------------------------------------------
-- Violation queries
-- ---------------------------------------------------------------------------

-- Tables and partitioned tables in public (not owned by an extension).
create function pg_temp.public_tables()
returns table (oid oid, name text)
language sql
stable
as $$
  select c.oid, format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not exists (
      select 1
      from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
    )
$$;

-- Functions in public (not owned by an extension).
create function pg_temp.public_functions()
returns table (oid oid, name text, prosecdef boolean, proconfig text[])
language sql
stable
as $$
  select p.oid, format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes)),
         p.prosecdef, p.proconfig
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1
      from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_proc'::regclass
        and d.objid = p.oid
        and d.deptype = 'e'
    )
$$;

-- 1. Tables without row level security.
create function pg_temp.tables_without_rls()
returns setof text
language sql
stable
as $$
  select t.name
  from pg_temp.public_tables() t
  join pg_catalog.pg_class c on c.oid = t.oid
  where not c.relrowsecurity
  order by 1
$$;

-- 2. Tables without any policy. Exception list:
--    app_admins: every privilege is revoked from anon/authenticated and the
--    table is reached only through the security definer is_app_admin().
create function pg_temp.tables_without_policies()
returns setof text
language sql
stable
as $$
  select t.name
  from pg_temp.public_tables() t
  where t.oid not in ('public.app_admins'::regclass)
    and not exists (
      select 1 from pg_catalog.pg_policy pol where pol.polrelid = t.oid
    )
  order by 1
$$;

-- 3. Policies granted to the public or anon role (a policy without a TO
--    clause is reported by pg_policies as role public).
create function pg_temp.policies_for_public_or_anon()
returns setof text
language sql
stable
as $$
  select format('%I.%I: %s (%s)', p.schemaname, p.tablename, p.policyname, array_to_string(p.roles, ','))
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.roles && array['public', 'anon']::name[]
  order by 1
$$;

-- 4. Security definer functions without search_path in proconfig.
--    (set search_path = '' is stored as search_path="", so match the prefix.)
create function pg_temp.secdef_functions_without_search_path()
returns setof text
language sql
stable
as $$
  select f.name
  from pg_temp.public_functions() f
  where f.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(f.proconfig, '{}'::text[])) cfg
      where cfg like 'search_path=%'
    )
  order by 1
$$;

-- 5. Functions anon can execute, outside the allow-list:
--    invite_group_name(text): the invite landing page shows the group name
--    to a visitor who is not logged in yet.
create function pg_temp.anon_executable_functions()
returns setof text
language sql
stable
as $$
  select f.name
  from pg_temp.public_functions() f
  where pg_catalog.has_function_privilege('anon', f.oid, 'execute')
    and f.oid not in ('public.invite_group_name(text)'::regprocedure)
  order by 1
$$;

-- ---------------------------------------------------------------------------
-- Guard assertions
-- ---------------------------------------------------------------------------

select is_empty(
  'select * from pg_temp.tables_without_rls()',
  'every public table has row level security enabled'
);

select is_empty(
  'select * from pg_temp.tables_without_policies()',
  'every public table (except app_admins) has at least one policy'
);

select is_empty(
  'select * from pg_temp.policies_for_public_or_anon()',
  'no public policy is granted to role public or anon'
);

select is_empty(
  'select * from pg_temp.secdef_functions_without_search_path()',
  'every security definer function in public pins search_path'
);

select is_empty(
  'select * from pg_temp.anon_executable_functions()',
  'anon can execute only allow-listed functions in public'
);

-- ---------------------------------------------------------------------------
-- Probe: each violation query detects a deliberately broken object
-- ---------------------------------------------------------------------------

create table public.rls_guard_probe (id integer);

-- Functions get EXECUTE for PUBLIC (and so anon) by default.
create function public.rls_guard_probe_fn()
returns integer
language sql
security definer
as $$ select 1 $$;

select ok(
  'public.rls_guard_probe' in (select * from pg_temp.tables_without_rls()),
  'probe: tables_without_rls() detects a table without RLS'
);

select ok(
  'public.rls_guard_probe' in (select * from pg_temp.tables_without_policies()),
  'probe: tables_without_policies() detects a table without policies'
);

select ok(
  'public.rls_guard_probe_fn()' in (select * from pg_temp.secdef_functions_without_search_path()),
  'probe: secdef_functions_without_search_path() detects a security definer function without search_path'
);

select ok(
  'public.rls_guard_probe_fn()' in (select * from pg_temp.anon_executable_functions()),
  'probe: anon_executable_functions() detects a function anon can execute'
);

create policy rls_guard_probe_public on public.rls_guard_probe
  for select to public using (true);

select ok(
  exists (
    select 1
    from pg_temp.policies_for_public_or_anon() v
    where v like 'public.rls_guard_probe: rls_guard_probe_public %'
  ),
  'probe: policies_for_public_or_anon() detects a policy granted to role public'
);

drop policy rls_guard_probe_public on public.rls_guard_probe;
drop function public.rls_guard_probe_fn();
drop table public.rls_guard_probe;

select * from finish();
rollback;
