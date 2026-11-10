<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Signup with Profile and Long Session

- **Plan**: context/changes/signup-with-profile/plan.md
- **Mode**: Deep
- **Date**: 2026-11-09
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | FAIL |

## Grounding
10/10 modified paths ✓ (new `src/types.ts`, `supabase/tests/` correctly absent), 4/4 symbols ✓ (`minimum_password_length = 6`, `@supabase/ssr` cookie `maxAge` 400 days, `[auth.sessions]` commented out, refresh rotation on), brief↔plan ✓

## Findings

### F1 — Phase 2 smoke test needs code from Phase 3

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §7 Smoke test / Progress 2.3
- **Detail**: The "dashboard shows profile nick" step (contains `Smoke`) needs `locals.profile` and the dashboard greeting, which arrive only in Phase 3; in Phase 2 the dashboard shows `user.email`, so 2.3 would fail.
- **Fix**: In Phase 2 the smoke test checks only the redirect to `/dashboard` and status 200; Phase 3 adds the contains-nick assertion.
- **Decision**: FIXED

### F2 — Topbar isn't rendered on /dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State, Phase 3 §5, Progress 3.6/4.4, brief
- **Detail**: `Topbar.astro` is imported only by `Welcome.astro` (landing `/`); `dashboard.astro` does not render it, so "nick in the Topbar on /dashboard" could not be met.
- **Fix A ⭐ Recommended**: Show greeting + nick on the dashboard itself; translate the Topbar but don't add it to `/dashboard`.
  - Strength: Smallest diff; later slices replace the dashboard with real navigation.
  - Tradeoff: Nick in the Topbar is visible only on `/`.
  - Confidence: HIGH — follows from `Welcome.astro:2,18`.
  - Blind spot: None significant.
- **Fix B**: Render `<Topbar />` on `/dashboard` too.
  - Strength: One consistent "who is logged in" element.
  - Tradeoff: Topbar links need 44 px restyling; drifts toward a navigation shell.
  - Confidence: MED — Topbar not checked at 360 px.
  - Blind spot: Whether a navigation shell belongs in S-02.
- **Decision**: FIXED (Fix A)

### F3 — The Phase 4 gate depends on a merge that hasn't happened yet

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Success Criteria / Progress 4.3–4.6
- **Detail**: Production smoke and real-phone/next-day/sign-out checks require the merge and Workers deploy, while Phase 4 must finish (hosted steps, commit) before the merge.
- **Fix**: Move post-deploy checks into a new "Phase 5: Post-deploy verification"; Phase 4 keeps the pre-merge steps.
- **Decision**: FIXED
