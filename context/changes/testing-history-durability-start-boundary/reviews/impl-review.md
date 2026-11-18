<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Trwałość historii i granica startu terminu (rollout Phase 2)

- **Plan**: context/changes/testing-history-durability-start-boundary/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run during review: `npx supabase test db` PASS (12 files, 348 tests), `npm test` PASS (5 files, 32 tests), `npm run lint` PASS, `npx astro check` 0 errors. All manual Progress rows were confirmed by the user during implementation.

## Findings

### F1 — Former members sort first and read as "Członek grupy"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/stats.ts:83, src/pages/groups/[id]/statystyki.astro:87
- **Detail**: After the G1 migration a former member is usually listed with `nick = null`. `stats.ts` sorts drivers with `(a.nick ?? "")`, so these rows come before every named member. The view labels each one "Członek grupy", which is inaccurate for someone who left, and two former members cannot be told apart. Nothing breaks (no count or link is derived from the list), and the plan deliberately kept the fallback, but the sort order was not considered.
- **Fix A ⭐ Recommended**: Sort null nicks last in `stats.ts`
  - Strength: One-line change; named members stay on top, and the plan's "no new label" decision holds.
  - Tradeoff: Former members are still labelled "Członek grupy".
  - Confidence: HIGH — the sort is the only caller-side ordering (`stats.ts` is the sole caller).
  - Blind spot: The kitchen sink `/dev/ui-stats` puts the null-nick row last already; no other ordering assumption checked.
- **Fix B**: Defer to FR-007 with a "Były członek" label
  - Strength: Solves the label and the order together when member removal ships.
  - Tradeoff: Until then the list order looks odd if a member is removed via SQL.
  - Confidence: MED — today removal is SQL-only, so the case is rare.
  - Blind spot: Needs an `is_member` signal from the RPC (out of scope per plan).
- **Decision**: FIXED via Fix A — `getGroupStats` sorts null nicks last; doc comment updated (lint, astro check, npm test pass)

### F2 — Unplanned comment change in stats.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/stats.ts:6-9
- **Detail**: The JSDoc of `DriverStat.nick` was rewritten (former member → `null`). Not in the plan; comment only, and it follows from G1.
- **Fix**: Keep; already disclosed during Phase 3. No action.
- **Decision**: ACCEPTED — comment kept (no edit)

### F3 — No index on event_drivers(group_id)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261118130000_keep_former_member_drives_in_stats.sql:53-55
- **Detail**: The new candidate branch reads `event_drivers` by `group_id`, which has no index (only the PK and `event_drivers_user_id_idx`). Irrelevant at MVP scale.
- **Fix**: No change now; add an index if the table grows.
- **Decision**: ACCEPTED — MVP-scale risk, no index now

### F4 — Account deletion still removes a former member's drives

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261113130000_create_event_drivers.sql:28
- **Detail**: `event_drivers.user_id` cascades from `profiles`, so deleting an account removes its historical drives. This is the documented G3 compromise (plan "What We're NOT Doing", test-plan §6.5).
- **Fix**: No action; already documented.
- **Decision**: ACCEPTED — documented G3 compromise

### F5 — test-plan §3/§4 stale after this phase

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md §3 row 2, §4 (pgTAP row)
- **Detail**: §3 row 2 still says `change opened`, and §4 says "10 plików w `supabase/tests/`" while 12 exist. Both belong to `/10x-test-plan` (status reconciliation and backport), which the plan correctly left alone.
- **Fix**: Run `/10x-test-plan` after merge.
- **Decision**: ACCEPTED — deferred to `/10x-test-plan` (status reconciliation + backport)
