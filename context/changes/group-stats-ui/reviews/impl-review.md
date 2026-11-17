<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group stats UI

- **Plan**: context/changes/group-stats-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria re-run on HEAD 462931e: `npm run lint` (`check-ui-literals: 0 hits in 11 files`), `npx astro check` (0 errors, 0 warnings), `npm run build`, `npm run smoke` (all steps passed). Production 404 on `/dev/ui-stats` checked in phase 3 via `astro preview`. Every manual row (1.5, 1.6, 2.6, 2.7, 3.5, 3.6) was confirmed by the user before its commit.

Diff 0980fb0..HEAD: 5 code files, all named in the plan (`statystyki.astro`, `ui-stats.astro`, `group-page-classes.ts`, `check-ui-literals.mjs`, `AGENTS.md`) plus the change folder. No unplanned files, no files missing.

## Findings

### F1 — View and sink repeat the region heading class strings instead of sharing a constant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/groups/[id]/statystyki.astro:71, :81, :95; src/pages/dev/ui-stats.astro:53, :63, :77, :157
- **Detail**: The plan's Critical Implementation Details say every class string used in both the view and `/dev/ui-stats` (other than single token utilities) goes to `group-page-classes.ts`. The headings `mb-2 text-lg font-semibold` and `mb-3 text-lg font-semibold` are written inline in both files. If someone changes one, the sink can stop showing what the view renders. The same inline strings also appear in `[eventId].astro` and `ui-event.astro`, so this repeats an existing pattern rather than introducing a new one. The phase 3 dispatch explicitly allowed inline heading utilities, and that deviation was not recorded in the plan.
- **Fix A ⭐ Recommended**: Record the deviation in the plan (note under Phase 3) and leave the code as is
  - Strength: Matches how the event plan and its sink already write region headings; no change in the 4 files that use the pattern.
  - Tradeoff: View and sink can still drift on heading spacing; only screenshots would catch it.
  - Confidence: HIGH — the same inline strings live in `[eventId].astro:121` and `ui-event.astro:316`.
  - Blind spot: None significant.
- **Fix B**: Add `regionHeadingClass` (and a list variant with `mb-3`) to `group-page-classes.ts` and use it in the stats view and its sink
  - Strength: Satisfies the plan's rule literally; the sink can no longer drift from the view.
  - Tradeoff: Two views (stats vs. event plan) end up with different conventions unless the event plan is migrated too, which is out of this change's scope.
  - Confidence: MED — the mb-2/mb-3 split needs two constants or a margin parameter.
  - Blind spot: Not checked whether the group page `[id].astro` uses yet another heading margin.
- **Decision**: FIXED (Fix A): deviation recorded in plan.md, Phase 3

### F2 — The event plan sink's hover note says "accent", but outline buttons use --input in dark mode

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui-event.astro:167
- **Detail**: The `outline` variant in `button.tsx:16` has `dark:hover:bg-input/50`, and `.dark` is always on. So hovered outline buttons change to `--input`, not `accent`. The same wrong note was corrected in `ui-stats.astro:100-102` during phase 3. It is still wrong in `ui-event.astro`, which is outside this change's scope.
- **Fix**: Change the note in `ui-event.astro:167` to "primary/90, input" in a separate small change, or leave it.
- **Decision**: FIXED: `ui-event.astro:167` now says "primary/90, input"

### F3 — The change's commits are on local `main`, not on a feature branch

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: N/A (git: d9c0ce1..462931e on `main`, not pushed)
- **Detail**: Earlier UI changes merged through PRs from feature branches (#46–#48). These 5 commits sit on local `main` ahead of `origin/main`. Pushing them directly would skip the PR and the PR CI run.
- **Fix**: Create the `group-stats-ui` branch at HEAD, reset local `main` to `origin/main`, push the branch and open a PR that closes #49.
- **Decision**: FIXED: commits moved to branch `group-stats-ui`, local `main` reset to `origin/main`, PR opened
