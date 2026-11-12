<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Join Group by Invite Link

- **Plan**: context/changes/join-group-by-invite-link/plan.md
- **Mode**: Deep
- **Date**: 2026-11-12
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress↔Phase 22/22 rows ✓. Riskiest claims verified: same-request RPC after `signUp` sees the session (`node_modules/@supabase/ssr/dist/main/cookies.js:350-351`); auth zod schemas strip unknown keys (`src/lib/validation/auth.ts:27-47`); pgcrypto in `extensions`; `getGroupWithAdmins` has a single caller (`src/pages/groups/[id].astro:15`).

## Findings

### F1 — Join endpoint echoes an unvalidated token into a redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 Join endpoint
- **Detail**: "Invalid token format → /join/<token>" puts raw form input into the Location header.
- **Fix**: Malformed token → fixed `/join/invalid`; only a well-formed token goes to `/join/<token>`.
- **Decision**: FIXED

### F2 — Production smoke "after deploy" sits in a phase that must finish before merge

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — Success Criteria 5.2, 5.3 and Implementation Note
- **Detail**: 5.2/5.3 require the deploy, which only happens on merge, while the note said merge only after the phase.
- **Fix**: 5.1 and 5.4 gate the merge; 5.2 and 5.3 are post-merge checks.
- **Decision**: FIXED

### F3 — `(select …)` wrapper around a per-row helper does nothing

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1 — policy `group_invites_select_group_admin`
- **Detail**: initPlan caching only applies to argument-free calls; existing policies call `is_group_member(id)` unwrapped.
- **Fix**: `using (public.is_group_admin(group_id))`.
- **Decision**: FIXED

### F4 — Invite token ends up in Worker request logs

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Open Risks & Assumptions
- **Detail**: `/join/<token>` and `?invite=` URLs are logged by Workers observability; accepted trust level (PRD FR-005) but unstated.
- **Fix**: State the risk in plan (Critical Implementation Details) and brief (Open Risks).
- **Decision**: FIXED
