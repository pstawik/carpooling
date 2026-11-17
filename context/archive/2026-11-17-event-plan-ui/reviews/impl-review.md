<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Event plan UI

- **Plan**: context/changes/event-plan-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

Diff reviewed: `4c12d5b..d2b84d0` (PR #46, merged as `b3f0a5b`). Automated: `npm run lint` (check-ui-literals 0 hits in 9 files), `npx astro check` (0 errors), `npm run build` — pass at review time; `npm run smoke` not re-run (Git Bash crash), last pass at `8ec3855` on identical code (`d2b84d0` touches only `context/`). Manual Progress items all `[x]`, confirmed by the user during implementation.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Scope Discipline: the attendance-redirect change (`attendance.ts`, `smoke.mjs`) is outside the plan's "no API changes" line but was decided by the user in phase 3 and recorded in `change.md`.

## Findings

### F1 — Smoke success redirects now match error redirects too

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:545, :550, :565 (matcher :648)
- **Detail**: The runner compares `actual.location.startsWith(expected.location)`. The three attendance-success steps now expect bare `planPath()`, so `?error=unknown`, `?error=not_configured` and `?error=attendance_locked#twoje-dzieci` also pass. The previous `#twoje-dzieci` expectation rejected those; the following `planPageList` step only catches the first declaration.
- **Fix**: Add an exact-match expectation (`locationExact`) to the runner alongside `location`, and use it for the three steps.
- **Decision**: FIXED — `locationExact` in the runner (resolved late, `===` match, shown in the failure line); the three attendance-success steps use it.

### F2 — Class strings shared by view and sink are not in group-page-classes.ts

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui-event.astro:42, :180, :320; src/pages/groups/[id]/terminy/[eventId].astro:175, :229, :245
- **Detail**: The sink's local `subHeadingClass` equals the view's inline h3 classes ("Jadą"/"Nie jadą"), and `cn(planLinkClass, "text-link inline-flex")` is composed in both files — against the F5 rule this change wrote into AGENTS.md. The comment at ui-event.astro:39 claims the classes come from group-page-classes.
- **Fix**: Export `subHeadingClass` and a hint-link constant from group-page-classes.ts, use them in the view and the sink, correct the comment.
- **Decision**: FIXED — `subHeadingClass` and `hintLinkClass` exported from group-page-classes.ts; used in `[eventId].astro`, `ui-event.astro` and `ui-group.astro` (its local copy removed); sink comment clarified. `src/pages/groups/[id].astro` still writes the same h3 string inline (other view, left as is).

### F3 — The sink hard-codes the output of the view's private helpers

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui-event.astro:32; src/pages/groups/[id]/terminy/[eventId].astro:85-98
- **Detail**: The sink writes `tel:+48600100200`, "Jadą 3 dzieci", "Brakuje 1 miejsca" by hand; the view builds them with private `telHref()`, `goingLabel()`, `missingLabel()`. A helper change would make the sink stop matching the view.
- **Fix**: Move the three helpers to `src/lib/` (next to `plural.ts`) and import them in the view and the sink.
- **Decision**: FIXED — `goingLabel` / `missingLabel` exported from `src/lib/plural.ts`, `telHref` from new `src/lib/tel.ts`; the view and `ui-event.astro` import them (sink's hard-coded `tel:` and labels removed).

### F4 — After a declaration, the page returns to the top even with several children

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/groups/events/attendance.ts:60-62
- **Detail**: User decision in phase 3 (recorded in change.md). With 3+ children a parent scrolls back to the next child after each tap. Authorization, validation and locked handling are unchanged.
- **Fix**: None — accept as designed (recorded tradeoff).
- **Decision**: ACCEPTED — deliberate tradeoff from phase 3 (user decision recorded in change.md).
