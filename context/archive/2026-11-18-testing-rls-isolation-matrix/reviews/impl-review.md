<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Macierz izolacji RLS

- **Plan**: context/changes/testing-rls-isolation-matrix/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-19
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run on 2026-11-19: `npx supabase test db` (14 files, 566 tests, PASS), `npm run lint` PASS,
`npx astro check` 0 errors, `npm test` 32/32. Build and smoke passed in phase 5 the same day. Manual items 1.4–5.3 were
confirmed by the user, and each break-check was run and recorded in the session.

## Findings

### F1 — Anon 42501 checks do not pin the grant layer for three RPCs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_isolation_matrix.test.sql:1634, :1796, :1801
- **Detail**: `regenerate_group_invite` raises 42501 `insufficient_privilege` on its own (`create_group_invites.sql:77-79`). The stats functions also end in 42501 for anon through table privileges. A stray `GRANT EXECUTE … TO anon` would therefore leave these assertions green. This is the same pattern that phase 4 fixed for `admin_list_groups`. Catalog guard check 5 would still catch it.
- **Fix**: Pin the message `'permission denied for function <name>'` in all three assertions, as at :1734-1744.
- **Decision**: FIXED — message pinned for regenerate_group_invite, group_driver_stats and group_child_stats; matrix PASS

### F2 — Missing direct I/U/D on `groups` by the group admin

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/rls_isolation_matrix.test.sql:1537-1550 (and header :67)
- **Detail**: Phase 4 of the plan says "direct I/U/D by X and A → 42501". A is covered only on `group_members` (:1595-1613). For `groups`, only X is checked. S on `groups`/`group_members` for A and B is also not asserted, although M covers member visibility.
- **Fix**: Add 3 assertions `A I/U/D groups (G1): 42501` and update `plan(N)` and the header table.
- **Decision**: FIXED — 3 assertions for A on groups, plan(209), header updated; matrix PASS

### F3 — Guard check 4 accepts any `search_path`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_catalog_guard.test.sql:117
- **Detail**: `cfg like 'search_path=%'` also accepts `search_path=public`, which is a mutable path that can be shadowed for a security definer function. Today all 13 definer functions use `search_path=""`, so the check would not catch a regression to an unsafe path.
- **Fix**: Require exactly `search_path=""` and add a probe function with `set search_path = public`.
  - Strength: Matches the convention of every migration; closes the class of shadowing through search_path.
  - Tradeoff: A future function that legitimately needs `pg_catalog` or `extensions` will need an allow-list entry.
  - Confidence: HIGH — the local DB has only `search_path=""` (verified in phase 2).
  - Blind spot: Functions created by Supabase extensions are excluded by `pg_depend`; not verified for every extension.
- **Decision**: FIXED — check 4 requires `search_path=""`; probe `rls_guard_probe_path_fn` (search_path = public) detected; plan(11); guard PASS

### F4 — The guard does not check views or materialized views

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_catalog_guard.test.sql:26-30
- **Detail**: `relkind in ('r','p')` skips `v` and `m`. A future view in `public` owned by postgres without `security_invoker=true` would bypass the RLS of the tables underneath it, and the guard would not notice. No views exist today.
- **Fix**: Add a 6th check: views in `public` without `security_invoker=true` in `reloptions`, plus any materialized view; add a probe.
  - Strength: Closes the only known way around RLS that the guard does not see.
  - Tradeoff: Another check and probe, plus a plan count update; adds scope beyond the plan.
  - Confidence: MEDIUM — the semantics of `security_invoker` (PG15+) are known; the reloptions format was not verified on this instance.
  - Blind spot: The local Postgres version was not checked.
- **Decision**: FIXED — check 6 `views_bypassing_rls()` (views without security_invoker, every matview) + 3 probes, including a no-false-positive case; PG 17.11; plan(15); guard PASS

### F5 — Probe for check 3 tests only `to public`, not `to anon`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_catalog_guard.test.sql:199-209
- **Detail**: The semantics are correct (`roles && array['public','anon']`), but the `anon` branch is not proven by a probe.
- **Fix**: Add a second probe policy `to anon` and an `ok(...)` assertion for it.
- **Decision**: FIXED — probe `rls_guard_probe_anon ... to anon` detected; plan(16); guard PASS

### F6 — Stale documentation details (test-plan §4, citation in the plan)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §4 (pgTAP row); context/changes/testing-rls-isolation-matrix/plan.md (Phase 3 Contract)
- **Detail**: §4 says "12 plików w `supabase/tests/`", but there are 14 now. The plan cites `child-attendance-declaration/plan.md:36`, while the correct line is `:37`; the implementation uses `:37`.
- **Fix**: Change §4 to "14 plików" and record a note in the plan about the corrected citation.
- **Decision**: FIXED — test-plan.md §4 says 14 files; plan.md Phase 3 has a note about `:37`

### F7 — A new client-settable column on `children` needs an explicit INSERT grant

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261118140000_harden_children_insert_and_anon_profiles.sql:14-15
- **Detail**: Since phase 1, `authenticated` has INSERT only on the listed columns. A column added to `children` later will not be writable by the client until it is added to the grant. That is a safe default, but a trap for the next migration.
- **Fix**: Add a sentence to test-plan §6.3 (the "Granty" point) saying a new client-settable column requires `grant insert (col)`.
- **Decision**: FIXED — §6.3 "Granty": a new client-settable column needs `grant insert (<kolumna>)` and a `has_column_privilege` assertion
