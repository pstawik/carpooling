<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deklaracja obecności dziecka i plan dzieci terminu

- **Plan**: context/changes/child-attendance-declaration/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated re-run (2026-11-13): `npm run lint` PASS, `npx astro check` PASS (0 errors), `npm run build` PASS, `npm run smoke` PASS, `npx supabase test db` FAIL locally (1/38 in child_attendance_rls, see F2; passed on a clean DB at a584995). `npx supabase db reset` not re-run, to keep the local manual-test data; it passed at a584995 and the migration is unchanged since. All manual Progress items were confirmed by the user in-session.

## Findings

### F1 — Deleting a child erases its declarations on started events

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261113120000_create_child_attendance.sql:44 (with 20261112140000_create_children.sql:65-69)
- **Detail**: `children_delete_own` has no time condition, and `child_attendance_child_fkey` cascades. A parent who deletes a child after an event started removes that child's locked declaration, so the started event's plan changes. AGENTS.md says declarations become read-only once the event starts. The plan accepted the cascade ("kompromis zaakceptowany w S-04", plan.md:40), but the migration header (lines 9-11) presents it as plain cleanup, not as a deliberate exception to the lock. S-09 statistics will lose these rows.
- **Fix A ⭐ Recommended**: Document it as an explicit, accepted exception now, in the migration header and in the roadmap's S-09 Unknowns, and decide the real fix when S-09 is planned.
  - Strength: Matches the decision already taken in planning (plan.md:40, S-04 trade-off); costs two comment edits and no schema change before the migration reaches hosted.
  - Tradeoff: The lock stays bypassable through child deletion until S-09.
  - Confidence: HIGH — the trade-off is recorded in the plan; the only gap is that the code and roadmap don't say so.
  - Blind spot: Whether S-09 will want soft-deleted children or kept rows is not decided.
- **Fix B**: Change the child FK to `on delete restrict` for started events (e.g. a trigger that refuses deleting a child with declarations on started events).
  - Strength: Enforces the read-only rule fully in the database.
  - Tradeoff: Breaks S-04 child deletion for any child that ever declared; needs UI copy and a new error code, i.e. new scope.
  - Confidence: MEDIUM — the trigger is simple, but the UX consequence was rejected in planning.
  - Blind spot: How parents would remove a child who left the activity.
- **Decision**: FIXED (Fix A — exception documented in the migration header and roadmap S-09 Unknowns)

### F2 — pgTAP test 36 counts all rows, so it fails on a non-empty local DB

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/child_attendance_rls.test.sql (test "only Ola's E2 and Zosia's E3 declarations remain")
- **Detail**: The test runs `select count(*) from public.child_attendance` as postgres. After the manual checks and smoke runs, the local DB has 6 real rows, so it reports `have: 8, want: 2`. It passes in CI (clean DB) but breaks `npx supabase test db` for anyone with local data. Other test files in the repo scope their counts to fixture ids.
- **Fix**: Count only the fixture groups: `where group_id in ('10000000-…-0001', '20000000-…-0002')`.
- **Decision**: FIXED (count scoped to fixture groups; `npx supabase test db` 232/232 locally)

### F3 — Policies don't check that the event is in the declaration's group

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261113120000_create_child_attendance.sql:90-94, 111-115, 125-129
- **Detail**: The `exists (… public.events e …)` subqueries check only `e.id` and `starts_at`. Same-group consistency rests on the composite FK alone, so a parent in two groups gets 23503 instead of 42501. That is correct today, but the policy is not self-sufficient.
- **Fix**: Add `and e.group_id = child_attendance.group_id` to the three event subqueries.
- **Decision**: FIXED (condition added to all three subqueries; applied locally without reset; pgTAP 232/232)

### F4 — `created_at` / `updated_at` can be set by the client

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261113120000_create_child_attendance.sql:59-62
- **Detail**: `authenticated` keeps the table-level INSERT, and UPDATE is granted on `updated_at`, so a direct PostgREST insert or patch can write any timestamps. This is harmless now, but it matters if S-09 or an audit reads them.
- **Fix**: `revoke insert … from authenticated; grant insert (event_id, child_id, group_id, going) … to authenticated;` (the RPC still needs the `updated_at` UPDATE grant while it is security invoker).
- **Decision**: FIXED (column INSERT grant without timestamps, 2 new pgTAP privilege tests; 234/234)

### F5 — Two pgTAP cases are missing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/child_attendance_rls.test.sql
- **Detail**: The FK mismatch is tested only as postgres. No case covers an authenticated parent in both groups attaching a G1 child to a G2 event, the only real path to the service's `not_found` mapping (23503). No case covers a parent whose child row remains after they have left the group (the `is_group_member` branch).
- **Fix**: Add both cases (and bump `plan()`).
- **Decision**: FIXED (both cases added, plan(42); the two-group case returned 23503 before F3 and 42501 after, so it also guards F3; pgTAP 236/236, smoke green)

### F6 — Plan page returns 500 if the group or event query errors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/groups/[id]/terminy/[eventId].astro:22-29
- **Detail**: `getGroupWithAdmins` and `getGroupEvent` throw on query errors and are not caught. This is consistent with `src/pages/groups/[id].astro:29`, so it is not a regression, only a pre-existing pattern repeated. The children and attendance load is wrapped, as planned.
- **Fix**: Leave as is, consistent with the group page. Revisit both pages together if 500s are seen.
- **Decision**: ACCEPTED (left as is, consistent with the group page; revisit both pages together if 500s are seen)
