<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bilans miejsc i statystyki na danych granicznych

- **Plan**: context/changes/testing-seat-balance-stats/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence: plan-drift sweep: every planned item MATCH, no MISSING/EXTRA; `git diff --name-only main...HEAD` = 17 files, all planned or change-context. Automated re-run on 2026-11-18: `npm test` 8/8, `npm run lint` pass, `npx astro check` 0 errors / 0 warnings, `npx supabase test db` 10 files / 314 tests PASS (1 expected TODO). CI on PR #60: `ci` (incl. `npm test`) and `smoke` green. Manual rows 1.5, 2.5, 4.2 are confirmed by the user in-session.

## Findings

### F1 — Race between member removal and a concurrent declaration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261118120000_delete_future_declarations_on_member_removal.sql:26-50
- **Detail**: `set_event_driver` / `set_child_attendance` check `is_group_member()` under RLS, but they take no lock against a concurrent delete of the membership. If such a write passes the check before the removal commits, the trigger's delete misses the new row, and a non-member's future declaration is left behind. That row still adds seats or counts as going. Today only the owner, service_role or a cascade can delete from `group_members` (no DELETE grant or policy; `20261110120000_create_groups.sql:54`), so this needs a manual SQL removal at the very moment of a declaration.
- **Fix A ⭐ Recommended**: Accept for now, and record it as a requirement of FR-007 (removal RPC): the write functions lock the membership row (`select … from public.group_members … for share`) so removal and declaration serialize.
  - Strength: No change to code paths that have no removal UI today; the requirement lands where the race becomes reachable.
  - Tradeoff: The race exists in theory until FR-007.
  - Confidence: HIGH — removal is impossible for clients per the grants.
  - Blind spot: Service-role scripts that remove members in bulk while the app is live.
- **Fix B**: Add `for share` on the membership row in `set_event_driver` and `set_child_attendance` now (new migration + pgTAP).
  - Strength: Closes the race completely.
  - Tradeoff: Changes two hot write paths outside this phase's scope; a concurrency test in pgTAP is hard to write.
  - Confidence: MED — standard Postgres pattern, but no test can prove it in one transaction.
  - Blind spot: Lock interplay with `on conflict do update` in the RPCs.
- **Decision**: FIXED via Fix A: the requirement is recorded in roadmap.md (FR-007) and test-plan.md §6.5

### F2 — A removed parent's children stay in the group and keep piling up absences

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116130000_create_engagement_stats.sql:85-92 (pre-existing); the trigger keeps children by design (new migration :13)
- **Detail**: After the parent is removed, their child stays in `children`. `group_child_stats` counts every finished event with `starts_at >= created_at` with no end date, so the child gets one more "absent" per later event and shows as "bez deklaracji" on every new plan. The PRD (`prd.md:147`) only covers declarations, and the plan lists the children's fate as out of scope (`roadmap.md:165`).
- **Fix**: Record it in test-plan §6.5 / Phase 2 (risk #2) next to the former-member `todo`, as an open product decision (end the child's range at the parent's removal, or hide children of non-members).
- **Decision**: FIXED: the open decision is recorded in test-plan.md §6.5 for Phase 2

### F3 — Migration header describes a removal path that does not exist yet

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261118120000_delete_future_declarations_on_member_removal.sql:15-16
- **Detail**: The comment says "Members are removed through security definer paths or as owner". No security definer removal path exists; today it is only owner, service_role or a cascade. The reason for `security definer` is still correct.
- **Fix**: Reword the comment to "as owner/service_role or by cascade; a future removal RPC must keep this trigger security definer".
- **Decision**: FIXED: header comment reworded (comment only, no SQL change)

### F4 — One assertion relies on RLS to exclude the G2 row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/member_removal_declarations.test.sql:177-182
- **Detail**: `where user_id = B` runs as A, and returns only {P, S} because A cannot see B's G2 row on F2. If the fixture ever adds A to G2, the test breaks for a reason unrelated to the trigger.
- **Fix**: Add `and group_id = '10000000-0000-0000-0000-000000000001'` to that query.
- **Decision**: FIXED: group_id filter added to the query

### F5 — Profile-delete cascade with the trigger is not exercised

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/member_removal_declarations.test.sql
- **Detail**: The group-delete cascade with the trigger runs in `children_rls.test.sql:380`. The profile-delete path (auth.users → profiles → group_members + event_drivers + children) is not run with declarations present. By reasoning it is safe (idempotent plain deletes), but no test executes it.
- **Fix**: Optional: in the test, delete a fixture `auth.users` row as postgres and assert that it lives_ok and that the user's declarations are gone.
- **Decision**: FIXED: 2 assertions added (plan 14 → 16); `supabase test db` 316 tests PASS

### F6 — Closing (epilogue) commit not yet made

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-seat-balance-stats/plan.md, change.md (staged, uncommitted)
- **Detail**: The SHA write-back for 4.1–4.2, the 1.5 check and the status change sit in the index and are not committed or pushed to PR #60.
- **Fix**: Commit plan.md, change.md and this report, then push.
- **Decision**: FIXED: closing commit together with the triage fixes, pushed to PR #60
