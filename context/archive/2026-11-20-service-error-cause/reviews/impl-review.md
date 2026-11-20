<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zachowanie przyczyny błędu serwisów

- **Plan**: context/changes/service-error-cause/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Commits: ecafe07 (p1), 2af0610 (p2), 486d177 (epilogue). 15 files in `src/`, all listed in the plan; none missing, none extra.
Re-run gates: vitest helper 3/3, `npm test` 192/192, lint, `astro check` 0/0, build, smoke — all pass. Grep 1 returns only `invites.ts:21` (plan said `:19`; shifted by the new import and comment). Grep 2 returns nothing.
Manual 1.6, 2.7, 2.8 confirmed by the user with a pasted dev log (PostgREST container stopped): stack and `[cause]` visible.

## Findings

### F1 — Doubled operation prefix in catch-block logs

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:23, src/pages/api/groups/events/attendance.ts:51, src/pages/api/groups/events/driver.ts:85
- **Detail**: `console.error("listMyGroups failed:", err)` prints `listMyGroups failed: Error: listMyGroups failed: <message>` (seen in the manual log), because `serviceError` already puts the prefix in the message. Matches the plan's contract; just noisy.
- **Fix**: Leave as is; step 4 (`structured-error-logs`) replaces these lines with `logError(...)` and can drop the prefix there.
- **Decision**: PENDING

### F2 — Middleware logs a literal `undefined` when the code is empty

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:66,76, src/pages/admin/groups.astro:32
- **Detail**: On a network failure supabase-js returns no `code`, so the line reads `profile lookup failed: undefined name resolution failed` (seen in the manual log). Same as the existing write-route logs; plan contract followed.
- **Fix**: Leave for step 4, where a structured field (`code: undefined`) is cleaner than a positional argument.
- **Decision**: PENDING

### F3 — `cause` now sends PostgREST `details`/`hint` to logs for read services

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/service-error.ts:8
- **Detail**: `refusal-log.ts` deliberately whitelists only `code`/`message`; `serviceError` keeps the whole error, so `details`/`hint` reach logs via `console.error(err)`. Accepted in the plan (Key Discoveries, `invite_group_name` excluded). The reads filter by UUIDs, so their `details` rarely contain user values. But the rule is now "whitelist for refusals, full object for reads" and nothing enforces it.
- **Fix**: When step 4 adds `logError`, decide explicitly whether `cause.details` is serialized; until then no change.
- **Decision**: PENDING
