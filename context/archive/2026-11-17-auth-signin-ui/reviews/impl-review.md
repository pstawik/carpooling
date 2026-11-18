<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Logowanie i rejestracja na kontrakcie design-systemu, z kolorem autouzupełniania z palety

- **Plan**: context/changes/auth-signin-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-18
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
| Success Criteria | PASS (automated checks not re-run during review: Git Bash crashed with add_item errno 1; Progress records them green at each phase commit) |

## Findings

### F1 — Autofill rule differs from the plan's selector contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/styles/global.css:145-161
- **Detail**: The plan's contract is one selector list `input:autofill, input:-webkit-autofill, input[data-autofill-preview]`. The code has two separate rules and leaves out `:-webkit-autofill`. A comment in the code gives the reason: an unsupported pseudo-class drops the whole selector list, and the build strips the prefixed form anyway. The reason holds, but the plan still describes the old contract.
- **Fix**: Add a one-line addendum to plan.md § Critical Implementation Details that records the split rules and why `:-webkit-autofill` was dropped.
- **Decision**: FIXED — addendum added to plan.md § Critical Implementation Details

### F2 — Smoke does not cover the signed-in redirect on /auth/signup or the ?invite= path

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:229
- **Detail**: The plan asked for a smoke step only for `/auth/signin` → 302 `/dashboard`, and that step exists. The same redirect in `signup.astro:17-19` and the `/join/<invite>` branch on both pages were checked only by hand (3.7).
- **Fix**: Add `["signup page redirects signed-in user", () => request("/auth/signup"), { status: 302, locationExact: "/dashboard" }]` next to the signin step.
- **Decision**: FIXED — step added to scripts/smoke.mjs (the ?invite= branch is still verified only by hand)

### F3 — Duplicated declaration block in the autofill rules

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/styles/global.css:150-161
- **Detail**: `input:autofill` and `input[data-autofill-preview]` have four identical declarations. They are split on purpose (see F1). The risk is that someone later changes one block and not the other, and the kitchen sink stops matching the real autofilled field (criterion 4.6).
- **Fix**: Leave as is, or move the shadow value into a custom property (e.g. `--autofill-shadow`) so each block points to one value.
- **Decision**: FIXED — `--autofill-shadow` defined in `:root`, used by both rules
